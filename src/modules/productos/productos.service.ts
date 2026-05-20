import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { SearchProductoDto } from './dto/search-producto.dto';
import { HistorialIngresoDto } from './dto/ingreso.dto';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    private readonly dataSource: DataSource,
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

  async getHistorialIngresos(id: number): Promise<HistorialIngresoDto[]> {
    const producto = await this.productoRepository.findOne({ where: { id } });
    if (!producto) {
      throw new NotFoundException(`El producto con ID ${id} no existe.`);
    }

    const importaciones = await this.dataSource.createQueryBuilder()
      .select('i.FECHA', 'fecha')
      .addSelect("'IMPORTACION'", 'tipo')
      .addSelect('di.CANTIDAD', 'cantidad')
      .addSelect('i.COD_IMP', 'referencia')
      .from('DET_IMPORTACION', 'di')
      .innerJoin('IMPORTACION', 'i', 'i.COD_IMP = di.COD_IMP')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = di.ID_FAB')
      .where('pp.ID_PRO = :id', { id })
      .getRawMany();

    const inventarios = await this.dataSource.createQueryBuilder()
      .select('inv.FEC_INV', 'fecha')
      .addSelect("'INVENTARIO'", 'tipo')
      .addSelect('dinv.DIFERENCIA', 'cantidad')
      .addSelect('inv.COD_INV', 'referencia')
      .from('DET_INVENTARIO', 'dinv')
      .innerJoin('INVENTARIO', 'inv', 'inv.COD_INV = dinv.COD_INV')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dinv.ID_FAB')
      .where('pp.ID_PRO = :id', { id })
      .andWhere('dinv.DIFERENCIA > 0')
      .getRawMany();

    const historial = [...importaciones, ...inventarios].map(item => ({
      fecha: item.fecha,
      tipo: item.tipo as 'IMPORTACION' | 'INVENTARIO',
      cantidad: Number(item.cantidad),
      referencia: item.referencia,
    }));

    historial.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return historial;
  }
}
