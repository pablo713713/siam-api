import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { UsuariosService } from '../usuarios/usuarios.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  AuditoriaProductosDto,
  CrearProductoDto,
  EditarProductoDto,
} from './dto/producto-gestion.dto';

/** Foto de un producto: lo que se muestra, se edita y se guarda en la auditoría. */
export interface ProductoSnapshot {
  idPro: number;
  idFab: number;
  codPro: string | null;
  codFab: string | null;
  descPro: string;
  codProv: string;
  marca: string | null; // PROVEEDOR.NOM_PROV
  codMod: number;
  modelo: string | null;
  codigoTipo: string;
  tipo: string | null;
  unidad: string | null;
  barra: string;
  codAnt: string;
  comentario: string;
  plisPro: number;
  pminPro: number;
  pmayPro: number;
  plisBs: number;
  pminBs: number;
  pmayBs: number;
  cifCbba: number;
}

type CampoEditable = Exclude<keyof ProductoSnapshot, 'idPro' | 'idFab' | 'codPro' | 'codFab' | 'marca' | 'modelo' | 'tipo'>;

// Campo de la API → tabla y columna legacy. Solo estos campos se pueden editar.
const COLUMNAS: Record<CampoEditable, { tabla: 'PRODUCTO' | 'PROV_PRO'; columna: string; numero?: boolean }> = {
  descPro:    { tabla: 'PRODUCTO', columna: 'DESC_PRO' },
  codMod:     { tabla: 'PRODUCTO', columna: 'COD_MOD', numero: true },
  codigoTipo: { tabla: 'PRODUCTO', columna: 'CODIGO' },
  unidad:     { tabla: 'PRODUCTO', columna: 'UNIDAD' },
  codProv:    { tabla: 'PROV_PRO', columna: 'COD_PROV' },
  barra:      { tabla: 'PROV_PRO', columna: 'barra' },
  codAnt:     { tabla: 'PROV_PRO', columna: 'COD_ANT' },
  comentario: { tabla: 'PROV_PRO', columna: 'COMENTARIO' },
  plisPro:    { tabla: 'PROV_PRO', columna: 'PLIS_PRO', numero: true },
  pminPro:    { tabla: 'PROV_PRO', columna: 'PMIN_PRO', numero: true },
  pmayPro:    { tabla: 'PROV_PRO', columna: 'PMAY_PRO', numero: true },
  plisBs:     { tabla: 'PROV_PRO', columna: 'PLIS_BS', numero: true },
  pminBs:     { tabla: 'PROV_PRO', columna: 'PMIN_BS', numero: true },
  pmayBs:     { tabla: 'PROV_PRO', columna: 'PMAY_BS', numero: true },
  cifCbba:    { tabla: 'PROV_PRO', columna: 'CIF_CBBA', numero: true },
};
const CAMPOS_EDITABLES = Object.keys(COLUMNAS) as CampoEditable[];

const redondear = (n: unknown) => Math.round(Number(n ?? 0) * 10000) / 10000;

// Marcas / proveedores válidos para una empresa: los suyos y los que ya usan
// sus productos (en la BD legacy hay proveedores compartidos entre empresas)
const PROVEEDOR_DE_EMPRESA = `(
  pr.COD_EMP = CAST(@EMP AS VARCHAR(3))
  OR pr.COD_PROV IN (
    SELECT pp.COD_PROV
    FROM PROV_PRO pp
    INNER JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
    WHERE p.COD_EMP = CAST(@EMP AS VARCHAR(3))
  )
)`;

type Ejecutor = Pick<QueryRunner, 'query'> | DataSource;

/**
 * Alta y edición de productos (tablas legacy PRODUCTO y PROV_PRO) con rastro
 * en SISTEMA_PRODUCTO_AUDITORIA: quién, cuándo y los datos antes y después.
 */
@Injectable()
export class ProductosGestionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usuariosService: UsuariosService,
  ) {}

  // ─────────────────────────────────────────
  // Catálogos para los formularios
  // ─────────────────────────────────────────
  async getCatalogos(cod_emp: string) {
    const [proveedores, tipos, modelos] = await Promise.all([
      this.dataSource.query(`
        SELECT pr.COD_PROV as codProv, pr.NOM_PROV as nomProv
        FROM PROVEEDOR pr
        WHERE ${PROVEEDOR_DE_EMPRESA.replaceAll('@EMP', '@0')}
        ORDER BY pr.NOM_PROV ASC
      `, [cod_emp]),
      this.dataSource.query(`
        SELECT CODIGO as codigo, DESCRIPCION as descripcion
        FROM TIPO_PRODUCTO
        ORDER BY DESCRIPCION ASC
      `),
      this.dataSource.query(`
        SELECT mo.COD_MODELO as codMod, mo.NOM_MODELO as nomModelo, ma.NOM_MARCA as nomMarca
        FROM MODELO mo
        LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
        ORDER BY mo.NOM_MODELO ASC
      `),
    ]);
    return { proveedores, tipos, modelos };
  }

  // ─────────────────────────────────────────
  // Datos actuales de un producto (para el formulario de edición)
  // ─────────────────────────────────────────
  async getProducto(idFab: number, cod_emp: string): Promise<ProductoSnapshot> {
    const snap = await this.leerSnapshot(this.dataSource, idFab, cod_emp);
    if (!snap) throw new NotFoundException('Producto no encontrado.');
    return snap;
  }

  private async leerSnapshot(db: Ejecutor, idFab: number, cod_emp: string): Promise<ProductoSnapshot | null> {
    const filas: Record<string, unknown>[] = await db.query(`
      SELECT
        p.ID_PRO as idPro, pp.ID_FAB as idFab, p.COD_PRO as codPro, pp.COD_FAB as codFab,
        p.DESC_PRO as descPro,
        pp.COD_PROV as codProv, pr.NOM_PROV as marca,
        p.COD_MOD as codMod, mo.NOM_MODELO as modelo,
        p.CODIGO as codigoTipo, tp.DESCRIPCION as tipo,
        p.UNIDAD as unidad,
        pp.barra as barra, pp.COD_ANT as codAnt, pp.COMENTARIO as comentario,
        ISNULL(pp.PLIS_PRO, 0) as plisPro, ISNULL(pp.PMIN_PRO, 0) as pminPro, ISNULL(pp.PMAY_PRO, 0) as pmayPro,
        pp.PLIS_BS as plisBs, pp.PMIN_BS as pminBs, pp.PMAY_BS as pmayBs,
        ISNULL(pp.CIF_CBBA, 0) as cifCbba
      FROM PROV_PRO pp
      INNER JOIN PRODUCTO p        ON p.ID_PRO = pp.ID_PRO
      LEFT JOIN PROVEEDOR pr       ON pr.COD_PROV = pp.COD_PROV
      LEFT JOIN MODELO mo          ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN TIPO_PRODUCTO tp   ON tp.CODIGO = p.CODIGO
      WHERE pp.ID_FAB = @0 AND p.COD_EMP = CAST(@1 AS VARCHAR(3))
    `, [idFab, cod_emp]);
    const f = filas[0];
    if (!f) return null;
    return {
      idPro: Number(f.idPro),
      idFab: Number(f.idFab),
      codPro: (f.codPro as string) ?? null,
      codFab: (f.codFab as string) ?? null,
      descPro: String(f.descPro ?? ''),
      codProv: String(f.codProv ?? ''),
      marca: (f.marca as string) ?? null,
      codMod: Number(f.codMod),
      modelo: (f.modelo as string) ?? null,
      codigoTipo: String(f.codigoTipo ?? ''),
      tipo: (f.tipo as string) ?? null,
      unidad: (f.unidad as string) ?? null,
      barra: String(f.barra ?? ''),
      codAnt: String(f.codAnt ?? ''),
      comentario: String(f.comentario ?? ''),
      plisPro: redondear(f.plisPro),
      pminPro: redondear(f.pminPro),
      pmayPro: redondear(f.pmayPro),
      plisBs: redondear(f.plisBs),
      pminBs: redondear(f.pminBs),
      pmayBs: redondear(f.pmayBs),
      cifCbba: redondear(f.cifCbba),
    };
  }

  // Marca / proveedor, modelo y tipo deben existir (y el proveedor ser de la empresa)
  private async validarReferencias(
    db: Ejecutor,
    cod_emp: string,
    ref: { codProv?: string; codMod?: number; codigoTipo?: string },
  ) {
    if (ref.codProv !== undefined) {
      const r = await db.query(
        `SELECT 1 as ok FROM PROVEEDOR pr WHERE pr.COD_PROV = @0 AND ${PROVEEDOR_DE_EMPRESA.replaceAll('@EMP', '@1')}`,
        [ref.codProv, cod_emp],
      );
      if (r.length === 0) throw new BadRequestException('La marca / proveedor seleccionado no existe.');
    }
    if (ref.codMod !== undefined) {
      const r = await db.query(`SELECT 1 as ok FROM MODELO WHERE COD_MODELO = @0`, [ref.codMod]);
      if (r.length === 0) throw new BadRequestException('El modelo seleccionado no existe.');
    }
    if (ref.codigoTipo !== undefined) {
      const r = await db.query(`SELECT 1 as ok FROM TIPO_PRODUCTO WHERE CODIGO = @0`, [ref.codigoTipo]);
      if (r.length === 0) throw new BadRequestException('El tipo de producto seleccionado no existe.');
    }
  }

  private async registrarAuditoria(
    qr: QueryRunner,
    accion: 'CREAR' | 'EDITAR',
    usuario: JwtPayload,
    cod_emp: string,
    anterior: ProductoSnapshot | null,
    nuevo: ProductoSnapshot,
    campos: string[],
  ) {
    // Fecha y hora las pone SQL Server en hora de Bolivia (DEFAULT de la tabla)
    const filas: { idPa: number; fecha: string; hora: string }[] = await qr.query(
      `
      INSERT INTO SISTEMA_PRODUCTO_AUDITORIA (
        ACCION, ID_PRO, ID_FAB, COD_FAB, DESC_PRO, COD_USU, COD_EMP,
        CAMPOS, DATOS_ANTERIORES, DATOS_NUEVOS
      )
      OUTPUT
        INSERTED.ID_PA                            AS idPa,
        CONVERT(VARCHAR(10), INSERTED.FECHA, 23)  AS fecha,
        CONVERT(VARCHAR(8),  INSERTED.HORA, 108)  AS hora
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9)
    `,
      [
        accion, nuevo.idPro, nuevo.idFab, nuevo.codFab ?? '', nuevo.descPro,
        usuario.cod_usu, cod_emp,
        campos.join(',').slice(0, 500),
        anterior ? JSON.stringify(anterior) : '', // '' = sin datos anteriores (alta)
        JSON.stringify(nuevo),
      ],
    );
    return filas[0];
  }

  // ─────────────────────────────────────────
  // Registrar un producto nuevo
  // ─────────────────────────────────────────
  async crear(dto: CrearProductoDto, usuario: JwtPayload, cod_emp: string) {
    const descPro = dto.descPro.trim();
    const codPro = dto.codPro.trim();
    const codFab = dto.codFab.trim();
    if (!descPro || !codPro || !codFab) {
      throw new BadRequestException('Descripción, código de producto y código de fábrica son obligatorios.');
    }
    const codMod = dto.codMod ?? 1;         // valores por defecto de la BD legacy
    const codigoTipo = dto.codigoTipo ?? '1';
    await this.validarReferencias(this.dataSource, cod_emp, { codProv: dto.codProv, codMod, codigoTipo });

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Códigos únicos dentro de la empresa
      const mismoCodPro = await qr.query(
        `SELECT TOP 1 ID_PRO FROM PRODUCTO WHERE COD_PRO = @0 AND COD_EMP = CAST(@1 AS VARCHAR(3))`,
        [codPro, cod_emp],
      );
      if (mismoCodPro.length > 0) {
        throw new ConflictException(`Ya existe un producto con el código ${codPro}.`);
      }
      const mismoCodFab = await qr.query(
        `
        SELECT TOP 1 pp.ID_FAB
        FROM PROV_PRO pp
        INNER JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
        WHERE pp.COD_FAB = @0 AND p.COD_EMP = CAST(@1 AS VARCHAR(3))
      `,
        [codFab, cod_emp],
      );
      if (mismoCodFab.length > 0) {
        throw new ConflictException(`Ya existe un producto con el código de fábrica ${codFab}.`);
      }

      // SCOPE_IDENTITY en lugar de OUTPUT: sigue funcionando si la tabla legacy
      // tuviera triggers
      const producto: { idPro: number }[] = await qr.query(
        `
        INSERT INTO PRODUCTO (COD_PRO, DESC_PRO, UNIDAD, ESTADO, COD_EMP, COD_MOD, CODIGO)
        VALUES (@0, @1, @2, 'A', @3, @4, @5);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS idPro;
      `,
        [codPro, descPro, (dto.unidad?.trim() || 'PZA').toUpperCase(), cod_emp, codMod, codigoTipo],
      );
      const idPro = Number(producto[0]?.idPro);
      if (!idPro) throw new BadRequestException('No se pudo registrar el producto.');

      const provPro: { idFab: number }[] = await qr.query(
        `
        INSERT INTO PROV_PRO (
          COD_PROV, COD_PRO, COD_FAB, ID_PRO,
          PLIS_PRO, PMIN_PRO, PMAY_PRO, PLIS_BS, PMIN_BS, PMAY_BS, CIF_CBBA,
          barra, COD_ANT, COMENTARIO, USUARIO_DESCARGA
        )
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS idFab;
      `,
        [
          dto.codProv, codPro, codFab, idPro,
          dto.plisPro ?? 0, dto.pminPro ?? 0, dto.pmayPro ?? 0,
          dto.plisBs ?? 0, dto.pminBs ?? 0, dto.pmayBs ?? 0, dto.cifCbba ?? 0,
          dto.barra?.trim() || '0',   // '0' = sin código de barras (valor por defecto legacy)
          dto.codAnt?.trim() ?? '',
          dto.comentario?.trim() ?? '',
          (usuario.alias ?? 'SISTEMA').slice(0, 30),
        ],
      );
      const idFab = Number(provPro[0]?.idFab);
      if (!idFab) throw new BadRequestException('No se pudo registrar el producto.');

      const nuevo = await this.leerSnapshot(qr, idFab, cod_emp);
      if (!nuevo) throw new BadRequestException('No se pudo leer el producto recién creado.');
      await this.registrarAuditoria(qr, 'CREAR', usuario, cod_emp, null, nuevo, []);

      await qr.commitTransaction();

      return {
        message: 'Producto registrado correctamente',
        // Misma forma que los resultados de búsqueda, para agregarlo directo al movimiento
        producto: {
          id: nuevo.idPro, idFab: nuevo.idFab, codPro: nuevo.codPro, codFab: nuevo.codFab,
          descPro: nuevo.descPro, estado: 'A', codigo: nuevo.codigoTipo,
          barra: nuevo.barra, codAnt: nuevo.codAnt, marca: nuevo.marca, modelo: nuevo.modelo,
          plisPro: nuevo.plisPro, pminPro: nuevo.pminPro, pmayPro: nuevo.pmayPro,
          plisBs: nuevo.plisBs, pminBs: nuevo.pminBs, pmayBs: nuevo.pmayBs,
        },
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─────────────────────────────────────────
  // Editar un producto (Administrador, confirmando con su contraseña)
  // ─────────────────────────────────────────
  async editar(idFab: number, dto: EditarProductoDto, usuario: JwtPayload, cod_emp: string) {
    // La contraseña confirma que quien edita es el dueño de la sesión
    await this.usuariosService.verificarFirma(usuario.cod_usu, dto.password, cod_emp, null);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const anterior = await this.leerSnapshot(qr, idFab, cod_emp);
      if (!anterior) throw new NotFoundException('Producto no encontrado.');

      // Solo cuentan los campos enviados cuyo valor realmente cambia
      const normalizar = (campo: CampoEditable, enviado: string | number): string | number => {
        if (campo === 'codMod') return Number(enviado);
        if (COLUMNAS[campo].numero) return redondear(enviado);
        const texto = String(enviado).trim();
        if (campo === 'unidad') return texto.toUpperCase();
        if (campo === 'barra' && texto === '') return '0'; // '0' = sin código de barras (legacy)
        return texto;
      };
      const cambios: Partial<Record<CampoEditable, string | number>> = {};
      for (const campo of CAMPOS_EDITABLES) {
        const enviado = dto[campo];
        if (enviado === undefined) continue;
        const valor = normalizar(campo, enviado);
        const actual = COLUMNAS[campo].numero ? Number(anterior[campo]) : String(anterior[campo] ?? '');
        if (valor !== actual) cambios[campo] = valor;
      }
      const campos = Object.keys(cambios) as CampoEditable[];
      if (campos.length === 0) {
        throw new BadRequestException('No hay cambios para guardar.');
      }
      if (cambios.descPro === '') {
        throw new BadRequestException('La descripción no puede quedar vacía.');
      }
      await this.validarReferencias(qr, cod_emp, {
        codProv: cambios.codProv as string | undefined,
        codMod: cambios.codMod as number | undefined,
        codigoTipo: cambios.codigoTipo as string | undefined,
      });

      // Un UPDATE por tabla, solo con las columnas que cambian (nombres de la lista blanca)
      for (const tabla of ['PRODUCTO', 'PROV_PRO'] as const) {
        const deTabla = campos.filter((c) => COLUMNAS[c].tabla === tabla);
        if (deTabla.length === 0) continue;
        const sets = deTabla.map((c, i) => `${COLUMNAS[c].columna} = @${i}`);
        const valores: (string | number)[] = deTabla.map((c) => cambios[c] as string | number);
        if (tabla === 'PROV_PRO') {
          sets.push('FECHA_ACTUALIZADA = GETDATE()');
          valores.push(idFab);
          await qr.query(`UPDATE PROV_PRO SET ${sets.join(', ')} WHERE ID_FAB = @${valores.length - 1}`, valores);
        } else {
          valores.push(anterior.idPro);
          await qr.query(`UPDATE PRODUCTO SET ${sets.join(', ')} WHERE ID_PRO = @${valores.length - 1}`, valores);
        }
      }

      const nuevo = await this.leerSnapshot(qr, idFab, cod_emp);
      if (!nuevo) throw new BadRequestException('No se pudo leer el producto actualizado.');
      const auditoria = await this.registrarAuditoria(qr, 'EDITAR', usuario, cod_emp, anterior, nuevo, campos);

      await qr.commitTransaction();

      return {
        message: 'Producto actualizado correctamente',
        producto: nuevo,
        auditoria: {
          idAuditoria: auditoria?.idPa ?? null,
          camposModificados: campos,
          fechaBolivia: auditoria?.fecha ?? null,
          horaBolivia: auditoria?.hora ?? null,
        },
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─────────────────────────────────────────
  // Historial de cambios de productos (Administrador)
  // ─────────────────────────────────────────
  async getAuditoria(filtros: AuditoriaProductosDto, cod_emp: string) {
    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? 50;
    const params: (string | number)[] = [cod_emp];
    const where: string[] = ['a.COD_EMP = CAST(@0 AS VARCHAR(3))'];
    const param = (valor: string | number) => {
      params.push(valor);
      return `@${params.length - 1}`;
    };
    const comodin = (texto: string) => `%${texto.replace(/[[%_]/g, '[$&]')}%`;
    const ci = 'COLLATE SQL_Latin1_General_CP1_CI_AI';

    if (filtros.fecha_desde) where.push(`a.FECHA >= CAST(${param(filtros.fecha_desde)} AS DATE)`);
    if (filtros.fecha_hasta) where.push(`a.FECHA <= CAST(${param(filtros.fecha_hasta)} AS DATE)`);
    if (filtros.accion) where.push(`a.ACCION = ${param(filtros.accion)}`);
    const nombre = filtros.nombre?.trim();
    if (nombre) {
      const p = param(comodin(nombre));
      where.push(`((u.NOM_USU + ' ' + ISNULL(u.AP_USU, '')) LIKE ${p} ${ci} OR u.ALIAS LIKE ${p} ${ci})`);
    }
    const producto = filtros.producto?.trim();
    if (producto) {
      const p = param(comodin(producto));
      where.push(`(a.DESC_PRO LIKE ${p} ${ci} OR a.COD_FAB LIKE ${p} ${ci} OR p.DESC_PRO LIKE ${p} ${ci})`);
    }

    const from = `
      FROM SISTEMA_PRODUCTO_AUDITORIA a
      INNER JOIN USUARIO u  ON u.COD_USU = a.COD_USU
      INNER JOIN PRODUCTO p ON p.ID_PRO = a.ID_PRO
      WHERE ${where.join(' AND ')}
    `;
    const conteo = await this.dataSource.query(`SELECT COUNT(*) as total ${from}`, params);
    const total = Number(conteo[0]?.total ?? 0);
    const meta = { page, limit, total, totalPages: Math.ceil(total / limit) };
    if (total === 0) return { data: [], meta };

    const pOffset = param((page - 1) * limit);
    const pLimit = param(limit);
    const filas: {
      idAuditoria: number; accion: 'CREAR' | 'EDITAR'; idPro: number; idFab: number;
      codFab: string; descPro: string; descProActual: string;
      fecha: string; hora: string; codUsu: string; nombreUsuario: string;
      campos: string | null; anteriores: string | null; nuevos: string;
    }[] = await this.dataSource.query(`
      SELECT
        a.ID_PA    as idAuditoria,
        a.ACCION   as accion,
        a.ID_PRO   as idPro,
        a.ID_FAB   as idFab,
        a.COD_FAB  as codFab,
        a.DESC_PRO as descPro,
        p.DESC_PRO as descProActual,
        CONVERT(VARCHAR(10), a.FECHA, 23) as fecha,
        CONVERT(VARCHAR(8),  a.HORA, 108) as hora,
        a.COD_USU  as codUsu,
        LTRIM(RTRIM(u.NOM_USU + ' ' + ISNULL(u.AP_USU, ''))) as nombreUsuario,
        a.CAMPOS   as campos,
        a.DATOS_ANTERIORES as anteriores,
        a.DATOS_NUEVOS     as nuevos
      ${from}
      ORDER BY a.FECHA_HORA DESC, a.ID_PA DESC
      OFFSET ${pOffset} ROWS FETCH NEXT ${pLimit} ROWS ONLY
    `, params);

    const leerJson = (texto: string | null): Partial<ProductoSnapshot> | null => {
      if (!texto) return null;
      try { return JSON.parse(texto) as Partial<ProductoSnapshot>; } catch { return null; }
    };
    // Valor legible: para marca, modelo y tipo se muestra el nombre y no el código
    const legible = (snap: Partial<ProductoSnapshot> | null, campo: string): string | number | null => {
      if (!snap) return null;
      if (campo === 'codProv') return snap.marca ? `${snap.marca} (${snap.codProv})` : snap.codProv ?? null;
      if (campo === 'codMod') return snap.modelo ?? snap.codMod ?? null;
      if (campo === 'codigoTipo') return snap.tipo ?? snap.codigoTipo ?? null;
      return (snap as Record<string, string | number | null>)[campo] ?? null;
    };

    const data = filas.map((f) => {
      const anterior = leerJson(f.anteriores);
      const nuevo = leerJson(f.nuevos);
      const campos = (f.campos ?? '').split(',').filter(Boolean);
      return {
        idAuditoria: f.idAuditoria,
        accion: f.accion,
        idPro: f.idPro,
        idFab: f.idFab,
        codFab: f.codFab,
        descPro: f.descPro,
        descProActual: f.descProActual,
        fecha: f.fecha,
        hora: f.hora,
        codUsu: f.codUsu,
        nombreUsuario: f.nombreUsuario,
        // Antes → después de cada campo modificado
        cambios: campos.map((campo) => ({
          campo,
          antes: legible(anterior, campo),
          despues: legible(nuevo, campo),
        })),
        // Datos completos al momento del cambio (en una creación, el producto creado)
        datosNuevos: nuevo,
      };
    });

    return { data, meta };
  }
}
