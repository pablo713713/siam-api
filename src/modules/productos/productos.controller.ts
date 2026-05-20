import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { SearchProductoDto } from './dto/search-producto.dto';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get('search')
  async search(@Query() searchDto: SearchProductoDto) {
    return this.productosService.search(searchDto);
  }

  @Get(':id/ingresos')
  async getIngresos(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getHistorialIngresos(id);
  }

  @Get(':id/stock')
  async getStock(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.getStockSucursal(id);
  }
}
