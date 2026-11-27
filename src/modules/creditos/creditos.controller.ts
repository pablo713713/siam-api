import {
  Controller, Get, Post,
  Body, Param,
} from '@nestjs/common';
import { CreditosService } from './creditos.service';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { CreateDevolucionCreditoDto } from './dto/create-devolucion-credito.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { usuarioDelToken } from 'src/modules/auth/utils/usuario-del-token';

// Área de créditos: Vendedor y Administrador. La devolución de crédito se
// registra desde Devoluciones, que es solo del Administrador.
@Roles('Vendedor', 'Administrador')
@Controller('creditos')
export class CreditosController {
  constructor(private readonly creditosService: CreditosService) {}

  @Post()
  create(
    @Body() dto: CreateCreditoDto,
    @CurrentUser('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    dto.cod_usu = usuarioDelToken(dto.cod_usu, cod_usu);
    return this.creditosService.create(dto, dto.cod_usu, cod_emp);
  }

  @Get('activos')
  findActivos(@CodEmp() cod_emp: string) {
    return this.creditosService.findActivos(cod_emp);
  }
  @Get('abiertos')
  findAbiertos(@CodEmp() cod_emp: string) {
    return this.creditosService.findAbiertos(cod_emp);
  }

  @Get('clientes-habilitados')
  findClientesHabilitados(@CodEmp() cod_emp: string) {
    return this.creditosService.findClientesHabilitados(cod_emp);
  }

  // Límite, deuda y disponible del cliente
  @Get('cliente/:cod_cli/cupo')
  getCupo(@Param('cod_cli') cod_cli: number, @CodEmp() cod_emp: string) {
    return this.creditosService.getCupo(Number(cod_cli), cod_emp);
  }

  @Get('cliente/:cod_cli')
  findCreditosPorCliente(@Param('cod_cli') cod_cli: number, @CodEmp() cod_emp: string) {
    return this.creditosService.findCreditosPorCliente(Number(cod_cli), cod_emp);
  }

  @Get(':cod_cre')
  findOne(@Param('cod_cre') cod_cre: string, @CodEmp() cod_emp: string) {
    return this.creditosService.findOne(cod_cre, cod_emp);
  }

  @Post(':cod_cre/pago')
  registrarPago(
    @Param('cod_cre') cod_cre: string,
    @Body() dto: RegistrarPagoDto,
    @CurrentUser('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    return this.creditosService.registrarPago(cod_cre, dto, cod_usu, cod_emp);
  }

  @Roles('Administrador')
  @Post(':cod_cre/devolucion')
  registrarDevolucion(
    @Param('cod_cre') cod_cre: string,
    @Body() dto: CreateDevolucionCreditoDto,
    @CurrentUser('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    return this.creditosService.registrarDevolucion(cod_cre, dto, cod_usu, cod_emp);
  }

  @Post('cliente/:cod_cli/pago-multiple')
  pagoMultiple(
    @Param('cod_cli') cod_cli: number,
    @Body('cod_cre') cod_cre: string[],
    @CurrentUser('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    return this.creditosService.pagoMultiple(Number(cod_cli), cod_cre, cod_emp, cod_usu);
  }
}