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

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // HU-2.01
  @Post()
  create(@Body() dto: CreateRolDto) {
    return this.rolesService.create(dto);
  }

  // HU-2.02
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  // HU-2.01
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  // HU-2.01
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRolDto) {
    return this.rolesService.update(id, dto);
  }

  // HU-2.01
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }

  // HU-2.03
  @Post('asignar')
  asignarRol(@Body() dto: AsignarRolDto) {
    return this.rolesService.asignarRol(dto);
  }

  // HU-2.03
  @Get('usuario/:cod_usu')
getRolesDeUsuario(@Param('cod_usu') cod_usu: string) {
  return this.rolesService.getRolesDeUsuario(cod_usu);
}

// HU-2.03 — Quitar rol de usuario
@Delete('usuario/:cod_usu/rol/:id_rol')
quitarRol(
  @Param('cod_usu') cod_usu: string,
  @Param('id_rol', ParseIntPipe) id_rol: number,
) {
  return this.rolesService.quitarRol(cod_usu, id_rol);
}
}