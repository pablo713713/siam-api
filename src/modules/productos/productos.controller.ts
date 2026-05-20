import { Controller, Get, Query } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { SearchProductoDto } from './dto/search-producto.dto';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get('search')
  async search(@Query() searchDto: SearchProductoDto) {
    return this.productosService.search(searchDto);
  }
}
