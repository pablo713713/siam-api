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

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // HU-2.01
  @Roles('Administrador')
  @Post()
  create(@Body() dto: CreateRolDto) {
    return this.rolesService.create(dto);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRolDto) {
    return this.rolesService.update(id, dto);
  }

  // HU-2.01
  @Roles('Administrador')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }

  // HU-2.03
  @Roles('Administrador')
  @Post('asignar')
  asignarRol(@Body() dto: AsignarRolDto) {
    return this.rolesService.asignarRol(dto);
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
quitarRol(
  @Param('cod_usu') cod_usu: string,
  @Param('id_rol', ParseIntPipe) id_rol: number,
) {
  return this.rolesService.quitarRol(cod_usu, id_rol);
}
}