import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export type EstadoSalidaVenta = 'PENDIENTE' | 'VENDIDO' | 'DEVUELTO';

interface DetallePendiente {
  idTad: number;
  idTa: number;
  pendiente: number;
}

/**
 * Seguimiento de las salidas a venta (traspasos SALIDA_VENTA):
 * cuánto se llevó el vendedor de cada producto, cuánto vendió y cuánto devolvió.
 *
 *   PENDIENTE  queda algo sin vender ni devolver
 *   VENDIDO    todo resuelto y al menos una unidad vendida
 *   DEVUELTO   todo resuelto y nada vendido
 *
 * Todos los métodos reciben el QueryRunner de la transacción en curso: el
 * seguimiento se guarda (o se revierte) junto con la venta o el traspaso.
 */
@Injectable()
export class TraspasoEstadosService {
  private readonly logger = new Logger(TraspasoEstadosService.name);
  private tablasListas = false;

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Las ventas no deben fallar si todavía no se ejecutó sql/siam_scripts.sql
   * (bloques 5 y 6): en ese caso el seguimiento simplemente se omite.
   */
  async tablasDisponibles(): Promise<boolean> {
    if (this.tablasListas) return true;
    const filas: { det: number | null; venta: number | null }[] = await this.dataSource.query(`
      SELECT OBJECT_ID('dbo.SISTEMA_TRASPASO_DET', 'U')   as det,
             OBJECT_ID('dbo.SISTEMA_TRASPASO_VENTA', 'U') as venta
    `);
    this.tablasListas = filas[0]?.det != null && filas[0]?.venta != null;
    if (!this.tablasListas) {
      this.logger.warn(
        'Faltan SISTEMA_TRASPASO_DET / SISTEMA_TRASPASO_VENTA: ejecute sql/siam_scripts.sql. ' +
        'Mientras tanto no se actualiza el estado de los traspasos.',
      );
    }
    return this.tablasListas;
  }

  /** Guarda el detalle de una salida a venta recién registrada. */
  async registrarDetalle(
    qr: QueryRunner,
    idTa: number,
    items: { id_fab: number; cod_fab: string; cantidad: number }[],
  ): Promise<void> {
    if (!(await this.tablasDisponibles())) return;
    for (const it of items) {
      await qr.query(
        `
        INSERT INTO SISTEMA_TRASPASO_DET (ID_TA, ID_FAB, COD_FAB, CANTIDAD)
        VALUES (@0, @1, @2, @3)
      `,
        [idTa, it.id_fab, it.cod_fab, it.cantidad],
      );
    }
  }

  /**
   * Al registrar una venta o un crédito: descuenta lo vendido de las salidas
   * a venta pendientes que firmó ese mismo vendedor (primero las más antiguas)
   * y actualiza su estado. Lo que el vendedor venda de stock que ya estaba en
   * MOTOR ZONE y no venía de un traspaso suyo no afecta a ningún traspaso.
   */
  async asignarVenta(
    qr: QueryRunner,
    venta: {
      cod_usu: string;
      tipoDoc: 'VENTA' | 'CREDITO';
      codDoc: string;
      items: { id_fab: number; cantidad: number }[];
    },
  ): Promise<void> {
    if (!(await this.tablasDisponibles())) return;
    const afectados = new Set<number>();

    for (const item of venta.items) {
      let restante = Number(item.cantidad);
      if (!(restante > 0)) continue;

      // UPDLOCK: dos ventas simultáneas no pueden tomar las mismas unidades
      const pendientes: DetallePendiente[] = await qr.query(
        `
        SELECT d.ID_TAD as idTad, d.ID_TA as idTa,
               d.CANTIDAD - d.CANT_VENDIDA - d.CANT_DEVUELTA as pendiente
        FROM SISTEMA_TRASPASO_DET d WITH (UPDLOCK, ROWLOCK)
        INNER JOIN SISTEMA_TRASPASO_AUTORIZACION ta ON ta.ID_TA = d.ID_TA
        WHERE d.ID_FAB = @0
          AND ta.TIPO = 'SALIDA_VENTA'
          AND ta.ESTADO = 'PENDIENTE'
          AND ta.COD_USU_FIRMANTE = @1
          AND d.CANTIDAD - d.CANT_VENDIDA - d.CANT_DEVUELTA > 0
        ORDER BY ta.FECHA_HORA ASC, d.ID_TAD ASC
      `,
        [item.id_fab, venta.cod_usu],
      );

      for (const p of pendientes) {
        if (restante <= 0) break;
        const tomar = Math.min(restante, Number(p.pendiente));
        await qr.query(
          `UPDATE SISTEMA_TRASPASO_DET SET CANT_VENDIDA = CANT_VENDIDA + @0 WHERE ID_TAD = @1`,
          [tomar, p.idTad],
        );
        await qr.query(
          `
          INSERT INTO SISTEMA_TRASPASO_VENTA (ID_TAD, TIPO_DOC, COD_DOC, CANTIDAD)
          VALUES (@0, @1, @2, @3)
        `,
          [p.idTad, venta.tipoDoc, venta.codDoc, tomar],
        );
        afectados.add(Number(p.idTa));
        restante -= tomar;
      }
    }

    for (const idTa of afectados) {
      await this.recalcularEstado(qr, idTa, venta.codDoc);
    }
  }

  /**
   * Al anular una venta o un crédito: las unidades que habían salido de una
   * salida a venta se dan por devueltas a su almacén de origen.
   * Actualiza el seguimiento (vendida → devuelta), marca lo anulado en
   * SISTEMA_TRASPASO_VENTA y recalcula el estado de cada traspaso.
   * Devuelve qué hay que mover físicamente de vuelta y a qué almacén; el
   * movimiento de stock lo hace el llamador.
   *
   * `items` es lo que realmente se anula por producto (lo vendido menos lo
   * que ya se devolvió por otra vía); nunca se revierte más que eso.
   */
  async revertirVenta(
    qr: QueryRunner,
    venta: { tipoDoc: 'VENTA' | 'CREDITO'; codDoc: string; items: { id_fab: number; cantidad: number }[] },
  ): Promise<{ idTa: number; sucOri: string; sucDes: string; id_fab: number; cantidad: number }[]> {
    if (!(await this.tablasDisponibles())) return [];
    if (!(await this.columnaAnuladaDisponible(qr))) {
      this.logger.warn('Falta la columna CANT_ANULADA (bloque 8 de sql/siam_scripts.sql): no se revierten traspasos.');
      return [];
    }

    // Lo más reciente primero: se revierte en orden inverso a como se asignó
    const filas: {
      idTv: number; idTad: number; idTa: number; idFab: number; vigente: number; sucOri: string; sucDes: string;
    }[] = await qr.query(
      `
      SELECT v.ID_TV as idTv, v.ID_TAD as idTad, d.ID_TA as idTa, d.ID_FAB as idFab,
             v.CANTIDAD - v.CANT_ANULADA as vigente,
             ta.SUC_ORI as sucOri, ta.SUC_DES as sucDes
      FROM SISTEMA_TRASPASO_VENTA v WITH (UPDLOCK, ROWLOCK)
      INNER JOIN SISTEMA_TRASPASO_DET d ON d.ID_TAD = v.ID_TAD
      INNER JOIN SISTEMA_TRASPASO_AUTORIZACION ta ON ta.ID_TA = d.ID_TA
      WHERE v.TIPO_DOC = @0 AND v.COD_DOC = @1
        AND v.CANTIDAD - v.CANT_ANULADA > 0
      ORDER BY v.ID_TV DESC
    `,
      [venta.tipoDoc, venta.codDoc],
    );

    const restante = new Map<number, number>();
    for (const it of venta.items) {
      restante.set(it.id_fab, (restante.get(it.id_fab) ?? 0) + Math.max(0, Number(it.cantidad)));
    }

    const regresos: { idTa: number; sucOri: string; sucDes: string; id_fab: number; cantidad: number }[] = [];
    const afectados = new Set<number>();
    for (const f of filas) {
      const idFab = Number(f.idFab);
      const disponible = restante.get(idFab) ?? 0;
      const q = Math.min(disponible, Number(f.vigente));
      if (q <= 0) continue;
      await qr.query(
        `UPDATE SISTEMA_TRASPASO_VENTA SET CANT_ANULADA = CANT_ANULADA + @0 WHERE ID_TV = @1`,
        [q, f.idTv],
      );
      await qr.query(
        `
        UPDATE SISTEMA_TRASPASO_DET
        SET CANT_VENDIDA = CANT_VENDIDA - @0, CANT_DEVUELTA = CANT_DEVUELTA + @0
        WHERE ID_TAD = @1
      `,
        [q, f.idTad],
      );
      restante.set(idFab, disponible - q);
      afectados.add(Number(f.idTa));
      const previo = regresos.find((r) => r.idTa === Number(f.idTa) && r.id_fab === idFab);
      if (previo) previo.cantidad += q;
      else regresos.push({ idTa: Number(f.idTa), sucOri: f.sucOri, sucDes: f.sucDes, id_fab: idFab, cantidad: q });
    }

    for (const idTa of afectados) {
      await this.recalcularEstado(qr, idTa);
    }
    return regresos;
  }

  private async columnaAnuladaDisponible(qr: QueryRunner): Promise<boolean> {
    const r: { ok: number | null }[] = await qr.query(
      `SELECT COL_LENGTH('dbo.SISTEMA_TRASPASO_VENTA', 'CANT_ANULADA') as ok`,
    );
    return r[0]?.ok != null;
  }

  /** Registra unidades devueltas al almacén de origen (ya validadas por el llamador). */
  async registrarDevuelto(qr: QueryRunner, idTad: number, cantidad: number): Promise<void> {
    await qr.query(
      `UPDATE SISTEMA_TRASPASO_DET SET CANT_DEVUELTA = CANT_DEVUELTA + @0 WHERE ID_TAD = @1`,
      [cantidad, idTad],
    );
  }

  /** Recalcula el estado de una salida a venta a partir de su detalle. */
  async recalcularEstado(qr: QueryRunner, idTa: number, codDoc?: string): Promise<EstadoSalidaVenta> {
    const filas: { total: number | null; vendida: number | null; devuelta: number | null }[] =
      await qr.query(
        `
        SELECT SUM(CANTIDAD) as total, SUM(CANT_VENDIDA) as vendida, SUM(CANT_DEVUELTA) as devuelta
        FROM SISTEMA_TRASPASO_DET
        WHERE ID_TA = @0
      `,
        [idTa],
      );
    const total = Number(filas[0]?.total ?? 0);
    const vendida = Number(filas[0]?.vendida ?? 0);
    const devuelta = Number(filas[0]?.devuelta ?? 0);

    const estado: EstadoSalidaVenta =
      vendida + devuelta < total ? 'PENDIENTE' : vendida > 0 ? 'VENDIDO' : 'DEVUELTO';

    if (codDoc) {
      // COD_VENTA guarda el último documento (venta o crédito) en que salió producto
      await qr.query(
        `
        UPDATE SISTEMA_TRASPASO_AUTORIZACION
        SET ESTADO = @1, COD_VENTA = @2
        WHERE ID_TA = @0 AND TIPO = 'SALIDA_VENTA'
      `,
        [idTa, estado, codDoc],
      );
    } else {
      await qr.query(
        `
        UPDATE SISTEMA_TRASPASO_AUTORIZACION
        SET ESTADO = @1
        WHERE ID_TA = @0 AND TIPO = 'SALIDA_VENTA'
      `,
        [idTa, estado],
      );
    }
    return estado;
  }
}
