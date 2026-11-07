import { Controller, Get, Put, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { UpdateClienteExtensionDto } from './dto/update-cliente-extension.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get('ocasional')
  getOcasional(@CodEmp() cod_emp: string) {
    return this.clientesService.getOcasional(cod_emp);
  }

  @Get(':cod_cli/perfil')
  getPerfil(@Param('cod_cli', ParseIntPipe) cod_cli: number) {
    return this.clientesService.getPerfil(cod_cli);
  }

  @Put(':cod_cli/extension')
  updateExtension(
    @Param('cod_cli', ParseIntPipe) cod_cli: number,
    @Body() dto: UpdateClienteExtensionDto,
  ) {
    return this.clientesService.updateExtension(cod_cli, dto);
  }

  @Get(':cod_cli/historial-compras')
  getHistorialCompras(@Param('cod_cli', ParseIntPipe) cod_cli: number) {
    return this.clientesService.getHistorialCompras(cod_cli);
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('limit') limit: number,
    @CodEmp() cod_emp: string,
  ) {
    return this.clientesService.search(q, cod_emp, limit ? Number(limit) : 20);
  }

  @Get(':cod_cli/compras/:cod_venta')
  getDetalleCompra(
    @Param('cod_cli', ParseIntPipe) cod_cli: number,
    @Param('cod_venta') cod_venta: string,
  ) {
    return this.clientesService.getDetalleCompra(cod_cli, cod_venta);
  }
}