import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltrosAuditoriaDto } from './dto/filtros-auditoria.dto';

/**
 * Auditoría general (SISTEMA_AUDITORIA, bloque 10 de sql/siam_scripts.sql).
 * Un registro por operación: quién, cuándo (hora de Bolivia que pone la BD),
 * qué módulo y acción, sobre qué documento y el detalle antes → después.
 *
 * La auditoría de productos sigue en SISTEMA_PRODUCTO_AUDITORIA y la de
 * traspasos en SISTEMA_TRASPASO_AUTORIZACION.
 */
export type ModuloAuditoria =
  | 'VENTA' | 'CREDITO' | 'PAGO' | 'DEVOLUCION' | 'TIPO_CAMBIO'
  | 'ROL' | 'ALMACEN' | 'CLIENTE' | 'USUARIO';

export interface EntradaAuditoria {
  cod_usu: string;
  modulo: ModuloAuditoria;
  accion: string;              // CREAR, CONFIRMAR, ANULAR, PAGAR, ASIGNAR, QUITAR, EDITAR…
  documento?: string | null;   // COD_VENTA, COD_CRE, id del rol, alias…
  descripcion: string;         // texto corto legible
  antes?: unknown;             // se guarda como JSON
  despues?: unknown;
}

interface Consultable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);
  private tablaLista: boolean | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async tablaDisponible(): Promise<boolean> {
    if (this.tablaLista) return true;
    const r: { ok: number | null }[] = await this.dataSource.query(
      `SELECT OBJECT_ID('dbo.SISTEMA_AUDITORIA', 'U') as ok`,
    );
    this.tablaLista = r[0]?.ok != null;
    if (!this.tablaLista) {
      this.logger.warn('Falta SISTEMA_AUDITORIA: ejecute el bloque 10 de sql/siam_scripts.sql. No se registra auditoría.');
    }
    return this.tablaLista;
  }

  /**
   * Registra una operación. Pasar el QueryRunner de la transacción en curso
   * para que la auditoría se guarde (o se revierta) junto con la operación.
   * La empresa se toma de la sucursal del usuario. Si la tabla aún no existe,
   * no registra nada (la operación sigue igual).
   */
  async registrar(e: EntradaAuditoria, db: Consultable = this.dataSource): Promise<void> {
    if (!(await this.tablaDisponible())) return;
    const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
    await db.query(`
      INSERT INTO SISTEMA_AUDITORIA (COD_EMP, COD_USU, MODULO, ACCION, DOCUMENTO, DESCRIPCION, DATOS_ANTERIORES, DATOS_NUEVOS)
      SELECT s.COD_EMP, u.COD_USU, @1, @2, @3, @4, @5, @6
      FROM USUARIO u
      INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
      WHERE u.COD_USU = @0
    `, [
      e.cod_usu, e.modulo, e.accion.slice(0, 20), e.documento ? String(e.documento).slice(0, 40) : null,
      e.descripcion.slice(0, 400), json(e.antes), json(e.despues),
    ]);
  }

  /** Igual que registrar, pero nunca hace fallar al llamador (para operaciones ya confirmadas). */
  async registrarSeguro(e: EntradaAuditoria): Promise<void> {
    try {
      await this.registrar(e);
    } catch (err) {
      this.logger.error(`No se pudo registrar la auditoría (${e.modulo}/${e.accion}): ${String(err)}`);
    }
  }

  async listar(f: FiltrosAuditoriaDto, cod_emp: string) {
    if (!(await this.tablaDisponible())) {
      return { data: [], meta: { total: 0, page: 1, limit: f.limit ?? 50, totalPages: 0 }, tablaDisponible: false };
    }
    const page = f.page ?? 1;
    const limit = f.limit ?? 50;
    const params: unknown[] = [cod_emp];
    const where: string[] = ['a.COD_EMP = @0'];
    const add = (cond: (i: number) => string, valor: unknown) => {
      params.push(valor);
      where.push(cond(params.length - 1));
    };
    if (f.fecha_ini) add((i) => `a.FECHA >= @${i}`, f.fecha_ini);
    if (f.fecha_fin) add((i) => `a.FECHA <= @${i}`, f.fecha_fin);
    if (f.modulo) add((i) => `a.MODULO = @${i}`, f.modulo);
    if (f.accion) add((i) => `a.ACCION = @${i}`, f.accion);
    if (f.cod_usu) add((i) => `a.COD_USU = @${i}`, f.cod_usu);
    if (f.q?.trim()) {
      add((i) => `(a.DOCUMENTO LIKE @${i} OR a.DESCRIPCION LIKE @${i} COLLATE SQL_Latin1_General_CP1_CI_AI)`,
        `%${f.q.trim().replace(/[[%_]/g, (c) => `[${c}]`)}%`);
    }
    const filtro = where.join(' AND ');

    const total = Number((await this.dataSource.query(
      `SELECT COUNT_BIG(*) as total FROM SISTEMA_AUDITORIA a WHERE ${filtro}`, params,
    ))[0]?.total ?? 0);

    params.push((page - 1) * limit, limit);
    const filas = await this.dataSource.query(`
      SELECT a.ID_AUD as id, CONVERT(VARCHAR(10), a.FECHA, 23) as fecha, CONVERT(VARCHAR(8), a.HORA, 108) as hora,
             a.MODULO as modulo, a.ACCION as accion, a.DOCUMENTO as documento, a.DESCRIPCION as descripcion,
             a.COD_USU as codUsu, u.ALIAS as alias,
             LTRIM(RTRIM(ISNULL(u.NOM_USU, '') + ' ' + ISNULL(u.AP_USU, ''))) as nombreUsuario,
             a.DATOS_ANTERIORES as antes, a.DATOS_NUEVOS as despues
      FROM SISTEMA_AUDITORIA a
      LEFT JOIN USUARIO u ON u.COD_USU = a.COD_USU
      WHERE ${filtro}
      ORDER BY a.FECHA_HORA DESC, a.ID_AUD DESC
      OFFSET @${params.length - 2} ROWS FETCH NEXT @${params.length - 1} ROWS ONLY
    `, params);

    const parse = (t: string | null) => {
      if (!t) return null;
      try { return JSON.parse(t); } catch { return t; }
    };
    return {
      data: filas.map((r: any) => ({ ...r, antes: parse(r.antes), despues: parse(r.despues) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      tablaDisponible: true,
    };
  }

  /** Usuarios que aparecen en la auditoría de la empresa (para el filtro). */
  async usuariosConRegistros(cod_emp: string) {
    if (!(await this.tablaDisponible())) return [];
    return this.dataSource.query(`
      SELECT DISTINCT a.COD_USU as codUsu, u.ALIAS as alias,
             LTRIM(RTRIM(ISNULL(u.NOM_USU, '') + ' ' + ISNULL(u.AP_USU, ''))) as nombre
      FROM SISTEMA_AUDITORIA a
      LEFT JOIN USUARIO u ON u.COD_USU = a.COD_USU
      WHERE a.COD_EMP = @0
      ORDER BY nombre
    `, [cod_emp]);
  }
}
