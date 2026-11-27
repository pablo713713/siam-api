import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { AsignarRolDto } from './dto/asignar-rol.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // HU-2.01
  @Roles('Administrador')
  @Post()
  async create(@Body() dto: CreateRolDto, @CurrentUser('cod_usu') cod_usu: string) {
    const rol = await this.rolesService.create(dto);
    await this.auditoria.registrarSeguro({
      cod_usu, modulo: 'ROL', accion: 'CREAR', documento: String(rol.id),
      descripcion: `Creó el rol "${rol.nombre}"`, despues: rol,
    });
    return rol;
  }

  // HU-2.02
  @Roles('Administrador')
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  // HU-2.01
  @Roles('Administrador')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  // HU-2.01
  @Roles('Administrador')
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolDto,
    @CurrentUser('cod_usu') cod_usu: string,
  ) {
    const antes = { ...(await this.rolesService.findOne(id)) };
    const rol = await this.rolesService.update(id, dto);
    await this.auditoria.registrarSeguro({
      cod_usu, modulo: 'ROL', accion: 'EDITAR', documento: String(id),
      descripcion: `Editó el rol "${rol.nombre}"`, antes, despues: rol,
    });
    return rol;
  }

  // HU-2.01
  @Roles('Administrador')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('cod_usu') cod_usu: string) {
    const rol = await this.rolesService.findOne(id);
    const res = await this.rolesService.remove(id);
    await this.auditoria.registrarSeguro({
      cod_usu, modulo: 'ROL', accion: 'DESACTIVAR', documento: String(id),
      descripcion: `Desactivó el rol "${rol.nombre}"`, antes: { activo: rol.activo }, despues: { activo: false },
    });
    return res;
  }

  // HU-2.03
  @Roles('Administrador')
  @Post('asignar')
  async asignarRol(@Body() dto: AsignarRolDto, @CurrentUser('cod_usu') cod_usu: string) {
    const res = await this.rolesService.asignarRol(dto);
    const rol = await this.rolesService.findOne(dto.id_rol);
    await this.auditoria.registrarSeguro({
      cod_usu, modulo: 'ROL', accion: 'ASIGNAR', documento: dto.cod_usu,
      descripcion: `Asignó el rol "${rol.nombre}" al usuario ${dto.cod_usu}`,
      despues: { cod_usu: dto.cod_usu, id_rol: dto.id_rol, rol: rol.nombre },
    });
    return res;
  }

  // HU-2.03
  @Roles('Administrador')
  @Get('usuario/:cod_usu')
getRolesDeUsuario(@Param('cod_usu') cod_usu: string) {
  return this.rolesService.getRolesDeUsuario(cod_usu);
}

// HU-2.03 — Quitar rol de usuario
@Roles('Administrador')
@Delete('usuario/:cod_usu/rol/:id_rol')
async quitarRol(
  @Param('cod_usu') cod_usu: string,
  @Param('id_rol', ParseIntPipe) id_rol: number,
  @CurrentUser('cod_usu') quien: string,
) {
  const rol = await this.rolesService.findOne(id_rol).catch(() => null);
  const res = await this.rolesService.quitarRol(cod_usu, id_rol);
  await this.auditoria.registrarSeguro({
    cod_usu: quien, modulo: 'ROL', accion: 'QUITAR', documento: cod_usu,
    descripcion: `Quitó el rol "${rol?.nombre ?? id_rol}" al usuario ${cod_usu}`,
    antes: { cod_usu, id_rol, rol: rol?.nombre ?? null },
  });
  return res;
}
}