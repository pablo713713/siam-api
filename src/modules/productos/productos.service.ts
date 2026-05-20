import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { SearchProductoDto } from './dto/search-producto.dto';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
  ) {}

  async search(searchDto: SearchProductoDto) {
    const { q, limit } = searchDto;
    
    const take = limit || 20;

    const query = this.productoRepository.createQueryBuilder('producto')
      .where('producto.descPro LIKE :q', { q: `%${q}%` })
      .orWhere('producto.codPro LIKE :q', { q: `%${q}%` })
      .orderBy('producto.descPro', 'ASC')
      .take(take);

    const items = await query.getMany();

    return {
      data: items,
      limit: take,
    };
  }
}
