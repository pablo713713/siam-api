import { Controller, Post, Body } from '@nestjs/common';
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';

@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devolucionesService: DevolucionesService) {}

  @Post()
  create(@Body() createDevolucionDto: CreateDevolucionDto) {
    return this.devolucionesService.create(createDevolucionDto);
  }
}
