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

@Controller('almacenes')
export class AlmacenesController {
  constructor(private readonly almacenesService: AlmacenesService) {}

  @Get()
  findAll() {
    return this.almacenesService.findAll();
  }

  @Get('usuario/:cod_usu')
  getAlmacenesDeUsuario(@Param('cod_usu') cod_usu: string) {
    return this.almacenesService.getAlmacenesDeUsuario(cod_usu);
  }

  @Post('asignar')
  asignarAlmacen(@Body() dto: AsignarAlmacenDto) {
    return this.almacenesService.asignarAlmacen(dto);
  }

  @Delete('usuario/:cod_usu/almacen/:cod_suc')
  quitarAlmacen(
    @Param('cod_usu') cod_usu: string,
    @Param('cod_suc') cod_suc: string,
  ) {
    return this.almacenesService.quitarAlmacen(cod_usu, cod_suc);
  }
}