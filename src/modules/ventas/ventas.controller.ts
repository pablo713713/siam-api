import {
  Controller, Get, Post, Put,
  Body, Param, Query, Request,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
    create(@Body() dto: CreateVentaDto) {
    return this.ventasService.create(dto, dto.cod_usu);
    }

  @Get()
  findAll(
    @Query('fecha') fecha?: string,
    @Query('cod_suc') cod_suc?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ventasService.findAll(
      fecha, cod_suc,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':cod_venta')
  findOne(@Param('cod_venta') cod_venta: string) {
    return this.ventasService.findOne(cod_venta);
  }

  @Put(':cod_venta/anular')
  anular(@Param('cod_venta') cod_venta: string, @Request() req: any) {
    return this.ventasService.anular(cod_venta, req.user?.cod_usu ?? '0000001');
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
}