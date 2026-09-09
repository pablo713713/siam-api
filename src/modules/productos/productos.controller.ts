import { Controller, Get, Post, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { SearchProductoDto } from './dto/search-producto.dto';
import { AdvancedSearchProductoDto } from './dto/advanced-search.dto';
import { TraspasoAlmacenDto } from './dto/traspaso-almacen.dto';
import { IngresoMercaderiaDto } from './dto/ingreso-mercaderia.dto';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get('almacenes-disponibles')
  async getAlmacenesDisponibles() {
    return this.productosService.getAlmacenesDisponibles();
  }

  @Post('traspaso')
  async registrarTraspaso(@Body() dto: TraspasoAlmacenDto) {
    return this.productosService.registrarTraspasoAlmacenes(dto);
  }

  @Post('actualizar-mercaderia')
  async registrarIngresoMercaderia(@Body() dto: IngresoMercaderiaDto) {
    return this.productosService.registrarIngresoMercaderia(dto);
  }

  @Get('search')
  async search(@Query() searchDto: SearchProductoDto) {
    return this.productosService.search(searchDto);
  }

  @Get('search/advanced')
  async searchAdvanced(@Query() searchDto: AdvancedSearchProductoDto) {
    return this.productosService.searchAdvanced(searchDto);
  }

  @Get('search/codigo')
  async searchByCodigo(@Query() searchDto: SearchProductoDto) {
    return this.productosService.searchByCodigo(searchDto);
  }

  @Get(':id/ingresos')
  async getIngresos(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getHistorialIngresos(id);
  }

  @Get(':id/stock')
  async getStock(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getStockSucursal(id);
  }

  @Get(':id/salidas')
  async getSalidas(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getHistorialSalidas(id);
  }

  @Get(':id/kardex')
  async getKardex(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getKardex(id);
  }
  @Get(':id/resumen')
  getStockResumen(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getStockResumen(id);
  }
  @Get(':id/kardex-almacen')
  getKardexPorAlmacen(
    @Param('id', ParseIntPipe) id: number,
    @Query('codSuc') codSuc?: string,
    @Query('fechaDesde') fechaDesde?: string,
  ) {
    return this.productosService.getKardexPorAlmacen(id, codSuc, fechaDesde);
  }
  @Get('stock-fab/:idFab')
  getStockPorIdFab(@Param('idFab', ParseIntPipe) idFab: number) {
    return this.productosService.getStockPorIdFab(idFab);
  }
}
