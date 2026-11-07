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

  async getIngresosTotales(dto: RangoFechasDto, cod_emp: string) {
    const manager = this.clienteRepository.manager;

    const devoluciones = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(d.TOTAL), 0)', 'total')
      .from('DET_DEVOLUCION', 'd')
      .innerJoin('VENTA', 'v', 'v.COD_VENTA = d.COD_VENTA')
      .innerJoin('USUARIO', 'u', 'u.COD_USU = v.COD_USU')
      .innerJoin('SUCURSAL', 's', 's.COD_SUC = u.COD_SUC')
      .where('v.FECHA >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('v.FECHA <= :fin', { fin: dto.fecha_fin })
      .andWhere("v.ESTADO = 'C'")
      .andWhere('s.COD_EMP = :cod_emp', { cod_emp })
      .getRawOne();

    const totalDevoluciones = parseFloat(devoluciones.total) || 0;

    const ventas = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(v.TOTAL), 0)', 'total')
      .addSelect('COUNT(v.COD_VENTA)', 'cantidad')
      .from('VENTA', 'v')
      .innerJoin('USUARIO', 'u', 'u.COD_USU = v.COD_USU')
      .innerJoin('SUCURSAL', 's', 's.COD_SUC = u.COD_SUC')
      .where('v.FECHA >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('v.FECHA <= :fin', { fin: dto.fecha_fin })
      .andWhere("v.ESTADO = 'C'")
      .andWhere('s.COD_EMP = :cod_emp', { cod_emp })
      .getRawOne();

    const creditos = await manager
      .createQueryBuilder()
      .select('ISNULL(SUM(c.TOTAL), 0)', 'total')
      .addSelect('COUNT(c.COD_CRE)', 'cantidad')
      .from('CREDITO', 'c')
      .innerJoin('CLIENTE', 'cl', 'cl.cod_cli = c.COD_CLI')
      .innerJoin('SUCURSAL', 's', 's.COD_SUC = cl.COD_SUC')
      .where('c.FEC_INICIO >= :inicio', { inicio: dto.fecha_inicio })
      .andWhere('c.FEC_INICIO <= :fin', { fin: dto.fecha_fin })
      .andWhere("c.ESTADO = 'C'")
      .andWhere('s.COD_EMP = :cod_emp', { cod_emp })
      .getRawOne();

    const totalVentasOriginal = parseFloat(ventas.total) || 0;
    const totalVentasNetas = Math.max(0, totalVentasOriginal - totalDevoluciones);
    const totalCreditos = parseFloat(creditos.total) || 0;

    return {
      rango: dto,
      ventas_contado: { total: totalVentasNetas, cantidad: parseInt(ventas.cantidad) || 0 },
      ventas_credito: { total: totalCreditos, cantidad: parseInt(creditos.cantidad) || 0 },
      total_bruto: totalVentasNetas + totalCreditos,
      total_devoluciones: totalDevoluciones,
    };
  }

async getCostosMercancia(dto: RangoFechasDto, cod_emp: string) {
  const manager = this.clienteRepository.manager;

  const costosVentas = await manager
    .createQueryBuilder()
    .select('ISNULL(SUM(dv.CANTIDAD * pp.CIF_CBBA), 0)', 'costo_total')
    .from('DET_VENTA', 'dv')
    .innerJoin('VENTA', 'v', 'v.COD_VENTA = dv.COD_VENTA')
    .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dv.ID_FAB')
    .innerJoin('USUARIO', 'u', 'u.COD_USU = v.COD_USU')
    .innerJoin('SUCURSAL', 's', 's.COD_SUC = u.COD_SUC')
    .where('v.FECHA >= :inicio', { inicio: dto.fecha_inicio })
    .andWhere('v.FECHA <= :fin', { fin: dto.fecha_fin })
    .andWhere("v.ESTADO = 'C'")
    .andWhere('s.COD_EMP = :cod_emp', { cod_emp })
    .getRawOne();

  const costosDevoluciones = await manager
    .createQueryBuilder()
    .select('ISNULL(SUM(dd.CANTIDAD * pp.CIF_CBBA), 0)', 'costo_total')
    .from('DET_DEVOLUCION', 'dd')
    .innerJoin('VENTA', 'v', 'v.COD_VENTA = dd.COD_VENTA')
    .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dd.ID_FAB')
    .innerJoin('USUARIO', 'u', 'u.COD_USU = v.COD_USU')
    .innerJoin('SUCURSAL', 's', 's.COD_SUC = u.COD_SUC')
    .where('v.FECHA >= :inicio', { inicio: dto.fecha_inicio })
    .andWhere('v.FECHA <= :fin', { fin: dto.fecha_fin })
    .andWhere("v.ESTADO = 'C'")
    .andWhere('s.COD_EMP = :cod_emp', { cod_emp })
    .getRawOne();

  const creditos = await manager
    .createQueryBuilder()
    .select('ISNULL(SUM(dc.CANTIDAD * pp.CIF_CBBA), 0)', 'costo_total')
    .from('DET_CREDITO', 'dc')
    .innerJoin('CREDITO', 'c', 'c.COD_CRE = dc.COD_CRE')
    .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dc.ID_FAB')
    .innerJoin('CLIENTE', 'cl', 'cl.cod_cli = c.COD_CLI')
    .innerJoin('SUCURSAL', 's', 's.COD_SUC = cl.COD_SUC')
    .where('c.FEC_INICIO >= :inicio', { inicio: dto.fecha_inicio })
    .andWhere('c.FEC_INICIO <= :fin', { fin: dto.fecha_fin })
    .andWhere("c.ESTADO = 'C'")
    .andWhere('s.COD_EMP = :cod_emp', { cod_emp })
    .getRawOne();

  const costoVentasNeto = Math.max(0, (parseFloat(costosVentas.costo_total) || 0) - (parseFloat(costosDevoluciones.costo_total) || 0));
  const costoCreditos = parseFloat(creditos.costo_total) || 0;

  return {
    rango: dto,
    costo_ventas_contado: costoVentasNeto,
    costo_ventas_credito: costoCreditos,
    costo_total: costoVentasNeto + costoCreditos,
  };
}

async getGananciaNeta(dto: RangoFechasDto, cod_emp: string) {
  const [ingresos, costos] = await Promise.all([
    this.getIngresosTotales(dto, cod_emp),
    this.getCostosMercancia(dto, cod_emp),
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