import {
  Controller, Get, Post,
  Body, Param, Request,
} from '@nestjs/common';
import { CreditosService } from './creditos.service';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { CreateDevolucionCreditoDto } from './dto/create-devolucion-credito.dto';

@Controller('creditos')
export class CreditosController {
  constructor(private readonly creditosService: CreditosService) {}

  @Post()
  create(@Body() dto: CreateCreditoDto) {
    return this.creditosService.create(dto, dto.cod_usu);
  }

  // Rutas fijas ANTES de los parámetros dinámicos
  @Get('activos')
  findActivos() {
    return this.creditosService.findActivos();
  }

  @Get('clientes-habilitados')
  findClientesHabilitados() {
    return this.creditosService.findClientesHabilitados();
  }

  @Get('cliente/:cod_cli')
  findCreditosPorCliente(@Param('cod_cli') cod_cli: number) {
    return this.creditosService.findCreditosPorCliente(Number(cod_cli));
  }
  @Get(':cod_cre')
  findOne(@Param('cod_cre') cod_cre: string) {
    return this.creditosService.findOne(cod_cre);
  }

  // Rutas dinámicas con acción
  @Post(':cod_cre/pago')
  registrarPago(
    @Param('cod_cre') cod_cre: string,
    @Body() dto: RegistrarPagoDto,
    @Request() req: any,
  ) {
    return this.creditosService.registrarPago(cod_cre, dto, req.user?.cod_usu ?? '0000001');
  }

  @Post(':cod_cre/devolucion')
  registrarDevolucion(
    @Param('cod_cre') cod_cre: string,
    @Body() dto: CreateDevolucionCreditoDto,
    @Request() req: any,
  ) {
    return this.creditosService.registrarDevolucion(cod_cre, dto, req.user?.cod_usu ?? '0000001');
  }

}