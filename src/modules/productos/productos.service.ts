import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { SearchProductoDto } from './dto/search-producto.dto';
import { HistorialIngresoDto } from './dto/ingreso.dto';
import { StockSucursalDto } from './dto/stock.dto';
import { HistorialSalidaDto } from './dto/salida.dto';
import { KardexDto } from './dto/kardex.dto';
import { AdvancedSearchProductoDto } from './dto/advanced-search.dto';

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
    const term = `"${q}*"`;

    const items = await this.dataSource.query(`
      SELECT DISTINCT
        p.ID_PRO as id,
        p.COD_PRO as codPro,
        p.DESC_PRO as descPro,
        p.ESTADO as estado,
        p.CODIGO as codigo,
        MAX(pp.COD_FAB) as codFab,
        MAX(pp.barra) as barra,
        MAX(pp.COD_ANT) as codAnt,
        MAX(ma.NOM_MARCA) as marca,
        MAX(mo.NOM_MODELO) as modelo,
        MAX(pp.PLIS_PRO) as plisPro,
        MAX(pp.PMIN_PRO) as pminPro,
        MAX(pp.PMAY_PRO) as pmayPro,
        MAX(pp.CIFFSus)  as ciffSus,
        MAX(pp.ID_FAB)   as idFab

      FROM PRODUCTO p
      LEFT JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
      WHERE p.ESTADO = 'A'
      AND (
        CONTAINS(p.DESC_PRO, @0) OR
        CONTAINS(p.COD_PRO, @0) OR
        CONTAINS(ma.NOM_MARCA, @0) OR
        CONTAINS(mo.NOM_MODELO, @0)
      )
      GROUP BY p.ID_PRO, p.COD_PRO, p.DESC_PRO, p.ESTADO, p.CODIGO
      ORDER BY p.DESC_PRO ASC
      OFFSET 0 ROWS FETCH NEXT @1 ROWS ONLY
    `, [term, take]);

    return {
      data: items,
      limit: take,
    };
  }

  async searchByCodigo(searchDto: SearchProductoDto) {
    const { q, limit } = searchDto;
    const take = limit || 20;

    const query = this.productoRepository.createQueryBuilder('producto')
      .leftJoin('PROV_PRO', 'pp', 'pp.ID_PRO = producto.ID_PRO')
      .select([
        'producto.ID_PRO as id',
        'producto.COD_PRO as codPro',
        'producto.DESC_PRO as descPro',
        'producto.ESTADO as estado',
        'producto.CODIGO as codigo',
        'MAX(pp.COD_FAB) as codFab',
        'MAX(pp.barra) as barra',
        'MAX(pp.COD_ANT) as codAnt'
      ])
      .where('producto.COD_PRO LIKE :q', { q: `%${q}%` })
      .orWhere('producto.CODIGO LIKE :q', { q: `%${q}%` })
      .orWhere('pp.COD_FAB LIKE :q', { q: `%${q}%` })
      .orWhere('pp.barra LIKE :q', { q: `%${q}%` })
      .orWhere('pp.COD_ANT LIKE :q', { q: `%${q}%` })
      .groupBy('producto.ID_PRO')
      .addGroupBy('producto.COD_PRO')
      .addGroupBy('producto.DESC_PRO')
      .addGroupBy('producto.ESTADO')
      .addGroupBy('producto.CODIGO')
      .orderBy('producto.DESC_PRO', 'ASC')
      .limit(take);

    const items = await query.getRawMany();

    return {
      data: items.map(item => ({
        id: item.id,
        codPro: item.codPro,
        descPro: item.descPro,
        estado: item.estado,
        codigo: item.codigo,
        codFab: item.codFab,
        barra: item.barra,
        codAnt: item.codAnt
      })),
      limit: take,
    };
  }

  async searchAdvanced(searchDto: AdvancedSearchProductoDto) {
    const { q, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;
    const term = q ? `"${q}*"` : null;

    if (!term) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 }
      };
    }

    const items = await this.dataSource.query(`
      SELECT DISTINCT
        p.ID_PRO as id,
        p.COD_PRO as codPro,
        p.DESC_PRO as descPro,
        p.ESTADO as estado,
        p.CODIGO as codigo,
        MAX(pp.COD_FAB) as codFab,
        MAX(pp.barra) as barra,
        MAX(pp.COD_ANT) as codAnt,
        MAX(ma.NOM_MARCA) as marca,
        MAX(mo.NOM_MODELO) as modelo,
        MAX(pp.PLIS_PRO) as plisPro,
        MAX(pp.PMIN_PRO) as pminPro,
        MAX(pp.PMAY_PRO) as pmayPro,
        MAX(pp.CIFFSus)  as ciffSus,
        MAX(pp.ID_FAB)   as idFab
      FROM PRODUCTO p
      LEFT JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
      WHERE p.ESTADO = 'A'
      AND (
        CONTAINS(p.DESC_PRO, @0) OR
        CONTAINS(p.COD_PRO, @0) OR
        CONTAINS(ma.NOM_MARCA, @0) OR
        CONTAINS(mo.NOM_MODELO, @0)
      )
      GROUP BY p.ID_PRO, p.COD_PRO, p.DESC_PRO, p.ESTADO, p.CODIGO
      ORDER BY p.DESC_PRO ASC
      OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY
    `, [term, skip, limit]);

    const countResult = await this.dataSource.query(`
      SELECT COUNT(DISTINCT p.ID_PRO) as total
      FROM PRODUCTO p
      LEFT JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
      WHERE p.ESTADO = 'A'
      AND (
        CONTAINS(p.DESC_PRO, @0) OR
        CONTAINS(p.COD_PRO, @0) OR
        CONTAINS(ma.NOM_MARCA, @0) OR
        CONTAINS(mo.NOM_MODELO, @0)
      )
    `, [term]);

    const total = Number(countResult[0]?.total || 0);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
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

  async getStockSucursal(id: number): Promise<StockSucursalDto[]> {
    const producto = await this.productoRepository.findOne({ where: { id } });
    if (!producto) {
      throw new NotFoundException(`El producto con ID ${id} no existe.`);
    }

    const stock = await this.dataSource.createQueryBuilder()
      .select('suc.COD_SUC', 'codSucursal')
      .addSelect('suc.NOM_SUC', 'nombreSucursal')
      .addSelect('spp.CANTIDAD', 'stockFisico')
      .addSelect('spp.cantidad_virtual', 'inventarioVirtual')
      .from('SUC_PRO_PROV', 'spp')
      .innerJoin('SUCURSAL', 'suc', 'suc.COD_SUC = spp.COD_SUC')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = spp.ID_FAB')
      .where('pp.ID_PRO = :id', { id })
      .orderBy('suc.NOM_SUC', 'ASC')
      .getRawMany();

    return stock.map(item => ({
      codSucursal: item.codSucursal,
      nombreSucursal: item.nombreSucursal,
      stockFisico: Number(item.stockFisico || 0),
      inventarioVirtual: Number(item.inventarioVirtual || 0),
    }));
  }

  async getHistorialSalidas(id: number): Promise<HistorialSalidaDto[]> {
    const producto = await this.productoRepository.findOne({ where: { id } });
    if (!producto) {
      throw new NotFoundException(`El producto con ID ${id} no existe.`);
    }

    const ventas = await this.dataSource.createQueryBuilder()
      .select('v.FECHA', 'fecha')
      .addSelect("'VENTA'", 'tipo')
      .addSelect('dv.CANTIDAD', 'cantidad')
      .addSelect('v.COD_VENTA', 'referencia')
      .from('DET_VENTA', 'dv')
      .innerJoin('VENTA', 'v', 'v.COD_VENTA = dv.COD_VENTA')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dv.ID_FAB')
      .where('pp.ID_PRO = :id', { id })
      .getRawMany();

    const creditos = await this.dataSource.createQueryBuilder()
      .select('c.FEC_INICIO', 'fecha')
      .addSelect("'CREDITO'", 'tipo')
      .addSelect('dc.CANTIDAD', 'cantidad')
      .addSelect('c.COD_CRE', 'referencia')
      .from('DET_CREDITO', 'dc')
      .innerJoin('CREDITO', 'c', 'c.COD_CRE = dc.COD_CRE')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dc.ID_FAB')
      .where('pp.ID_PRO = :id', { id })
      .getRawMany();

    const pedidos = await this.dataSource.createQueryBuilder()
      .select('p.FECHA', 'fecha')
      .addSelect("'PEDIDO'", 'tipo')
      .addSelect('dp.CANT_ENVIADO', 'cantidad')
      .addSelect('p.COD_PEDIDO', 'referencia')
      .from('DET_PEDIDO', 'dp')
      .innerJoin('PEDIDO', 'p', 'p.COD_PEDIDO = dp.COD_PEDIDO')
      .innerJoin('PROV_PRO', 'pp', 'pp.ID_FAB = dp.ID_FAB')
      .where('pp.ID_PRO = :id', { id })
      .andWhere('dp.CANT_ENVIADO > 0')
      .getRawMany();

    const historial = [...ventas, ...creditos, ...pedidos].map(item => ({
      fecha: item.fecha,
      tipo: item.tipo as 'VENTA' | 'CREDITO' | 'PEDIDO',
      cantidad: Number(item.cantidad || 0),
      referencia: item.referencia,
    }));

    historial.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return historial;
  }

  async getKardex(id: number): Promise<KardexDto> {
    const stock = await this.getStockSucursal(id);
    const ingresos = await this.getHistorialIngresos(id);
    const salidas = await this.getHistorialSalidas(id);

    const totalStockFisico = stock.reduce((sum, s) => sum + s.stockFisico, 0);
    const totalInventarioVirtual = stock.reduce((sum, s) => sum + s.inventarioVirtual, 0);

    const movimientos = [
      ...ingresos.map(i => ({ ...i, tipoOperacion: 'INGRESO' as const })),
      ...salidas.map(s => ({ ...s, tipoOperacion: 'SALIDA' as const }))
    ];

    movimientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    let saldoActual = totalStockFisico;
    
    const historialKardex = movimientos.map(mov => {
      const saldoEnEseMomento = saldoActual;
      
      if (mov.tipoOperacion === 'INGRESO') {
        saldoActual -= mov.cantidad;
      } else {
        saldoActual += mov.cantidad;
      }

      return {
        fecha: mov.fecha,
        tipoOperacion: mov.tipoOperacion,
        origen: mov.tipo,
        cantidad: mov.cantidad,
        referencia: mov.referencia,
        saldoAcumulado: saldoEnEseMomento,
      };
    });

    return {
      stockPorSucursal: stock,
      totalStockFisico,
      totalInventarioVirtual,
      movimientos: historialKardex,
    };
  }
  async getStockResumen(id: number) {
    const producto = await this.productoRepository.findOne({ where: { id } });
    if (!producto) {
      throw new NotFoundException(`El producto con ID ${id} no existe.`);
    }

    const almacenes = ['00004', '00005', '00006', '00007', '00010', '00011'];
    const codigos = almacenes.map((c) => `'${c}'`).join(',');

    const stock = await this.dataSource.query(`
      SELECT
        s.COD_SUC    as codSuc,
        s.NOM_SUC    as nomSuc,
        ISNULL(spp.CANTIDAD, 0) as cantidad,
        MAX(v.FECHA) as ultimaVenta
      FROM SUCURSAL s
      LEFT JOIN SUC_PRO_PROV spp
        ON spp.COD_SUC = s.COD_SUC
        AND spp.ID_FAB IN (
          SELECT ID_FAB FROM PROV_PRO WHERE ID_PRO = @0
        )
      LEFT JOIN DET_VENTA dv
        ON dv.ID_FAB = spp.ID_FAB
      LEFT JOIN VENTA v
        ON v.COD_VENTA = dv.COD_VENTA
        AND v.ESTADO = 'C'
        AND v.COD_INI = s.COD_SUC
      WHERE s.COD_SUC IN (${codigos})
      GROUP BY s.COD_SUC, s.NOM_SUC, spp.CANTIDAD
      ORDER BY s.COD_SUC ASC
    `, [id]);

    const hoy = new Date();

    const resultado = stock.map((row: any) => ({
      codSuc: row.codSuc,
      nomSuc: row.nomSuc,
      cantidad: Number(row.cantidad ?? 0),
      diasSinMovimiento: row.ultimaVenta
        ? Math.floor((hoy.getTime() - new Date(row.ultimaVenta).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    }));

    // Detalle del producto
    const detalle = await this.dataSource.query(`
      SELECT
        p.COD_PRO    as codSiam,
        MAX(pp.COD_FAB) as codFabrica,
        p.DESC_PRO   as descripcion,
        MAX(ma.NOM_MARCA) as marca
      FROM PRODUCTO p
      LEFT JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
      WHERE p.ID_PRO = @0
      GROUP BY p.COD_PRO, p.DESC_PRO
    `, [id]);

    return {
      detalle: detalle[0] ?? null,
      stockPorAlmacen: resultado,
    };
  }

  async getKardexPorAlmacen(
    id: number,
    codSuc?: string,
    fechaDesde?: string,
  ) {
    const producto = await this.productoRepository.findOne({ where: { id } });
    if (!producto) {
      throw new NotFoundException(`El producto con ID ${id} no existe.`);
    }

    const params: any[] = [id];
    let sucFiltro = '';
    let fechaFiltro = '';

    if (codSuc && codSuc !== 'TODOS') {
      params.push(codSuc);
      sucFiltro = `AND codSucFiltro = @${params.length - 1}`;
    }

    if (fechaDesde) {
      params.push(fechaDesde);
      fechaFiltro = `AND fecha >= @${params.length - 1}`;
    }

    const movimientos = await this.dataSource.query(`
      SELECT * FROM (

        SELECT
          re.FECHA              as fecha,
          dr.ID_FAB             as idFab,
          pp.COD_FAB            as codigo,
          'REMISION DE INGRESO' as descripcion,
          dr.CANTIDAD           as entrada,
          0                     as salida,
          dr.existencia         as existencia,
          re.COD_DES            as codSucFiltro,
          ISNULL(s.NOM_SUC, re.COD_DES) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, re.COD_USU) as usuario,
          re.OBS_REM            as observacion
        FROM DET_REMIE dr
        INNER JOIN REMISION_E re ON re.COD_REM = dr.COD_REM
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = dr.ID_FAB
        LEFT JOIN SUCURSAL s ON s.COD_SUC = re.COD_DES
        LEFT JOIN USUARIO u ON u.COD_USU = re.COD_USU
        WHERE pp.ID_PRO = @0

        UNION ALL

        SELECT
          rs.FECHA              as fecha,
          ds.ID_FAB             as idFab,
          pp.COD_FAB            as codigo,
          'REMISION DE SALIDA'  as descripcion,
          0                     as entrada,
          ds.CANTIDAD           as salida,
          0                     as existencia,
          rs.SUC_ORI            as codSucFiltro,
          ISNULL(s.NOM_SUC, rs.SUC_ORI) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, rs.COD_USU) as usuario,
          rs.OBS_REM            as observacion
        FROM DET_REMIS ds
        INNER JOIN REMISION_S rs ON rs.COD_REM = ds.COD_REM
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = ds.ID_FAB
        LEFT JOIN SUCURSAL s ON s.COD_SUC = rs.SUC_ORI
        LEFT JOIN USUARIO u ON u.COD_USU = rs.COD_USU
        WHERE pp.ID_PRO = @0

        UNION ALL

        SELECT
          inv.FEC_INV           as fecha,
          di.ID_FAB             as idFab,
          pp.COD_FAB            as codigo,
          'INVENTARIO'          as descripcion,
          CASE WHEN di.DIFERENCIA > 0 THEN di.DIFERENCIA ELSE 0 END as entrada,
          CASE WHEN di.DIFERENCIA < 0 THEN ABS(di.DIFERENCIA) ELSE 0 END as salida,
          di.CANTIDAD           as existencia,
          inv.COD_SUC           as codSucFiltro,
          ISNULL(s.NOM_SUC, inv.COD_SUC) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, inv.COD_USU) as usuario,
          ISNULL(di.OBS, inv.OBS) as observacion
        FROM DET_INVENTARIO di
        INNER JOIN INVENTARIO inv ON inv.COD_INV = di.COD_INV
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = di.ID_FAB
        LEFT JOIN SUCURSAL s ON s.COD_SUC = inv.COD_SUC
        LEFT JOIN USUARIO u ON u.COD_USU = inv.COD_USU
        WHERE pp.ID_PRO = @0

      ) AS kardex
      WHERE 1=1
      ${sucFiltro}
      ${fechaFiltro}
      ORDER BY fecha DESC
    `, params);

    const info = await this.dataSource.query(`
      SELECT
        p.COD_PRO         as codSiam,
        MAX(pp.COD_FAB)   as codFabrica,
        MAX(pp.ID_FAB)    as idFab,
        p.DESC_PRO        as descripcion,
        MAX(ma.NOM_MARCA) as marca
      FROM PRODUCTO p
      LEFT JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
      WHERE p.ID_PRO = @0
      GROUP BY p.COD_PRO, p.DESC_PRO
    `, [id]);

    // Quitar codSucFiltro del resultado final (uso interno)
    const movimientosLimpios = movimientos.map(({ codSucFiltro, ...resto }: any) => resto);

    return {
      info: info[0] ?? null,
      movimientos: movimientosLimpios,
    };
  }
  async getStockPorIdFab(idFab: number) {
    const stock = await this.dataSource.query(`
      SELECT
        spp.COD_SUC   as codSuc,
        s.NOM_SUC     as nomSuc,
        spp.CANTIDAD  as cantidad
      FROM SUC_PRO_PROV spp
      INNER JOIN SUCURSAL s ON s.COD_SUC = spp.COD_SUC
      WHERE spp.ID_FAB = @0
      AND spp.CANTIDAD > 0
      ORDER BY spp.CANTIDAD DESC
    `, [idFab]);

    const totalStock = stock.reduce((sum: number, s: any) => sum + Number(s.cantidad), 0);
    const stockMotorZone = stock.find((s: any) => s.codSuc === '00011')?.cantidad ?? 0;

    return {
      idFab,
      stockMotorZone: Number(stockMotorZone),
      totalStock,
      porAlmacen: stock,
    };
  }
}
