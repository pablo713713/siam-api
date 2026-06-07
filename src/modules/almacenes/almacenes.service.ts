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
  async findAll() {
  const almacenes = await this.dataSource.query(`
    SELECT COD_SUC as codSuc, NOM_SUC as nomSuc
    FROM SUCURSAL
    WHERE COD_SUC IN ('00004','00005','00006','00007','00008','00009','00010')
    ORDER BY NOM_SUC ASC
  `);
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