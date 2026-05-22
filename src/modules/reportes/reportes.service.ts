import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { RangoFechasDto } from './dto/rango-fechas.dto';

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
  ) {}

  async getIngresosTotales(dto: RangoFechasDto) {
    const manager = this.clienteRepository.manager;

    const ventas = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(v.TOTAL), 0)', 'total')
      .addSelect('COUNT(v.COD_VENTA)', 'cantidad')
      .from('VENTA', 'v')
      .where('v.FECHA >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('v.FECHA <= :fin', { fin: dto.fecha_fin })
      .andWhere("v.ESTADO = 'C'")
      .getRawOne();

    const creditos = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(c.TOTAL), 0)', 'total')
      .addSelect('COUNT(c.COD_CRE)', 'cantidad')
      .from('CREDITO', 'c')
      .where('c.FEC_INICIO >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('c.FEC_INICIO <= :fin', { fin: dto.fecha_fin })
      .andWhere("c.ESTADO = 'C'")
      .getRawOne();

    const totalVentas = parseFloat(ventas.total) || 0;
    const totalCreditos = parseFloat(creditos.total) || 0;

    return {
      rango: dto,
      ventas_contado: {
        total: totalVentas,
        cantidad: parseInt(ventas.cantidad) || 0,
      },
      ventas_credito: {
        total: totalCreditos,
        cantidad: parseInt(creditos.cantidad) || 0,
      },
      total_bruto: totalVentas + totalCreditos,
    };
  }

  async getCostosMercancia(dto: RangoFechasDto) {
    const manager = this.clienteRepository.manager;

    const costosVentas = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(dv.CANTIDAD * pp.CIF_CBBA), 0)', 'costo_total')
      .from('DET_VENTA', 'dv')
      .innerJoin('VENTA', 'v', 'v.COD_VENTA = dv.COD_VENTA')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dv.ID_FAB')
      .where('v.FECHA >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('v.FECHA <= :fin', { fin: dto.fecha_fin })
      .andWhere("v.ESTADO = 'C'")
      .getRawOne();

    const costosCreditos = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(dc.CANTIDAD * pp.CIF_CBBA), 0)', 'costo_total')
      .from('DET_CREDITO', 'dc')
      .innerJoin('CREDITO', 'c', 'c.COD_CRE = dc.COD_CRE')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dc.ID_FAB')
      .where('c.FEC_INICIO >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('c.FEC_INICIO <= :fin', { fin: dto.fecha_fin })
      .andWhere("c.ESTADO = 'C'")
      .getRawOne();

    const costoVentas = parseFloat(costosVentas.costo_total) || 0;
    const costoCreditos = parseFloat(costosCreditos.costo_total) || 0;

    return {
      rango: dto,
      costo_ventas_contado: costoVentas,
      costo_ventas_credito: costoCreditos,
      costo_total: costoVentas + costoCreditos,
    };
  }

  async getGananciaNeta(dto: RangoFechasDto) {
    const [ingresos, costos] = await Promise.all([
      this.getIngresosTotales(dto),
      this.getCostosMercancia(dto),
    ]);

    const ganancia_neta = ingresos.total_bruto - costos.costo_total;
    const margen = ingresos.total_bruto > 0
      ? (ganancia_neta / ingresos.total_bruto) * 100
      : 0;

    return {
      rango: dto,
      ingresos_brutos: ingresos.total_bruto,
      costo_mercancia: costos.costo_total,
      ganancia_neta,
      margen_porcentaje: parseFloat(margen.toFixed(2)),
    };
  }
}