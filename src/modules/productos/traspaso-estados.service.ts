import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

/**
 * Estado de una salida (traspaso SALIDA_VENTA, hacia MOTOR ZONE):
 *   COMPLETADO  el vendedor se llevó los productos (firmaron encargado y vendedor)
 *   PARCIAL     el vendedor devolvió una parte al almacén
 *   DEVUELTO    el vendedor devolvió todo
 *
 * El almacén no sabe si un producto se vendió: la salida no se enlaza con
 * ventas ni créditos. Solo se sigue cuánto se llevó y cuánto devolvió.
 */
export type EstadoSalida = 'COMPLETADO' | 'PARCIAL' | 'DEVUELTO';

@Injectable()
export class TraspasoEstadosService {
  private readonly logger = new Logger(TraspasoEstadosService.name);
  private tablasListas = false;

  constructor(private readonly dataSource: DataSource) {}

  /** SISTEMA_TRASPASO_DET (bloque 5 de sql/siam_scripts.sql) guarda cuánto se llevó y devolvió. */
  async tablasDisponibles(): Promise<boolean> {
    if (this.tablasListas) return true;
    const filas: { det: number | null }[] = await this.dataSource.query(`
      SELECT OBJECT_ID('dbo.SISTEMA_TRASPASO_DET', 'U') as det
    `);
    this.tablasListas = filas[0]?.det != null;
    if (!this.tablasListas) {
      this.logger.warn('Falta SISTEMA_TRASPASO_DET: ejecute sql/siam_scripts.sql. No se podrán registrar devoluciones de salidas.');
    }
    return this.tablasListas;
  }

  /** Guarda el detalle de una salida recién registrada. */
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

  /** Registra unidades devueltas al almacén de origen (ya validadas por el llamador). */
  async registrarDevuelto(qr: QueryRunner, idTad: number, cantidad: number): Promise<void> {
    await qr.query(
      `UPDATE SISTEMA_TRASPASO_DET SET CANT_DEVUELTA = CANT_DEVUELTA + @0 WHERE ID_TAD = @1`,
      [cantidad, idTad],
    );
  }

  /** Recalcula el estado de una salida según lo devuelto. */
  async recalcularEstado(qr: QueryRunner, idTa: number): Promise<EstadoSalida> {
    const filas: { total: number | null; devuelta: number | null }[] = await qr.query(
      `
      SELECT SUM(CANTIDAD) as total, SUM(CANT_DEVUELTA) as devuelta
      FROM SISTEMA_TRASPASO_DET
      WHERE ID_TA = @0
    `,
      [idTa],
    );
    const total = Number(filas[0]?.total ?? 0);
    const devuelta = Number(filas[0]?.devuelta ?? 0);
    const estado: EstadoSalida = devuelta <= 0 ? 'COMPLETADO' : devuelta >= total ? 'DEVUELTO' : 'PARCIAL';

    await qr.query(
      `
      UPDATE SISTEMA_TRASPASO_AUTORIZACION
      SET ESTADO = @1
      WHERE ID_TA = @0 AND TIPO = 'SALIDA_VENTA'
    `,
      [idTa, estado],
    );
    return estado;
  }
}
