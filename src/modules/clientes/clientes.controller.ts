import { Controller, Get, Put, Param, Body, ParseIntPipe, Query } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { UpdateClienteExtensionDto } from './dto/update-cliente-extension.dto';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  // HU-5.01
  @Get(':cod_cli/perfil')
  getPerfil(@Param('cod_cli', ParseIntPipe) cod_cli: number) {
    return this.clientesService.getPerfil(cod_cli);
  }

  // HU-5.02
  @Put(':cod_cli/extension')
  updateExtension(
    @Param('cod_cli', ParseIntPipe) cod_cli: number,
    @Body() dto: UpdateClienteExtensionDto,
  ) {
    return this.clientesService.updateExtension(cod_cli, dto);
  }

  // HU-5.03
  @Get(':cod_cli/historial-compras')
  getHistorialCompras(@Param('cod_cli', ParseIntPipe) cod_cli: number) {
    return this.clientesService.getHistorialCompras(cod_cli);
  }
  @Get('search')
  search(
    @Query('q') q: string,
    @Query('limit') limit?: number,
  ) {
    return this.clientesService.search(q, limit ? Number(limit) : 20);
  }
}