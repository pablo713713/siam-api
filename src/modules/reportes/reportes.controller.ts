import { Controller, Get, Query } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { RangoFechasDto } from './dto/rango-fechas.dto';
import { CodEmp } from '../auth/decorators/cod-emp.decorator';

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('ingresos')
  getIngresosTotales(@Query() dto: RangoFechasDto, @CodEmp() cod_emp: string) {
    return this.reportesService.getIngresosTotales(dto, cod_emp);
  }

  @Get('costos')
  getCostosMercancia(@Query() dto: RangoFechasDto, @CodEmp() cod_emp: string) {
    return this.reportesService.getCostosMercancia(dto, cod_emp);
  }

  @Get('ganancia')
  getGananciaNeta(@Query() dto: RangoFechasDto, @CodEmp() cod_emp: string) {
    return this.reportesService.getGananciaNeta(dto, cod_emp);
  }
}