import { Controller, Post, Body } from '@nestjs/common';
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { CodEmp } from '../auth/decorators/cod-emp.decorator';

@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devolucionesService: DevolucionesService) {}

  @Post()
  create(@Body() createDevolucionDto: CreateDevolucionDto, @CodEmp() cod_emp: string) {
    return this.devolucionesService.create(createDevolucionDto, cod_emp);
  }
}