import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryRunner } from 'typeorm';

/**
 * Registro de devoluciones firmadas (SISTEMA_DEVOLUCION_REGISTRO, bloque 9 de
 * sql/siam_scripts.sql). Una fila por producto; las filas de una misma
 * operación comparten ID_GRUPO.
 */
export interface FilaRegistroDevolucion {
  movimiento: 'DEVUELVE' | 'LLEVA';
  id_fab: number;
  cod_fab: string;
  cantidad: number;
  precio: number;
  cod_suc: string;
}

export interface CabeceraRegistroDevolucion {
  tipoDoc: 'VENTA' | 'CREDITO';
  codDoc: string;
  codDevc?: number | null;
  codEmp: string;
  codUsuRegistra: string;
  codUsuFirmante: string;
  codVentaCambio?: string | null;
  obs?: string | null;
}

export async function asegurarTablaRegistro(qr: QueryRunner): Promise<void> {
  const r: { ok: number | null }[] = await qr.query(
    `SELECT OBJECT_ID('dbo.SISTEMA_DEVOLUCION_REGISTRO', 'U') as ok`,
  );
  if (r[0]?.ok == null) {
    throw new BadRequestException(
      'Falta ejecutar el bloque 9 de sql/siam_scripts.sql (SISTEMA_DEVOLUCION_REGISTRO) para registrar devoluciones firmadas.',
    );
  }
}

/** Inserta las filas y devuelve el grupo con la fecha y hora de Bolivia que puso la BD. */
export async function guardarRegistroDevolucion(
  qr: QueryRunner,
  cab: CabeceraRegistroDevolucion,
  filas: FilaRegistroDevolucion[],
): Promise<{ idGrupo: string; fecha: string | null; hora: string | null }> {
  const idGrupo = randomUUID();
  let fecha: string | null = null;
  let hora: string | null = null;
  for (const f of filas) {
    const out: { fecha: string; hora: string }[] = await qr.query(`
      INSERT INTO SISTEMA_DEVOLUCION_REGISTRO (
        ID_GRUPO, TIPO_DOC, COD_DOC, COD_DEVC, MOVIMIENTO,
        ID_FAB, COD_FAB, CANTIDAD, PRECIO, TOTAL, COD_SUC,
        COD_EMP, COD_USU_REGISTRA, COD_USU_FIRMANTE, COD_VENTA_CAMBIO, OBS
      )
      OUTPUT CONVERT(VARCHAR(10), INSERTED.FECHA, 23) AS fecha,
             CONVERT(VARCHAR(8),  INSERTED.HORA, 108) AS hora
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @15)
    `, [
      idGrupo, cab.tipoDoc, cab.codDoc, cab.codDevc ?? null, f.movimiento,
      f.id_fab, f.cod_fab, f.cantidad, f.precio, Math.round(f.cantidad * f.precio * 10000) / 10000, f.cod_suc,
      cab.codEmp, cab.codUsuRegistra, cab.codUsuFirmante, cab.codVentaCambio ?? null,
      (cab.obs ?? '').slice(0, 512) || null,
    ]);
    fecha = out[0]?.fecha ?? fecha;
    hora = out[0]?.hora ?? hora;
  }
  return { idGrupo, fecha, hora };
}

/**
 * Devoluciones registradas de un documento (para mostrar quién la hizo y quién firmó).
 * Si la tabla todavía no existe, devuelve [].
 */
export async function listarRegistroDevoluciones(
  db: { query(sql: string, params?: unknown[]): Promise<any> },
  tipoDoc: 'VENTA' | 'CREDITO',
  codDoc: string,
) {
  const existe: { ok: number | null }[] = await db.query(
    `SELECT OBJECT_ID('dbo.SISTEMA_DEVOLUCION_REGISTRO', 'U') as ok`,
  );
  if (existe[0]?.ok == null) return [];
  const filas: any[] = await db.query(`
    SELECT r.ID_GRUPO as idGrupo, CONVERT(VARCHAR(10), r.FECHA, 23) as fecha,
           CONVERT(VARCHAR(8), r.HORA, 108) as hora, r.MOVIMIENTO as movimiento,
           r.ID_FAB as idFab, r.COD_FAB as codFab, p.DESC_PRO as descPro,
           r.CANTIDAD as cantidad, r.PRECIO as precio, r.TOTAL as total,
           r.COD_SUC as codSuc, s.NOM_SUC as nomSuc, r.COD_VENTA_CAMBIO as codVentaCambio, r.OBS as obs,
           r.COD_USU_REGISTRA as codUsuRegistra,
           LTRIM(RTRIM(ISNULL(ur.NOM_USU, '') + ' ' + ISNULL(ur.AP_USU, ''))) as nombreRegistra,
           r.COD_USU_FIRMANTE as codUsuFirmante,
           LTRIM(RTRIM(ISNULL(uf.NOM_USU, '') + ' ' + ISNULL(uf.AP_USU, ''))) as nombreFirmante
    FROM SISTEMA_DEVOLUCION_REGISTRO r
    LEFT JOIN USUARIO ur ON ur.COD_USU = r.COD_USU_REGISTRA
    LEFT JOIN USUARIO uf ON uf.COD_USU = r.COD_USU_FIRMANTE
    LEFT JOIN SUCURSAL s ON s.COD_SUC = r.COD_SUC
    LEFT JOIN PROV_PRO pp ON pp.ID_FAB = r.ID_FAB
    LEFT JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
    WHERE r.TIPO_DOC = @0 AND r.COD_DOC = @1
    ORDER BY r.FECHA_HORA DESC, r.ID_DR ASC
  `, [tipoDoc, codDoc]);

  // Agrupar por operación
  const grupos = new Map<string, any>();
  for (const f of filas) {
    let g = grupos.get(f.idGrupo);
    if (!g) {
      g = {
        idGrupo: f.idGrupo, fecha: f.fecha, hora: f.hora, codVentaCambio: f.codVentaCambio, obs: f.obs,
        registra: { codUsu: f.codUsuRegistra, nombre: f.nombreRegistra },
        firmante: { codUsu: f.codUsuFirmante, nombre: f.nombreFirmante },
        items: [],
      };
      grupos.set(f.idGrupo, g);
    }
    g.items.push({
      movimiento: f.movimiento, idFab: f.idFab, codFab: f.codFab, descPro: f.descPro,
      cantidad: Number(f.cantidad), precio: Number(f.precio), total: Number(f.total),
      codSuc: f.codSuc, nomSuc: f.nomSuc,
    });
  }
  return [...grupos.values()];
}
