import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SistemaRol } from './entities/sistema-rol.entity';
import { SistemaUsuarioRol } from './entities/sistema-usuario-rol.entity';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { AsignarRolDto } from './dto/asignar-rol.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(SistemaRol)
    private readonly rolRepository: Repository<SistemaRol>,
    @InjectRepository(SistemaUsuarioRol)
    private readonly usuarioRolRepository: Repository<SistemaUsuarioRol>,
  ) {}

  // HU-2.01 — Crear rol
  async create(dto: CreateRolDto): Promise<SistemaRol> {
    const existe = await this.rolRepository.findOne({
      where: { nombre: dto.nombre },
    });
    if (existe) {
      throw new ConflictException(`El rol "${dto.nombre}" ya existe`);
    }
    const rol = this.rolRepository.create(dto);
    return this.rolRepository.save(rol);
  }

  // HU-2.02 — Listar todos los roles
  async findAll(): Promise<SistemaRol[]> {
    return this.rolRepository.find({
      order: { nombre: 'ASC' },
    });
  }

  // HU-2.01 — Obtener un rol por ID
  async findOne(id: number): Promise<SistemaRol> {
    const rol = await this.rolRepository.findOne({ where: { id } });
    if (!rol) {
      throw new NotFoundException(`Rol con id ${id} no encontrado`);
    }
    return rol;
  }

  // HU-2.01 — Actualizar rol
  async update(id: number, dto: UpdateRolDto): Promise<SistemaRol> {
    const rol = await this.findOne(id);
    if (dto.nombre && dto.nombre !== rol.nombre) {
      const existe = await this.rolRepository.findOne({
        where: { nombre: dto.nombre },
      });
      if (existe) {
        throw new ConflictException(`El rol "${dto.nombre}" ya existe`);
      }
    }
    Object.assign(rol, dto);
    return this.rolRepository.save(rol);
  }

  // HU-2.01 — Eliminar rol (soft delete via activo)
  async remove(id: number): Promise<{ message: string }> {
    const rol = await this.findOne(id);
    rol.activo = false;
    await this.rolRepository.save(rol);
    return { message: `Rol "${rol.nombre}" desactivado correctamente` };
  }

  // HU-2.03 — Asignar rol a usuario
  async asignarRol(dto: AsignarRolDto): Promise<SistemaUsuarioRol> {
  await this.findOne(dto.id_rol);

  const existente = await this.usuarioRolRepository.findOne({
    where: { cod_usu: dto.cod_usu, id_rol: dto.id_rol },
  });

  if (existente) {
    throw new ConflictException(
      `El usuario ${dto.cod_usu} ya tiene asignado el rol ${dto.id_rol}`,
    );
  }

  const nuevo = this.usuarioRolRepository.create(dto);
  return this.usuarioRolRepository.save(nuevo);
}

async quitarRol(cod_usu: string, id_rol: number): Promise<{ message: string }> {
  const usuarioRol = await this.usuarioRolRepository.findOne({
    where: { cod_usu, id_rol },
  });

  if (!usuarioRol) {
    throw new NotFoundException(
      `El usuario ${cod_usu} no tiene asignado el rol ${id_rol}`,
    );
  }

  await this.usuarioRolRepository.remove(usuarioRol);
  return { message: `Rol ${id_rol} removido del usuario ${cod_usu}` };
}

async getRolesDeUsuario(cod_usu: string): Promise<SistemaUsuarioRol[]> {
  return this.usuarioRolRepository.find({
    where: { cod_usu },
    relations: ['rol'],
  });
}
}