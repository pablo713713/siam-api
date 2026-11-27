import {
  Controller, Get, Post, Put,
  Body, Param, Query, Request,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { RegistrarTipoCambioDto } from './dto/registrar-tipo-cambio.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { usuarioDelToken } from 'src/modules/auth/utils/usuario-del-token';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  // La venta queda a nombre del usuario del token (no del body)
  @Roles('Vendedor', 'Administrador')
  @Post()
  create(@Body() dto: CreateVentaDto, @CurrentUser('cod_usu') cod_usu: string) {
    dto.cod_usu = usuarioDelToken(dto.cod_usu, cod_usu);
    return this.ventasService.create(dto, dto.cod_usu);
  }

  @Roles('Vendedor', 'Administrador')
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

  @Roles('Administrador')
  @Post('tipo-cambio')
  registrarTipoCambio(
    @Body() dto: RegistrarTipoCambioDto,
    @CurrentUser('cod_usu') cod_usu: string,
  ) {
    return this.ventasService.registrarTipoCambio(dto.tipo_cambio, usuarioDelToken(dto.cod_usu, cod_usu));
  }

  @Get('dolar-paralelo/vigente')
  getDolarParaleloVigente(@CodEmp() cod_emp: string) {
    return this.ventasService.getDolarParaleloVigente(cod_emp);
  }

  @Roles('Administrador')
  @Post('dolar-paralelo')
  registrarDolarParalelo(
    @Body() dto: RegistrarTipoCambioDto,
    @CurrentUser('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    return this.ventasService.registrarDolarParalelo(dto.tipo_cambio, usuarioDelToken(dto.cod_usu, cod_usu), cod_emp);
  }

  @Get(':cod_venta')
  findOne(@Param('cod_venta') cod_venta: string, @CodEmp() cod_emp: string) {
    return this.ventasService.findOne(cod_venta, cod_emp);
  }

  // Solo ventas de la empresa del token
  @Roles('Vendedor', 'Administrador')
  @Put(':cod_venta/confirmar')
  confirmar(
    @Param('cod_venta') cod_venta: string,
    @Body('items') items: { id_fab: number; precio_venta: number }[],
    @CodEmp() cod_emp: string,
  ) {
    return this.ventasService.confirmar(cod_venta, items, cod_emp);
  }

  // Anular venta: solo Administrador. Quien anula se toma del token.
  @Roles('Administrador')
  @Put(':cod_venta/anular')
  anular(
    @Param('cod_venta') cod_venta: string,
    @Request() req: { user: { cod_usu: string } },
    @CodEmp() cod_emp: string,
  ) {
    return this.ventasService.anular(cod_venta, req.user.cod_usu, cod_emp);
  }
}