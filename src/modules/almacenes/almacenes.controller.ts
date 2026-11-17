import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { AlmacenesService } from './almacenes.service';
import { AsignarAlmacenDto } from './dto/asignar-almacen.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';

@Controller('almacenes')
export class AlmacenesController {
  constructor(private readonly almacenesService: AlmacenesService) {}

  @Get()
  findAll(@CodEmp() cod_emp: string) {
    return this.almacenesService.findAll(cod_emp);
  }

  // Encargados de cada almacén (quiénes pueden registrar traspasos desde él)
  @Roles('Administrador', 'Encargado de Almacen')
  @Get('encargados')
  getEncargados(@CodEmp() cod_emp: string) {
    return this.almacenesService.getEncargadosPorAlmacen(cod_emp);
  }

  @Get('usuario/:cod_usu')
  getAlmacenesDeUsuario(@Param('cod_usu') cod_usu: string) {
    return this.almacenesService.getAlmacenesDeUsuario(cod_usu);
  }

  @Roles('Administrador')
  @Post('asignar')
  asignarAlmacen(@Body() dto: AsignarAlmacenDto) {
    return this.almacenesService.asignarAlmacen(dto);
  }

  @Roles('Administrador')
  @Delete('usuario/:cod_usu/almacen/:cod_suc')
  quitarAlmacen(
    @Param('cod_usu') cod_usu: string,
    @Param('cod_suc') cod_suc: string,
  ) {
    return this.almacenesService.quitarAlmacen(cod_usu, cod_suc);
  }
}