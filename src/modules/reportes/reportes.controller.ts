import { Controller, Get, Query } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { RangoFechasDto } from './dto/rango-fechas.dto';

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  // HU-6.01
  @Get('ingresos')
  getIngresosTotales(@Query() dto: RangoFechasDto) {
    return this.reportesService.getIngresosTotales(dto);
  }

  // HU-6.02
  @Get('costos')
  getCostosMercancia(@Query() dto: RangoFechasDto) {
    return this.reportesService.getCostosMercancia(dto);
  }

  // HU-6.03
  @Get('ganancia')
  getGananciaNeta(@Query() dto: RangoFechasDto) {
    return this.reportesService.getGananciaNeta(dto);
  }
}