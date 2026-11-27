import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** Alta de usuarios desde Administración. */
@Injectable()
export class UsuariosGestionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Cargos, sucursales de la empresa y roles activos para el formulario. */
  async catalogos(cod_emp: string) {
    const [cargos, sucursales, roles] = await Promise.all([
      this.dataSource.query(`SELECT COD_CAR as codCar, DESC_CAR as descCar FROM CARGO ORDER BY DESC_CAR`),
      this.dataSource.query(`
        SELECT COD_SUC as codSuc, NOM_SUC as nomSuc FROM SUCURSAL
        WHERE COD_EMP = @0 ORDER BY NOM_SUC
      `, [cod_emp]),
      this.dataSource.query(`SELECT id, nombre FROM SISTEMA_ROLES WHERE activo = 1 ORDER BY nombre`),
    ]);
    return { cargos, sucursales, roles };
  }

  async create(dto: CreateUsuarioDto, cod_usu_admin: string, cod_emp: string) {
    const db = this.dataSource;

    const suc = await db.query(`SELECT 1 as ok FROM SUCURSAL WHERE COD_SUC = @0 AND COD_EMP = @1`, [dto.cod_suc, cod_emp]);
    if (!suc.length) throw new BadRequestException(`La sucursal ${dto.cod_suc} no es de su empresa.`);

    const car = await db.query(`SELECT 1 as ok FROM CARGO WHERE COD_CAR = @0`, [dto.cod_car]);
    if (!car.length) throw new BadRequestException(`El cargo ${dto.cod_car} no existe.`);

    // ALIAS es UNIQUE en toda la tabla USUARIO
    const dup = await db.query(`SELECT COD_USU as codUsu FROM USUARIO WHERE ALIAS = @0`, [dto.alias]);
    if (dup.length) throw new ConflictException(`El alias "${dto.alias}" ya está en uso.`);

    const roles = dto.roles ?? [];
    if (roles.length) {
      const validos: { id: number }[] = await db.query(
        `SELECT id FROM SISTEMA_ROLES WHERE activo = 1 AND id IN (${roles.map((_, i) => `@${i}`).join(',')})`, roles,
      );
      const faltan = roles.filter((r) => !validos.some((v) => Number(v.id) === r));
      if (faltan.length) throw new BadRequestException(`Roles inexistentes o desactivados: ${faltan.join(', ')}.`);
    }

    const almacenes = dto.almacenes ?? [];
    if (almacenes.length) {
      const validos: { codSuc: string }[] = await db.query(
        `SELECT COD_SUC as codSuc FROM SUCURSAL WHERE COD_EMP = @0 AND COD_SUC IN (${almacenes.map((_, i) => `@${i + 1}`).join(',')})`,
        [cod_emp, ...almacenes],
      );
      const faltan = almacenes.filter((a) => !validos.some((v) => v.codSuc === a));
      if (faltan.length) throw new BadRequestException(`Almacenes que no son de su empresa: ${faltan.join(', ')}.`);
    }

    const qr = db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // COD_USU correlativo de 7 dígitos (bloqueado para que dos altas no tomen el mismo)
      const max: { n: number | null }[] = await qr.query(`
        SELECT MAX(CAST(COD_USU AS INT)) as n
        FROM USUARIO WITH (UPDLOCK, HOLDLOCK)
        WHERE COD_USU NOT LIKE '%[^0-9]%' AND LEN(COD_USU) = 7
      `);
      const cod_usu = String(Number(max[0]?.n ?? 0) + 1).padStart(7, '0');

      // Las demás columnas NOT NULL de USUARIO tienen DEFAULT en la BD legacy
      await qr.query(`
        INSERT INTO USUARIO (COD_USU, NOM_USU, AP_USU, ALIAS, CONTRASEÑA, TEL_USU, CEL_USU, COD_CAR, COD_SUC, email, baja)
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, '0')
      `, [
        cod_usu, dto.nom_usu.toUpperCase(), dto.ap_usu ? dto.ap_usu.toUpperCase() : null, dto.alias, dto.contrasena,
        dto.telefono || null, dto.celular || null, dto.cod_car, dto.cod_suc, dto.email || null,
      ]);

      for (const id_rol of roles) {
        await qr.query(
          `INSERT INTO SISTEMA_USUARIO_ROL (cod_usu, id_rol, asignadoAt) VALUES (@0, @1, GETDATE())`, [cod_usu, id_rol],
        );
      }
      for (const cod_suc of almacenes) {
        await qr.query(
          `INSERT INTO SISTEMA_USUARIO_ALMACEN (cod_usu, cod_suc, activo, createdAt) VALUES (@0, @1, 1, GETDATE())`,
          [cod_usu, cod_suc],
        );
      }

      // La contraseña nunca va a la auditoría
      await this.auditoria.registrar({
        cod_usu: cod_usu_admin, modulo: 'USUARIO', accion: 'CREAR', documento: cod_usu,
        descripcion: `Creó el usuario ${dto.alias} (${dto.nom_usu} ${dto.ap_usu ?? ''}`.trim() + `), código ${cod_usu}`,
        despues: {
          cod_usu, alias: dto.alias, nombre: dto.nom_usu, apellido: dto.ap_usu ?? null,
          cargo: dto.cod_car, sucursal: dto.cod_suc, email: dto.email ?? null, roles, almacenes,
        },
      }, qr);

      await qr.commitTransaction();
      return { cod_usu, alias: dto.alias, message: 'Usuario creado correctamente' };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
