import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets, QueryRunner } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { SearchProductoDto } from './dto/search-producto.dto';
import { HistorialIngresoDto } from './dto/ingreso.dto';
import { StockSucursalDto } from './dto/stock.dto';
import { HistorialSalidaDto } from './dto/salida.dto';
import { KardexDto } from './dto/kardex.dto';
import { AdvancedSearchProductoDto } from './dto/advanced-search.dto';
import { TraspasoAlmacenDto } from './dto/traspaso-almacen.dto';
import { IngresoMercaderiaDto } from './dto/ingreso-mercaderia.dto';
import { UsuariosService, VendedorFirmante } from '../usuarios/usuarios.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

export const ALMACENES_AUTORIZADOS_MAC = [
  '00011', // MOTOR ZONE (Principal)
  '00005', // ALMACEN II
  '00006', // ALMACEN III
  '00007', // ALMACEN IV
  '00010', // ALMACEN 2H
  '00012', // DPTO MOTOR ZONE (DEPOSITO M.Z.)
  '00013', // ROD ZONE
  '00014', // DEPTO ROD ZONE (DEPOSITO ROD ZONE)
];

// Almacén principal: único desde el que se puede vender
export const COD_SUC_PRINCIPAL = '00011'; // MOTOR ZONE

// Sub-almacenes dentro de Motor Zone. Desde estos el traspaso al principal
// EXIGE la firma del vendedor (reemplaza al talonario físico).
// TODO: completar con los códigos reales cuando se ubiquen en la BD.
export const SUBALMACENES_MOTORZONE: string[] = [];

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    private readonly dataSource: DataSource,
    private readonly usuariosService: UsuariosService,
  ) {}

  async search(searchDto: SearchProductoDto, cod_emp: string) {
    const { q, limit } = searchDto;
    const take = limit || 20;
    const term = `"${q}*"`;
    const termLike = `%${q}%`;

    const items = await this.dataSource.query(`
      SELECT
        p.ID_PRO     as id,
        p.COD_PRO    as codPro,
        p.DESC_PRO   as descPro,
        p.ESTADO     as estado,
        p.CODIGO     as codigo,
        pp.COD_FAB   as codFab,
        pp.barra     as barra,
        pp.COD_ANT   as codAnt,
        pr.NOM_PROV  as marca,
        mo.NOM_MODELO as modelo,
        pp.PLIS_PRO  as plisPro,
        pp.PMIN_PRO  as pminPro,
        pp.PMAY_PRO  as pmayPro,
        pp.CIFFSus   as ciffSus,
        pp.ID_FAB    as idFab,
        pp.PLIS_BS   as plisBs,
        pp.PMIN_BS   as pminBs,
        pp.PMAY_BS   as pmayBs
      FROM PRODUCTO p
      INNER JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN PROVEEDOR pr ON pr.COD_PROV = pp.COD_PROV
      WHERE p.ESTADO = 'A'
      AND pp.BAJA = 'N'
      AND p.COD_EMP = @3
      AND (
        CONTAINS(p.DESC_PRO, @0) OR
        pp.COD_FAB LIKE @1 COLLATE SQL_Latin1_General_CP1_CI_AI
      )
      ORDER BY p.DESC_PRO ASC, pp.ID_FAB ASC
      OFFSET 0 ROWS FETCH NEXT @2 ROWS ONLY
    `, [term, termLike, take, cod_emp]);

    return { data: items, limit: take };
  }

  async searchByCodigo(searchDto: SearchProductoDto, cod_emp: string) {
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
      .where('producto.COD_EMP = :cod_emp', { cod_emp })
      .andWhere(new Brackets((qb) => {
        qb.where('producto.COD_PRO LIKE :q', { q: `%${q}%` })
          .orWhere('producto.CODIGO LIKE :q', { q: `%${q}%` })
          .orWhere('pp.COD_FAB LIKE :q', { q: `%${q}%` })
          .orWhere('pp.barra LIKE :q', { q: `%${q}%` })
          .orWhere('pp.COD_ANT LIKE :q', { q: `%${q}%` });
      }))
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
        id: item.id, codPro: item.codPro, descPro: item.descPro,
        estado: item.estado, codigo: item.codigo, codFab: item.codFab,
        barra: item.barra, codAnt: item.codAnt
      })),
      limit: take,
    };
  }

  async searchAdvanced(searchDto: AdvancedSearchProductoDto, cod_emp: string) {
    const { q, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;
    const term = q ? `"${q}*"` : null;
    const termLike = q ? `%${q}%` : null;

    if (!term) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const items = await this.dataSource.query(`
      SELECT
        p.ID_PRO      as id,
        p.COD_PRO     as codPro,
        p.DESC_PRO    as descPro,
        p.ESTADO      as estado,
        p.CODIGO      as codigo,
        pp.COD_FAB    as codFab,
        pp.barra      as barra,
        pp.COD_ANT    as codAnt,
        pr.NOM_PROV   as marca,
        mo.NOM_MODELO as modelo,
        pp.PLIS_PRO   as plisPro,
        pp.PMIN_PRO   as pminPro,
        pp.PMAY_PRO   as pmayPro,
        pp.CIFFSus    as ciffSus,
        pp.ID_FAB     as idFab,
        pp.PLIS_BS    as plisBs,
        pp.PMIN_BS    as pminBs,
        pp.PMAY_BS    as pmayBs
      FROM PRODUCTO p
      INNER JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN PROVEEDOR pr ON pr.COD_PROV = pp.COD_PROV
      WHERE p.ESTADO = 'A'
      AND pp.BAJA = 'N'
      AND p.COD_EMP = @2
      AND (
        CONTAINS(p.DESC_PRO, @0) OR
        pp.COD_FAB LIKE @1 COLLATE SQL_Latin1_General_CP1_CI_AI
      )
      ORDER BY p.DESC_PRO ASC, pp.ID_FAB ASC
      OFFSET @3 ROWS FETCH NEXT @4 ROWS ONLY
    `, [term, termLike, cod_emp, skip, limit]);

    const countResult = await this.dataSource.query(`
      SELECT COUNT(*) as total
      FROM PRODUCTO p
      INNER JOIN PROV_PRO pp ON pp.ID_PRO = p.ID_PRO
      WHERE p.ESTADO = 'A'
      AND pp.BAJA = 'N'
      AND p.COD_EMP = @2
      AND (
        CONTAINS(p.DESC_PRO, @0) OR
        pp.COD_FAB LIKE @1 COLLATE SQL_Latin1_General_CP1_CI_AI
      )
    `, [term, termLike, cod_emp]);

    const total = Number(countResult[0]?.total || 0);

    return {
      data: items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getHistorialIngresos(id: number, cod_emp: string): Promise<HistorialIngresoDto[]> {
    const producto = await this.productoRepository.findOne({ where: { id, codEmp: cod_emp } });  if (!producto) {
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

  async getStockSucursal(id: number, cod_emp: string): Promise<StockSucursalDto[]> {
    const producto = await this.productoRepository.findOne({ where: { id, codEmp: cod_emp } });
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

 async getHistorialSalidas(id: number, cod_emp: string): Promise<HistorialSalidaDto[]> {
  const producto = await this.productoRepository.findOne({ where: { id, codEmp: cod_emp } });
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

  async getKardex(id: number, cod_emp: string): Promise<KardexDto> {
  const stock = await this.getStockSucursal(id, cod_emp);
  const ingresos = await this.getHistorialIngresos(id, cod_emp);
  const salidas = await this.getHistorialSalidas(id, cod_emp);

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
  async getStockResumen(id: number, cod_emp: string) {
  const producto = await this.productoRepository.findOne({ where: { id, codEmp: cod_emp } });
  if (!producto) {
    throw new NotFoundException(`El producto con ID ${id} no existe.`);
  }

    const almacenes = ['00004', '00005', '00006', '00007', '00010', '00011'];
    const codigos = almacenes.map((c) => `'${c}'`).join(',');

    const stock = await this.dataSource.query(`
      SELECT
        s.COD_SUC     as codSuc,
        s.NOM_SUC     as nomSuc,
        pp.ID_FAB     as idFab,
        pp.COD_FAB    as codFab,
        pr.NOM_PROV   as proveedor,
        ISNULL(spp.CANTIDAD, 0) as cantidad,
        ultimaVenta.fecha as ultimaVenta
      FROM PROV_PRO pp
      CROSS JOIN SUCURSAL s
      LEFT JOIN SUC_PRO_PROV spp
        ON spp.ID_FAB = pp.ID_FAB
        AND spp.COD_SUC = s.COD_SUC
      LEFT JOIN PROVEEDOR pr ON pr.COD_PROV = pp.COD_PROV
      OUTER APPLY (
        SELECT MAX(v.FECHA) as fecha
        FROM DET_VENTA dv
        INNER JOIN VENTA v ON v.COD_VENTA = dv.COD_VENTA
        INNER JOIN USUARIO u ON u.COD_USU = v.COD_USU
        WHERE dv.ID_FAB = pp.ID_FAB
          AND u.COD_SUC = s.COD_SUC
          AND v.ESTADO IN ('C', 'D')
      ) ultimaVenta
      WHERE pp.ID_PRO = @0
        AND pp.BAJA = 'N'
        AND s.COD_SUC IN (${codigos})
      ORDER BY pp.ID_FAB ASC, ISNULL(spp.CANTIDAD, 0) DESC
    `, [id]);

    const hoy = new Date();

    const resultado = stock.map((row: any) => ({
      codSuc: row.codSuc,
      nomSuc: row.nomSuc,
      idFab: row.idFab,
      codFab: row.codFab,
      proveedor: row.proveedor,
      cantidad: Number(row.cantidad ?? 0),
      diasSinMovimiento: row.ultimaVenta
        ? Math.floor((hoy.getTime() - new Date(row.ultimaVenta).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    }));

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

  async getKardexPorAlmacen(id: number, cod_emp: string, codSuc?: string, fechaDesde?: string) {
  const producto = await this.productoRepository.findOne({ where: { id, codEmp: cod_emp } });
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
      WITH productos_fab AS (
        SELECT ID_FAB FROM PROV_PRO WHERE ID_PRO = @0
      )
      SELECT * FROM (

        -- REMISION DE INGRESO
        SELECT
          re.FECHA                as fecha,
          dr.ID_FAB               as idFab,
          pp.COD_FAB              as codigo,
          'REMISION DE INGRESO'   as descripcion,
          dr.CANTIDAD             as entrada,
          0                       as salida,
          dr.existencia           as existencia,
          re.COD_DES              as codSucFiltro,
          ISNULL(s.NOM_SUC, re.COD_DES) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, re.COD_USU) as usuario,
          NULL                    as cliente,
          re.OBS_REM              as observacion
        FROM DET_REMIE dr
        INNER JOIN REMISION_E re ON re.COD_REM = dr.COD_REM
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = dr.ID_FAB
        LEFT JOIN SUCURSAL s ON s.COD_SUC = re.COD_DES
        LEFT JOIN USUARIO u ON u.COD_USU = re.COD_USU
        WHERE dr.ID_FAB IN (SELECT ID_FAB FROM productos_fab)

        UNION ALL

        -- REMISION DE SALIDA
        SELECT
          rs.FECHA                as fecha,
          ds.ID_FAB               as idFab,
          pp.COD_FAB              as codigo,
          'REMISION DE SALIDA'    as descripcion,
          0                       as entrada,
          ds.CANTIDAD             as salida,
          0                       as existencia,
          rs.SUC_ORI              as codSucFiltro,
          ISNULL(s.NOM_SUC, rs.SUC_ORI) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, rs.COD_USU) as usuario,
          NULL                    as cliente,
          rs.OBS_REM              as observacion
        FROM DET_REMIS ds
        INNER JOIN REMISION_S rs ON rs.COD_REM = ds.COD_REM
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = ds.ID_FAB
        LEFT JOIN SUCURSAL s ON s.COD_SUC = rs.SUC_ORI
        LEFT JOIN USUARIO u ON u.COD_USU = rs.COD_USU
        WHERE ds.ID_FAB IN (SELECT ID_FAB FROM productos_fab)

        UNION ALL

        -- INVENTARIO
        SELECT
          inv.FEC_INV             as fecha,
          di.ID_FAB               as idFab,
          pp.COD_FAB              as codigo,
          'INVENTARIO'            as descripcion,
          CASE WHEN di.DIFERENCIA > 0 THEN di.DIFERENCIA ELSE 0 END as entrada,
          CASE WHEN di.DIFERENCIA < 0 THEN ABS(di.DIFERENCIA) ELSE 0 END as salida,
          di.CANTIDAD             as existencia,
          inv.COD_SUC             as codSucFiltro,
          ISNULL(s.NOM_SUC, inv.COD_SUC) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, inv.COD_USU) as usuario,
          NULL                    as cliente,
          ISNULL(di.OBS, inv.OBS) as observacion
        FROM DET_INVENTARIO di
        INNER JOIN INVENTARIO inv ON inv.COD_INV = di.COD_INV
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = di.ID_FAB
        LEFT JOIN SUCURSAL s ON s.COD_SUC = inv.COD_SUC
        LEFT JOIN USUARIO u ON u.COD_USU = inv.COD_USU
        WHERE di.ID_FAB IN (SELECT ID_FAB FROM productos_fab)

        UNION ALL

        -- VENTA
        SELECT
          v.FECHA                 as fecha,
          dv.ID_FAB               as idFab,
          pp.COD_FAB              as codigo,
          'VENTA'                 as descripcion,
          0                       as entrada,
          dv.CANTIDAD             as salida,
          0                       as existencia,
          u.COD_SUC               as codSucFiltro,
          ISNULL(s.NOM_SUC, u.COD_SUC) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, v.COD_USU) as usuario,
          ISNULL(c.RAZON_SOCIAL, c.NOM_CLI + ' ' + c.APE_CLI) as cliente,
          v.OBS                   as observacion
        FROM DET_VENTA dv
        INNER JOIN VENTA v ON v.COD_VENTA = dv.COD_VENTA
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = dv.ID_FAB
        INNER JOIN USUARIO u ON u.COD_USU = v.COD_USU
        LEFT JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
        LEFT JOIN CLIENTE c ON c.cod_cli = v.COD_CLI
        WHERE dv.ID_FAB IN (SELECT ID_FAB FROM productos_fab)
        AND v.ESTADO IN ('C', 'D')

        UNION ALL

        -- CREDITO
        SELECT
          cr.FEC_INICIO           as fecha,
          dc.ID_FAB               as idFab,
          pp.COD_FAB              as codigo,
          'CREDITO'               as descripcion,
          0                       as entrada,
          dc.CANTIDAD             as salida,
          0                       as existencia,
          u.COD_SUC               as codSucFiltro,
          ISNULL(s.NOM_SUC, u.COD_SUC) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, cr.COD_USU) as usuario,
          ISNULL(c.RAZON_SOCIAL, c.NOM_CLI + ' ' + c.APE_CLI) as cliente,
          NULL                    as observacion
        FROM DET_CREDITO dc
        INNER JOIN CREDITO cr ON cr.COD_CRE = dc.COD_CRE
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = dc.ID_FAB
        INNER JOIN USUARIO u ON u.COD_USU = cr.COD_USU
        LEFT JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
        LEFT JOIN CLIENTE c ON c.cod_cli = cr.COD_CLI
        WHERE dc.ID_FAB IN (SELECT ID_FAB FROM productos_fab)
        AND cr.ESTADO != 'A'

        UNION ALL

        -- DEVOLUCION
        SELECT
          d.FECHA                 as fecha,
          dd.ID_FAB               as idFab,
          pp.COD_FAB              as codigo,
          'DEVOLUCION'            as descripcion,
          dd.CANTIDAD             as entrada,
          0                       as salida,
          0                       as existencia,
          u.COD_SUC               as codSucFiltro,
          ISNULL(s.NOM_SUC, u.COD_SUC) as sucursal,
          ISNULL(u.NOM_USU + ' ' + u.AP_USU, d.COD_USU) as usuario,
          NULL                    as cliente,
          d.OBS                   as observacion
        FROM DET_DEVOLUCION dd
        INNER JOIN DEVOLUCION d ON d.COD_VENTA = dd.COD_VENTA
        INNER JOIN PROV_PRO pp ON pp.ID_FAB = dd.ID_FAB
        INNER JOIN VENTA v ON v.COD_VENTA = d.COD_VENTA
        INNER JOIN USUARIO u ON u.COD_USU = d.COD_USU
        LEFT JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
        WHERE dd.ID_FAB IN (SELECT ID_FAB FROM productos_fab)

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

    const movimientosLimpios = movimientos.map(({ codSucFiltro, ...resto }: any) => resto);

    return {
      info: info[0] ?? null,
      movimientos: movimientosLimpios,
    };
  }
  async getStockPorIdFab(idFab: number, cod_emp: string) {
    const producto = await this.dataSource.query(`
      SELECT p.ID_PRO
      FROM PROV_PRO pp
      INNER JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
      WHERE pp.ID_FAB = @0 AND p.COD_EMP = @1
    `, [idFab, cod_emp]);

    if (producto.length === 0) {
      throw new NotFoundException(`El producto con ID_FAB ${idFab} no existe`);
    }

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

  // ─────────────────────────────────────────
  // Códigos correlativos de remisión
  // ─────────────────────────────────────────
  private async generarCodRemSalida(
    queryRunner: QueryRunner,
    sucOri: string,
    sucDes: string,
  ): Promise<string> {
    const year2 = new Date().getFullYear().toString().slice(-2);
    const prefix = `${sucOri}${year2}${sucDes}`;

    const result = await queryRunner.query(
      `
      SELECT TOP 1 COD_REM
      FROM REMISION_S
      WHERE COD_REM LIKE @0
      ORDER BY COD_REM DESC
    `,
      [`${prefix}%`],
    );

    let secuencial = 0;
    if (result.length > 0) {
      const ultimo = result[0].COD_REM as string;
      const ultimoSec = parseInt(ultimo.slice(-4), 10);
      secuencial = isNaN(ultimoSec) ? 0 : ultimoSec;
    }

    const sec = (secuencial + 1).toString().padStart(4, '0');
    return `${prefix}${sec}`;
  }

  private async generarCodRemEntrada(
    queryRunner: QueryRunner,
    codDes: string,
  ): Promise<string> {
    const year4 = new Date().getFullYear().toString();
    const prefix = `${codDes}${year4}`;

    const result = await queryRunner.query(
      `
      SELECT TOP 1 COD_REM
      FROM REMISION_E
      WHERE COD_REM LIKE @0
      ORDER BY COD_REM DESC
    `,
      [`${prefix}%`],
    );

    let secuencial = 0;
    if (result.length > 0) {
      const ultimo = result[0].COD_REM as string;
      const ultimoSec = parseInt(ultimo.slice(-4), 10);
      secuencial = isNaN(ultimoSec) ? 0 : ultimoSec;
    }

    const sec = (secuencial + 1).toString().padStart(4, '0');
    return `${prefix}${sec}`;
  }

  // ─────────────────────────────────────────
  // Almacenes disponibles autorizados (Empresa MAC)
  // ─────────────────────────────────────────
  async getAlmacenesDisponibles() {
    const codigos = ALMACENES_AUTORIZADOS_MAC.map((c) => `'${c}'`).join(',');
    const almacenes = await this.dataSource.query(`
      SELECT
        s.COD_SUC as codSuc,
        s.NOM_SUC as nomSuc,
        s.COD_EMP as codEmp,
        e.NOM_EMP as nomEmp
      FROM SUCURSAL s
      LEFT JOIN EMPRESA e ON e.COD_EMP = s.COD_EMP
      WHERE s.COD_SUC IN (${codigos})
      ORDER BY CASE WHEN s.COD_SUC = '00011' THEN 0 ELSE 1 END, s.NOM_SUC ASC
    `);
    return almacenes;
  }

  // ─────────────────────────────────────────
  // Movimiento entre almacenes (Traspaso)
  // ─────────────────────────────────────────
  async registrarTraspasoAlmacenes(dto: TraspasoAlmacenDto, encargado: JwtPayload, cod_emp: string) {
    const { cod_suc_ori, obs, items } = dto;
    const cod_suc_des = dto.cod_suc_des || COD_SUC_PRINCIPAL; // Destino por defecto: MOTOR ZONE

    // Quien autoriza es el usuario autenticado (encargado del almacén de origen)
    const cod_usu_encargado = encargado?.cod_usu;
    if (!cod_usu_encargado) {
      throw new ForbiddenException('No se pudo identificar al encargado que autoriza el traspaso.');
    }
    const almacenesEncargado = (encargado.almacenes ?? []).map((a) => a.codSuc);
    if (!almacenesEncargado.includes(cod_suc_ori)) {
      throw new ForbiddenException(
        `No tiene asignado el almacén de origen ${cod_suc_ori}; no puede autorizar este traspaso.`,
      );
    }

    // Firma del vendedor: obligatoria desde sub-almacenes de Motor Zone,
    // opcional en los demás traspasos (si se envía, se valida y registra igual)
    const firmaEnviada = !!(dto.cod_usu_vendedor || dto.password_vendedor);
    const firmaObligatoria = SUBALMACENES_MOTORZONE.includes(cod_suc_ori);
    let vendedor: VendedorFirmante | null = null;

    if (firmaObligatoria || firmaEnviada) {
      if (!dto.cod_usu_vendedor || !dto.password_vendedor) {
        throw new BadRequestException(
          'El vendedor debe firmar el traspaso: seleccione su usuario e ingrese su contraseña.',
        );
      }
      if (dto.cod_usu_vendedor === cod_usu_encargado) {
        throw new BadRequestException('El vendedor que firma no puede ser el mismo encargado que autoriza.');
      }
      vendedor = await this.usuariosService.verificarFirmaVendedor(
        dto.cod_usu_vendedor,
        dto.password_vendedor,
        cod_emp,
      );
    }

    // En la remisión legacy: COD_USU = quien emite (encargado),
    // COD_USU_REB = quien recibe (vendedor que firma; si no hay firma, el encargado)
    const cod_usu = cod_usu_encargado;
    const cod_usu_recibe = vendedor?.cod_usu ?? cod_usu_encargado;

    if (!ALMACENES_AUTORIZADOS_MAC.includes(cod_suc_ori)) {
      throw new BadRequestException(
        `El almacén de origen ${cod_suc_ori} no está autorizado para movimientos.`,
      );
    }
    if (!ALMACENES_AUTORIZADOS_MAC.includes(cod_suc_des)) {
      throw new BadRequestException(
        `El almacén de destino ${cod_suc_des} no está autorizado para movimientos.`,
      );
    }
    if (cod_suc_ori === cod_suc_des) {
      throw new BadRequestException(
        'El almacén de origen y destino no pueden ser el mismo.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validar stock y recopilar datos de cada ítem
      const itemsValidados: {
        id_fab: number;
        cod_fab: string;
        cantidad: number;
        cif: number;
        obs?: string;
      }[] = [];

      for (const item of items) {
        // Stock en origen
        const stockOrigen = await queryRunner.query(
          `
          SELECT ISNULL(CANTIDAD, 0) as cantidad, COD_FAB
          FROM SUC_PRO_PROV
          WHERE ID_FAB = @0 AND COD_SUC = @1
        `,
          [item.id_fab, cod_suc_ori],
        );

        const disponible = stockOrigen.length > 0 ? Number(stockOrigen[0].cantidad) : 0;
        if (disponible < item.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente en almacén de origen (${cod_suc_ori}) para ID_FAB ${item.id_fab}. Disponible: ${disponible}, Solicitado: ${item.cantidad}`,
          );
        }

        // Datos del producto
        const provPro = await queryRunner.query(
          `
          SELECT COD_FAB, ISNULL(CIF_CBBA, 0) as cif
          FROM PROV_PRO
          WHERE ID_FAB = @0
        `,
          [item.id_fab],
        );

        const codFab = provPro[0]?.COD_FAB || stockOrigen[0]?.COD_FAB || '';
        const cif = Number(provPro[0]?.cif || 0);

        itemsValidados.push({
          id_fab: item.id_fab,
          cod_fab: codFab,
          cantidad: item.cantidad,
          cif,
          obs: item.obs,
        });
      }

      const totalCif = itemsValidados.reduce((sum, it) => sum + it.cantidad * it.cif, 0);
      const fecha = new Date();

      // 2. Generar códigos correlativos
      const codRemS = await this.generarCodRemSalida(queryRunner, cod_suc_ori, cod_suc_des);
      const codRemE = await this.generarCodRemEntrada(queryRunner, cod_suc_des);
      const obsTexto = obs?.trim() ? obs : 'Traspaso entre almacenes';

      // 3. Insertar REMISION_S (Salida del almacén origen)
      await queryRunner.query(
        `
        INSERT INTO REMISION_S (
          COD_REM, COD_USU, SUC_DES, SUC_ORI, FECHA, OBS_REM,
          revisado, DESCARGADO, ACEPTADO, ESTADO, TOTAL,
          COD_USU_REB, COD_USU_REB_DESC, COD_PEDIDO, MEDIO_ENVIO,
          FECHA_ENVIO, NOMBRE_ENVIO, COD_USU_CIF, USUARIO_DESCARGA,
          virtual, SUC_TRANSITO, nro_nota, usu_count
        ) VALUES (
          @0, @1, @2, @3, @4, @5,
          'S', 'S', 'S', 'A', @6,
          @7, @8, '1', 'INTERNO',
          @9, 'SISTEMA', @10, 'SISTEMA',
          0, '01000', '', '1'
        )
      `,
        [
          codRemS,
          cod_usu,
          cod_suc_des,
          cod_suc_ori,
          fecha,
          obsTexto,
          totalCif,
          cod_usu_recibe, // COD_USU_REB
          cod_usu_recibe, // COD_USU_REB_DESC
          fecha,
          cod_usu,        // COD_USU_CIF
        ],
      );

      // 4. Insertar DET_REMIS y descontar stock de origen
      for (let i = 0; i < itemsValidados.length; i++) {
        const it = itemsValidados[i];
        const cifTotal = it.cantidad * it.cif;

        await queryRunner.query(
          `
          INSERT INTO DET_REMIS (
            COD_REM, COD_FAB, CANTIDAD, CIF_TOTAL, OBS, NRO, FOB_TOTAL, ID_FAB
          ) VALUES (
            @0, @1, @2, @3, @4, @5, 0, @6
          )
        `,
          [codRemS, it.cod_fab, it.cantidad, cifTotal, it.obs || '', i + 1, it.id_fab],
        );

        await queryRunner.query(
          `
          UPDATE SUC_PRO_PROV
          SET CANTIDAD = CANTIDAD - @0
          WHERE ID_FAB = @1 AND COD_SUC = @2
        `,
          [it.cantidad, it.id_fab, cod_suc_ori],
        );
      }

      // 5. Insertar REMISION_E (Entrada en almacén destino)
      await queryRunner.query(
        `
        INSERT INTO REMISION_E (
          COD_REM, COD_REMI, COD_USU, COD_ORI, COD_DES, FECHA,
          OBS_REM, estado, TOTAL, USUARIO_DESCARGA, saw, FECHA_DESCARGA
        ) VALUES (
          @0, @1, @2, @3, @4, @5,
          @6, 'D', @7, 'SISTEMA', 'N', @8
        )
      `,
        [
          codRemE,
          codRemS, // Link a la remisión de salida
          cod_usu_recibe,
          cod_suc_ori,
          cod_suc_des,
          fecha,
          obsTexto,
          totalCif,
          fecha,
        ],
      );

      // 6. Insertar DET_REMIE e incrementar stock en destino
      for (let i = 0; i < itemsValidados.length; i++) {
        const it = itemsValidados[i];
        const cifTotal = it.cantidad * it.cif;

        await queryRunner.query(
          `
          INSERT INTO DET_REMIE (
            COD_REM, COD_FAB, CANTIDAD, CIF_TOTAL, NRO, existencia,
            ID_FAB, cant_ctrl, fecha, cod_usu, obs, ok
          ) VALUES (
            @0, @1, @2, @3, @4, 0,
            @5, @6, @7, @8, @9, 1
          )
        `,
          [
            codRemE,
            it.cod_fab,
            it.cantidad,
            cifTotal,
            i + 1,
            it.id_fab,
            it.cantidad,
            fecha,
            cod_usu_recibe,
            it.obs || null,
          ],
        );

        // Actualizar o crear stock en destino
        const existeDestino = await queryRunner.query(
          `
          SELECT CANTIDAD FROM SUC_PRO_PROV WHERE ID_FAB = @0 AND COD_SUC = @1
        `,
          [it.id_fab, cod_suc_des],
        );

        if (existeDestino.length > 0) {
          await queryRunner.query(
            `
            UPDATE SUC_PRO_PROV
            SET CANTIDAD = CANTIDAD + @0
            WHERE ID_FAB = @1 AND COD_SUC = @2
          `,
            [it.cantidad, it.id_fab, cod_suc_des],
          );
        } else {
          await queryRunner.query(
            `
            INSERT INTO SUC_PRO_PROV (COD_SUC, COD_FAB, CANTIDAD, STOCK_MIN, cantidad_virtual, ID_FAB)
            VALUES (@0, @1, @2, 0, 0, @3)
          `,
            [cod_suc_des, it.cod_fab, it.cantidad, it.id_fab],
          );
        }
      }

      // 7. Registrar la autorización firmada (reemplaza al talonario físico).
      //    Fecha y hora las genera SQL Server en hora de Bolivia (DEFAULT de la
      //    tabla), no la PC del encargado ni el backend.
      let autorizacion: { idTa: number; fecha: string; hora: string } | null = null;
      if (vendedor) {
        const filas = await queryRunner.query(
          `
          INSERT INTO SISTEMA_TRASPASO_AUTORIZACION (
            COD_REM, COD_REM_E, SUC_ORI, SUC_DES,
            COD_USU_ENCARGADO, COD_USU_VENDEDOR, ESTADO, OBS
          )
          OUTPUT
            INSERTED.ID_TA                             AS idTa,
            CONVERT(VARCHAR(10), INSERTED.FECHA, 23)   AS fecha,
            CONVERT(VARCHAR(8),  INSERTED.HORA, 108)   AS hora
          VALUES (@0, @1, @2, @3, @4, @5, 'PENDIENTE', @6)
        `,
          [codRemS, codRemE, cod_suc_ori, cod_suc_des, cod_usu_encargado, vendedor.cod_usu, obsTexto.slice(0, 512)],
        );
        autorizacion = filas[0] ?? null;
      }

      await queryRunner.commitTransaction();

      return {
        message: 'Traspaso de mercadería registrado exitosamente',
        codRemSalida: codRemS,
        codRemEntrada: codRemE,
        origen: cod_suc_ori,
        destino: cod_suc_des,
        fecha,
        itemsProcesados: itemsValidados.length,
        autorizadoPor: cod_usu_encargado,
        firma: vendedor && autorizacion
          ? {
              idAutorizacion: autorizacion.idTa,
              vendedor: { codUsu: vendedor.cod_usu, alias: vendedor.alias, nombre: vendedor.nombreCompleto },
              fechaBolivia: autorizacion.fecha,
              horaBolivia: autorizacion.hora,
              estado: 'PENDIENTE',
            }
          : null,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────
  // Actualización de mercadería (Ingreso de stock)
  // ─────────────────────────────────────────
  async registrarIngresoMercaderia(dto: IngresoMercaderiaDto) {
    const { cod_suc, cod_usu, obs, items } = dto;

    if (!ALMACENES_AUTORIZADOS_MAC.includes(cod_suc)) {
      throw new BadRequestException(
        `El almacén ${cod_suc} no está autorizado para ingreso de mercadería.`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const itemsValidados: {
        id_fab: number;
        cod_fab: string;
        cantidad: number;
        cif: number;
        obs?: string;
      }[] = [];

      for (const item of items) {
        const provPro = await queryRunner.query(
          `
          SELECT COD_FAB, ISNULL(CIF_CBBA, 0) as cif
          FROM PROV_PRO
          WHERE ID_FAB = @0
        `,
          [item.id_fab],
        );

        if (provPro.length === 0) {
          throw new NotFoundException(`El ítem con ID_FAB ${item.id_fab} no existe.`);
        }

        itemsValidados.push({
          id_fab: item.id_fab,
          cod_fab: provPro[0].COD_FAB,
          cantidad: item.cantidad,
          cif: Number(provPro[0].cif || 0),
          obs: item.obs,
        });
      }

      const totalCif = itemsValidados.reduce((sum, it) => sum + it.cantidad * it.cif, 0);
      const fecha = new Date();
      const codRemE = await this.generarCodRemEntrada(queryRunner, cod_suc);
      const obsTexto = obs?.trim() ? obs : 'Actualización de mercadería';

      // Insertar REMISION_E
      await queryRunner.query(
        `
        INSERT INTO REMISION_E (
          COD_REM, COD_REMI, COD_USU, COD_ORI, COD_DES, FECHA,
          OBS_REM, estado, TOTAL, USUARIO_DESCARGA, saw, FECHA_DESCARGA
        ) VALUES (
          @0, 'ACTUALIZACION', @1, '01000', @2, @3,
          @4, 'D', @5, 'SISTEMA', 'N', @6
        )
      `,
        [codRemE, cod_usu, cod_suc, fecha, obsTexto, totalCif, fecha],
      );

      // Insertar DET_REMIE e incrementar stock
      for (let i = 0; i < itemsValidados.length; i++) {
        const it = itemsValidados[i];
        const cifTotal = it.cantidad * it.cif;

        await queryRunner.query(
          `
          INSERT INTO DET_REMIE (
            COD_REM, COD_FAB, CANTIDAD, CIF_TOTAL, NRO, existencia,
            ID_FAB, cant_ctrl, fecha, cod_usu, obs, ok
          ) VALUES (
            @0, @1, @2, @3, @4, 0,
            @5, @6, @7, @8, @9, 1
          )
        `,
          [
            codRemE,
            it.cod_fab,
            it.cantidad,
            cifTotal,
            i + 1,
            it.id_fab,
            it.cantidad,
            fecha,
            cod_usu,
            it.obs || null,
          ],
        );

        const existeDestino = await queryRunner.query(
          `
          SELECT CANTIDAD FROM SUC_PRO_PROV WHERE ID_FAB = @0 AND COD_SUC = @1
        `,
          [it.id_fab, cod_suc],
        );

        if (existeDestino.length > 0) {
          await queryRunner.query(
            `
            UPDATE SUC_PRO_PROV
            SET CANTIDAD = CANTIDAD + @0
            WHERE ID_FAB = @1 AND COD_SUC = @2
          `,
            [it.cantidad, it.id_fab, cod_suc],
          );
        } else {
          await queryRunner.query(
            `
            INSERT INTO SUC_PRO_PROV (COD_SUC, COD_FAB, CANTIDAD, STOCK_MIN, cantidad_virtual, ID_FAB)
            VALUES (@0, @1, @2, 0, 0, @3)
          `,
            [cod_suc, it.cod_fab, it.cantidad, it.id_fab],
          );
        }
      }

      await queryRunner.commitTransaction();

      return {
        message: 'Ingreso de mercadería registrado exitosamente',
        codRemEntrada: codRemE,
        almacen: cod_suc,
        fecha,
        itemsProcesados: itemsValidados.length,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────
  // Historial de Traspasos (Hojas de Remisión Digitales)
  // ─────────────────────────────────────────
  async getHistorialTraspasos(
    fecha?: string,
    cod_suc_ori?: string,
    page = 1,
    limit = 50,
  ) {
    const skip = (page - 1) * limit;
    const params: any[] = [];
    let whereClauses = "WHERE rs.SUC_DES = '00011'"; // Hacia Motor Zone

    if (fecha) {
      params.push(fecha);
      whereClauses += ` AND CAST(rs.FECHA AS DATE) = @${params.length - 1}`;
    }

    if (cod_suc_ori) {
      params.push(cod_suc_ori);
      whereClauses += ` AND rs.SUC_ORI = @${params.length - 1}`;
    }

    const remisiones = await this.dataSource.query(`
      SELECT
        rs.COD_REM    as codRemSalida,
        re.COD_REM    as codRemEntrada,
        rs.FECHA      as fecha,
        rs.SUC_ORI    as codSucOri,
        so.NOM_SUC    as nomSucOri,
        rs.SUC_DES    as codSucDes,
        sd.NOM_SUC    as nomSucDes,
        rs.COD_USU    as codUsu,
        ISNULL(u.NOM_USU + ' ' + u.AP_USU, rs.COD_USU) as nombreCajero,
        rs.OBS_REM    as obs,
        rs.TOTAL      as totalCif,
        ta.ID_TA      as idAutorizacion,
        ta.COD_USU_ENCARGADO as codUsuEncargado,
        ISNULL(ue.NOM_USU + ' ' + ue.AP_USU, ta.COD_USU_ENCARGADO) as nombreEncargado,
        ta.COD_USU_VENDEDOR  as codUsuVendedor,
        ISNULL(uv.NOM_USU + ' ' + uv.AP_USU, ta.COD_USU_VENDEDOR) as nombreVendedor,
        CONVERT(VARCHAR(10), ta.FECHA, 23) as fechaFirma,
        CONVERT(VARCHAR(8),  ta.HORA, 108) as horaFirma,
        ta.ESTADO     as estadoFirma
      FROM REMISION_S rs
      LEFT JOIN REMISION_E re ON re.COD_REMI = rs.COD_REM
      LEFT JOIN SUCURSAL so ON so.COD_SUC = rs.SUC_ORI
      LEFT JOIN SUCURSAL sd ON sd.COD_SUC = rs.SUC_DES
      LEFT JOIN USUARIO u ON u.COD_USU = rs.COD_USU
      LEFT JOIN SISTEMA_TRASPASO_AUTORIZACION ta ON ta.COD_REM = rs.COD_REM
      LEFT JOIN USUARIO ue ON ue.COD_USU = ta.COD_USU_ENCARGADO
      LEFT JOIN USUARIO uv ON uv.COD_USU = ta.COD_USU_VENDEDOR
      ${whereClauses}
      ORDER BY rs.FECHA DESC
      OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY
    `, params);

    const cods = remisiones.map((r: any) => `'${r.codRemSalida}'`).join(',');
    let itemsDetalle: any[] = [];
    if (cods.length > 0) {
      itemsDetalle = await this.dataSource.query(`
        SELECT
          ds.COD_REM   as codRemSalida,
          ds.ID_FAB    as idFab,
          ds.COD_FAB   as codFab,
          ds.CANTIDAD  as cantidad,
          p.DESC_PRO   as descPro
        FROM DET_REMIS ds
        LEFT JOIN PROV_PRO pp ON pp.ID_FAB = ds.ID_FAB
        LEFT JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
        WHERE ds.COD_REM IN (${cods})
      `);
    }

    const data = remisiones.map((r: any) => ({
      ...r,
      items: itemsDetalle
        .filter((it: any) => it.codRemSalida === r.codRemSalida)
        .map((it: any) => ({
          idFab: it.idFab,
          codFab: it.codFab,
          descPro: it.descPro,
          cantidad: it.cantidad,
        })),
    }));

    return {
      data,
      meta: { page, limit, total: data.length },
    };
  }
}
