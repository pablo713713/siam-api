import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SistemaUsuarioAlmacen } from './entities/sistema-usuario-almacen.entity';
import { AsignarAlmacenDto } from './dto/asignar-almacen.dto';

@Injectable()
export class AlmacenesService {
  constructor(
    @InjectRepository(SistemaUsuarioAlmacen)
    private readonly usuarioAlmacenRepository: Repository<SistemaUsuarioAlmacen>,
    private readonly dataSource: DataSource,
  ) {}

  // Listar todos los almacenes disponibles
  async findAll(cod_emp: string) {
    const almacenes = await this.dataSource.query(`
      SELECT COD_SUC as codSuc, NOM_SUC as nomSuc
      FROM SUCURSAL
      WHERE COD_EMP = @0
      ORDER BY NOM_SUC ASC
    `, [cod_emp]);
    return almacenes;
  }

  // Obtener almacenes asignados a un usuario
  async getAlmacenesDeUsuario(cod_usu: string) {
    const asignaciones = await this.usuarioAlmacenRepository.find({
      where: { cod_usu, activo: true },
    });

    if (asignaciones.length === 0) return [];

    const codigos = asignaciones.map((a) => `'${a.cod_suc}'`).join(',');

    const sucursales = await this.dataSource.query(`
      SELECT COD_SUC as codSuc, NOM_SUC as nomSuc
      FROM SUCURSAL
      WHERE COD_SUC IN (${codigos})
      ORDER BY NOM_SUC ASC
    `);

    return sucursales;
  }

  // Encargados por almacén: usuarios activos con el almacén asignado y un rol
  // que permite registrar traspasos (Encargado de Almacen o Administrador).
  async getEncargadosPorAlmacen(cod_emp: string) {
    const filas: {
      codSuc: string; nomSuc: string; codUsu: string;
      nomUsu: string | null; apUsu: string | null; alias: string; esEncargado: number;
    }[] = await this.dataSource.query(`
      SELECT
        s.COD_SUC as codSuc,
        s.NOM_SUC as nomSuc,
        u.COD_USU as codUsu,
        u.NOM_USU as nomUsu,
        u.AP_USU  as apUsu,
        u.ALIAS   as alias,
        MAX(CASE WHEN r.nombre = 'Encargado de Almacen' THEN 1 ELSE 0 END) as esEncargado
      FROM SISTEMA_USUARIO_ALMACEN ua
      INNER JOIN SUCURSAL s             ON s.COD_SUC = ua.cod_suc
      INNER JOIN USUARIO u              ON u.COD_USU = ua.cod_usu
      INNER JOIN SISTEMA_USUARIO_ROL ur ON ur.cod_usu = ua.cod_usu
      INNER JOIN SISTEMA_ROLES r        ON r.id = ur.id_rol
      WHERE ua.activo = 1
        AND u.baja = '0'
        AND r.activo = 1
        AND r.nombre IN ('Encargado de Almacen', 'Administrador')
        AND s.COD_EMP = CAST(@0 AS VARCHAR(3))
      GROUP BY s.COD_SUC, s.NOM_SUC, u.COD_USU, u.NOM_USU, u.AP_USU, u.ALIAS
      ORDER BY s.NOM_SUC ASC, u.NOM_USU ASC
    `, [cod_emp]);

    const porAlmacen = new Map<string, {
      codSuc: string; nomSuc: string;
      encargados: { codUsu: string; nombre: string; alias: string; rol: string }[];
    }>();
    for (const f of filas) {
      if (!porAlmacen.has(f.codSuc)) {
        porAlmacen.set(f.codSuc, { codSuc: f.codSuc, nomSuc: f.nomSuc, encargados: [] });
      }
      porAlmacen.get(f.codSuc)!.encargados.push({
        codUsu: f.codUsu,
        nombre: `${f.nomUsu ?? ''} ${f.apUsu ?? ''}`.trim(),
        alias: f.alias,
        rol: Number(f.esEncargado) === 1 ? 'Encargado de Almacen' : 'Administrador',
      });
    }
    return { data: [...porAlmacen.values()] };
  }

  // Asignar almacén a usuario
  async asignarAlmacen(dto: AsignarAlmacenDto) {
    const existe = await this.usuarioAlmacenRepository.findOne({
      where: { cod_usu: dto.cod_usu, cod_suc: dto.cod_suc },
    });

    if (existe) {
      if (existe.activo) {
        throw new ConflictException(
          `El usuario ${dto.cod_usu} ya tiene asignado el almacén ${dto.cod_suc}`,
        );
      }
      existe.activo = true;
      return this.usuarioAlmacenRepository.save(existe);
    }

    const nuevo = this.usuarioAlmacenRepository.create(dto);
    return this.usuarioAlmacenRepository.save(nuevo);
  }

  // Quitar almacén de usuario
  async quitarAlmacen(cod_usu: string, cod_suc: string) {
    const asignacion = await this.usuarioAlmacenRepository.findOne({
      where: { cod_usu, cod_suc, activo: true },
    });

    if (!asignacion) {
      throw new NotFoundException(
        `El usuario ${cod_usu} no tiene asignado el almacén ${cod_suc}`,
      );
    }

    asignacion.activo = false;
    await this.usuarioAlmacenRepository.save(asignacion);
    return { message: `Almacén ${cod_suc} removido del usuario ${cod_usu}` };
  }
}