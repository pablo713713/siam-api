import { Controller, Get, Post, Body, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { SearchProductoDto } from './dto/search-producto.dto';
import { AdvancedSearchProductoDto } from './dto/advanced-search.dto';
import { TraspasoAlmacenDto } from './dto/traspaso-almacen.dto';
import { IngresoMercaderiaDto } from './dto/ingreso-mercaderia.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';

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
  async search(@Query() searchDto: SearchProductoDto, @CodEmp() cod_emp: string) {
    return this.productosService.search(searchDto, cod_emp);
  }

  @Get('search/advanced')
  async searchAdvanced(@Query() searchDto: AdvancedSearchProductoDto, @CodEmp() cod_emp: string) {
    return this.productosService.searchAdvanced(searchDto, cod_emp);
  }

  @Get('search/codigo')
  async searchByCodigo(@Query() searchDto: SearchProductoDto, @CodEmp() cod_emp: string) {
    return this.productosService.searchByCodigo(searchDto, cod_emp);
  }

  @Get(':id/ingresos')
  async getIngresos(@Param('id', ParseIntPipe) id: number, @CodEmp() cod_emp: string) {
    return this.productosService.getHistorialIngresos(id, cod_emp);
  }

  @Get(':id/stock')
  async getStock(@Param('id', ParseIntPipe) id: number, @CodEmp() cod_emp: string) {
    return this.productosService.getStockSucursal(id, cod_emp);
  }

  @Get(':id/salidas')
  async getSalidas(@Param('id', ParseIntPipe) id: number, @CodEmp() cod_emp: string) {
    return this.productosService.getHistorialSalidas(id, cod_emp);
  }

  @Get(':id/kardex')
  async getKardex(@Param('id', ParseIntPipe) id: number, @CodEmp() cod_emp: string) {
    return this.productosService.getKardex(id, cod_emp);
  }

  @Get(':id/resumen')
  getStockResumen(@Param('id', ParseIntPipe) id: number, @CodEmp() cod_emp: string) {
    return this.productosService.getStockResumen(id, cod_emp);
  }

  @Get(':id/kardex-almacen')
  getKardexPorAlmacen(
    @Param('id', ParseIntPipe) id: number,
    @CodEmp() cod_emp: string,
    @Query('codSuc') codSuc?: string,
    @Query('fechaDesde') fechaDesde?: string,
  ) {
    return this.productosService.getKardexPorAlmacen(id, cod_emp, codSuc, fechaDesde);
  }

@Get('stock-fab/:idFab')
  getStockPorIdFab(@Param('idFab', ParseIntPipe) idFab: number, @CodEmp() cod_emp: string) {
    return this.productosService.getStockPorIdFab(idFab, cod_emp);
  }
}