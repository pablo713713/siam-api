import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { timingSafeEqual } from 'crypto';
import { SearchUsuarioDto } from './dto/search-usuario.dto';

// Firma de traspasos: intentos fallidos permitidos antes de bloquear
const MAX_INTENTOS_FIRMA = 5;
const BLOQUEO_FIRMA_MS = 5 * 60 * 1000; // 5 minutos

export interface Firmante {
  cod_usu: string;
  alias: string;
  nombreCompleto: string;
}

@Injectable()
export class UsuariosService {
  // Intentos fallidos de firma por usuario (en memoria del proceso)
  private readonly intentosFirma = new Map<string, { fallos: number; bloqueadoHasta: number }>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Nombre del rol de SISTEMA_ROLES que identifica a los vendedores. */
  get rolVendedor(): string {
    return this.config.get<string>('ROL_VENDEDOR') ?? 'Vendedor';
  }

  // ─────────────────────────────────────────
  // Combo de vendedores para la firma de traspasos
  // ─────────────────────────────────────────
  async getVendedores(cod_emp: string, excluir_cod_usu?: string) {
    const items = await this.dataSource.query(`
      SELECT DISTINCT
        u.COD_USU as codUsu,
        u.NOM_USU as nomUsu,
        u.AP_USU  as apUsu,
        u.ALIAS   as alias
      FROM USUARIO u
      INNER JOIN SUCURSAL s             ON s.COD_SUC = u.COD_SUC
      INNER JOIN SISTEMA_USUARIO_ROL ur ON ur.cod_usu = u.COD_USU
      INNER JOIN SISTEMA_ROLES r        ON r.id = ur.id_rol
      WHERE u.baja = '0'
        AND s.COD_EMP = @0
        AND r.activo = 1
        AND r.nombre = @1 COLLATE SQL_Latin1_General_CP1_CI_AI
        AND u.COD_USU <> @2
      ORDER BY u.NOM_USU ASC
    `, [cod_emp, this.rolVendedor, excluir_cod_usu ?? '']);

    return { data: items, total: items.length };
  }

  // ─────────────────────────────────────────
  // Firma de un traspaso: usuario + contraseña del login.
  //  - Salida a venta: firma el vendedor elegido en el combo (rolRequerido = Vendedor).
  //  - Otros traspasos: firma el mismo encargado que registra (rolRequerido = null).
  // La contraseña solo se usa para comparar: no se guarda ni se devuelve.
  // ─────────────────────────────────────────
  async verificarFirma(
    cod_usu_firmante: string,
    password: string,
    cod_emp: string,
    rolRequerido: string | null,
  ): Promise<Firmante> {
    this.verificarBloqueo(cod_usu_firmante);

    const filas = await this.dataSource.query(`
      SELECT u.COD_USU, u.ALIAS, u.NOM_USU, u.AP_USU, u.CONTRASEÑA as clave, s.COD_EMP
      FROM USUARIO u
      INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
      WHERE u.COD_USU = @0 AND u.baja = '0'
    `, [cod_usu_firmante]);

    const u = filas[0];
    // Mismo mensaje para "no existe" y "contraseña incorrecta": no revela cuál falló
    if (!u || u.COD_EMP !== cod_emp || !this.clavesIguales(u.clave ?? '', password)) {
      this.registrarFallo(cod_usu_firmante);
      throw new UnauthorizedException(
        rolRequerido ? 'Usuario o contraseña del vendedor incorrectos.' : 'Contraseña incorrecta.',
      );
    }

    if (rolRequerido) {
      const tieneRol = await this.dataSource.query(`
        SELECT 1 as ok
        FROM SISTEMA_USUARIO_ROL ur
        INNER JOIN SISTEMA_ROLES r ON r.id = ur.id_rol
        WHERE ur.cod_usu = @0 AND r.activo = 1
          AND r.nombre = @1 COLLATE SQL_Latin1_General_CP1_CI_AI
      `, [cod_usu_firmante, rolRequerido]);

      if (tieneRol.length === 0) {
        throw new BadRequestException(`El usuario seleccionado no tiene el rol "${rolRequerido}".`);
      }
    }

    this.intentosFirma.delete(cod_usu_firmante);
    return {
      cod_usu: u.COD_USU,
      alias: u.ALIAS,
      nombreCompleto: `${u.NOM_USU ?? ''} ${u.AP_USU ?? ''}`.trim(),
    };
  }

  // Contraseñas legacy en texto plano (igual que el login): comparación en tiempo constante
  private clavesIguales(guardada: string, ingresada: string): boolean {
    const a = Buffer.from(guardada, 'utf8');
    const b = Buffer.from(ingresada, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private verificarBloqueo(cod_usu: string) {
    const reg = this.intentosFirma.get(cod_usu);
    if (reg && reg.bloqueadoHasta > Date.now()) {
      const minutos = Math.ceil((reg.bloqueadoHasta - Date.now()) / 60000);
      throw new HttpException(
        `Demasiados intentos fallidos de firma para este usuario. Intente en ${minutos} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private registrarFallo(cod_usu: string) {
    const reg = this.intentosFirma.get(cod_usu) ?? { fallos: 0, bloqueadoHasta: 0 };
    reg.fallos += 1;
    if (reg.fallos >= MAX_INTENTOS_FIRMA) {
      reg.fallos = 0;
      reg.bloqueadoHasta = Date.now() + BLOQUEO_FIRMA_MS;
    }
    this.intentosFirma.set(cod_usu, reg);
  }

  async search(dto: SearchUsuarioDto, cod_emp: string) {
    const { q, limit = 20 } = dto;
    const term = `%${q}%`;

    const items = await this.dataSource.query(`
      SELECT
        u.COD_USU as codUsu,
        u.NOM_USU as nomUsu,
        u.AP_USU  as apUsu,
        u.ALIAS   as alias,
        u.baja    as baja
      FROM USUARIO u
      INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
      WHERE u.baja = '0'
        AND s.COD_EMP = @2
        AND (
          u.NOM_USU LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          u.AP_USU  LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          u.ALIAS   LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI
        )
      ORDER BY u.NOM_USU ASC
      OFFSET 0 ROWS FETCH NEXT @1 ROWS ONLY
    `, [term, limit, cod_emp]);

    return { data: items, total: items.length };
  }

async findAll(cod_emp: string) {
  const items = await this.dataSource.query(`
    SELECT
      u.COD_USU as codUsu,
      u.NOM_USU as nomUsu,
      u.AP_USU  as apUsu,
      u.ALIAS   as alias,
      u.baja    as baja
    FROM USUARIO u
    INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
    WHERE u.baja = '0'
      AND s.COD_EMP = @0
    ORDER BY u.NOM_USU ASC
  `, [cod_emp]);

  return { data: items, total: items.length };
}
}