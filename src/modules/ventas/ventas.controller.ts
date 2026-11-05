import {
  Controller, Get, Post, Put,
  Body, Param, Query,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  create(@Body() dto: CreateVentaDto) {
    return this.ventasService.create(dto, dto.cod_usu);
  }

  @Get()
  findAll(
    @Query('fecha') fecha: string,
    @Query('fecha_fin') fechaFin: string,
    @Query('cod_suc') cod_suc: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('estado') estado: string,
    @CodEmp() cod_emp: string,
  ) {
    return this.ventasService.findAll(
      fecha, fechaFin, cod_suc,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      estado,
      cod_emp,
    );
  }

  @Get('tipo-cambio/vigente')
  getTipoCambioVigente() {
    return this.ventasService.getTipoCambioVigente();
  }

  @Post('tipo-cambio')
  registrarTipoCambio(
    @Body('tipo_cambio') tipoCambio: number,
    @Body('cod_usu') cod_usu: string,
  ) {
    return this.ventasService.registrarTipoCambio(tipoCambio, cod_usu);
  }

  @Get('dolar-paralelo/vigente')
  getDolarParaleloVigente(@CodEmp() cod_emp: string) {
    return this.ventasService.getDolarParaleloVigente(cod_emp);
  }

  @Post('dolar-paralelo')
  registrarDolarParalelo(
    @Body('tipo_cambio') tipoCambio: number,
    @Body('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    return this.ventasService.registrarDolarParalelo(tipoCambio, cod_usu, cod_emp);
  }

  @Get(':cod_venta')
  findOne(@Param('cod_venta') cod_venta: string, @CodEmp() cod_emp: string) {
    return this.ventasService.findOne(cod_venta, cod_emp);
  }

  @Put(':cod_venta/confirmar')
  confirmar(
    @Param('cod_venta') cod_venta: string,
    @Body('items') items: { id_fab: number; precio_venta: number }[],
  ) {
    return this.ventasService.confirmar(cod_venta, items);
  }

  @Put(':cod_venta/anular')
  anular(@Param('cod_venta') cod_venta: string, @Body() body: any) {
    return this.ventasService.anular(cod_venta, body?.cod_usu ?? '0000001');
  }
}