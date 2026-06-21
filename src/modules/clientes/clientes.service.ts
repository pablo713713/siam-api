import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { ClienteExtension } from './entities/cliente-extension.entity';
import { UpdateClienteExtensionDto } from './dto/update-cliente-extension.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
    @InjectRepository(ClienteExtension)
    private readonly extensionRepository: Repository<ClienteExtension>,
  ) {}

  async getPerfil(cod_cli: number) {
    const resultado = await this.clienteRepository.manager.query(`
      SELECT
        c.cod_cli            as codCli,
        c.NOM_CLI            as nomCli,
        c.APE_CLI            as apeCli,
        c.RAZON_SOCIAL       as razonSocial,
        c.NUM_CI_NIT         as numCiNit,
        c.CI_NIT             as tipoDocumento,
        c.TEL_DOM            as telDom,
        c.CEL                as cel,
        c.celular            as celular2,
        c.DOMICILIO          as domicilio,
        c.DIRECCION_TIENDA   as direccionTienda,
        c.FONO               as fono,
        c.email              as email,
        c.ciudad             as ciudad,
        c.FECHA_INGRESO      as fechaIngreso,
        c.ANTECEDENTE        as antecedente,
        c.DESCUENTO          as descuento,
        c.CREDITO_MAXIMO     as creditoMaximo,
        c.NOM_COLAB          as nomColab,
        c.AP_COLAB           as apColab,
        c.codigo             as codigoCalificacion,
        c.baja               as baja,
        cc.Tipo_cliente      as tipoCliente,
        cc.consignacion      as condicionCredito,
        cc.Calificacion      as calificacion,
        cc.tiempo            as tiempoCredito,
        CASE WHEN ISNULL(c.CREDITO_MAXIMO, 0) > 0 THEN 1 ELSE 0 END as puedeCredito
      FROM CLIENTE c
      LEFT JOIN CLIENTE_CONSIGNACION cc ON cc.codigo = c.codigo
      WHERE c.cod_cli = @0
    `, [cod_cli]);

    if (!resultado.length) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }

    const cliente = resultado[0];

    const extension = await this.extensionRepository.findOne({
      where: { cod_cli },
    });

    return {
      ...cliente,
      activo: cliente.baja === '0',
      extension: extension ?? {
        acepta_devoluciones: false,
        limite_credito: null,
        nivel_fidelidad: 0,
        observaciones: null,
      },
    };
  }

  async updateExtension(cod_cli: number, dto: UpdateClienteExtensionDto) {
    const cliente = await this.clienteRepository.findOne({
      where: { cod_cli },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }

    let extension = await this.extensionRepository.findOne({
      where: { cod_cli },
    });

    if (extension) {
      Object.assign(extension, dto);
    } else {
      extension = this.extensionRepository.create({ cod_cli, ...dto });
    }

    return this.extensionRepository.save(extension);
  }

  async getHistorialCompras(cod_cli: number) {
    const cliente = await this.clienteRepository.findOne({
      where: { cod_cli },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }

    const manager = this.clienteRepository.manager;

    const ventas = await manager
      .createQueryBuilder()
      .select([
        'v.COD_VENTA AS id',
        "'CONTADO' AS tipo",
        'v.FECHA AS fecha',
        'v.TOTAL AS monto',
        'v.ESTADO AS estado',
      ])
      .from('VENTA', 'v')
      .where('v.COD_CLI = :cod_cli', { cod_cli })
      .getRawMany();

    const creditos = await manager
      .createQueryBuilder()
      .select([
        'c.COD_CRE AS id',
        "'CREDITO' AS tipo",
        'c.FEC_INICIO AS fecha',
        'c.TOTAL AS monto',
        'c.ESTADO AS estado',
      ])
      .from('CREDITO', 'c')
      .where('c.COD_CLI = :cod_cli', { cod_cli })
      .getRawMany();

    const historial = [...ventas, ...creditos].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );

    return {
      cod_cli,
      razon_social: cliente.RAZON_SOCIAL,
      total_compras: historial.length,
      historial,
    };
  }
  async search(q: string, limit = 20) {
    const term = `%${q}%`;

    const clientes = await this.clienteRepository.manager.query(`
      SELECT TOP ${limit}
        c.cod_cli          as codCli,
        c.NOM_CLI          as nomCli,
        c.APE_CLI          as apeCli,
        c.RAZON_SOCIAL     as razonSocial,
        c.NUM_CI_NIT       as numCiNit,
        c.TEL_DOM          as telDom,
        c.CEL              as cel,
        c.DOMICILIO        as domicilio,
        c.CREDITO_MAXIMO   as creditoMaximo,
        c.codigo           as codigoCalificacion,
        cc.Tipo_cliente    as tipoCliente,
        cc.consignacion    as condicionCredito,
        cc.Calificacion    as calificacion,
        cc.tiempo          as tiempoCredito,
        CASE WHEN ISNULL(c.CREDITO_MAXIMO, 0) > 0 THEN 1 ELSE 0 END as puedeCredito
      FROM CLIENTE c
      LEFT JOIN CLIENTE_CONSIGNACION cc ON cc.codigo = c.codigo
      WHERE c.baja = '0'
        AND (
          c.NOM_CLI      LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          c.APE_CLI      LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          c.RAZON_SOCIAL LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          c.NUM_CI_NIT   LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI
        )
      ORDER BY c.NOM_CLI ASC
    `, [term]);

    return { data: clientes, total: clientes.length };
  }
  async getDetalleCompra(cod_cli: number, cod_venta: string) {
    const manager = this.clienteRepository.manager;

    // Intentar primero como venta contado
    const venta = await manager.query(`
      SELECT
        v.COD_VENTA    as codVenta,
        v.FECHA        as fecha,
        v.TOTAL        as total,
        v.ESTADO       as estado,
        v.FACTURA      as factura,
        v.TIPO_VENTA   as tipoVenta,
        v.DESC_PROF    as descuento,
        v.OBS          as obs,
        'CONTADO'      as tipo
      FROM VENTA v
      WHERE v.COD_VENTA = @0 AND v.COD_CLI = @1
    `, [cod_venta, cod_cli]);

    // Si no es venta contado, buscar como crédito
    const credito = !venta.length ? await manager.query(`
      SELECT
        c.COD_CRE      as codVenta,
        c.FEC_INICIO   as fecha,
        c.TOTAL        as total,
        c.ESTADO       as estado,
        c.SALDO        as saldo,
        c.nro_pago     as nroPago,
        c.intervalo    as intervalo,
        c.FEC_FIN      as fechaFin,
        'CREDITO'      as tipo
      FROM CREDITO c
      WHERE c.COD_CRE = @0 AND c.COD_CLI = @1
    `, [cod_venta, cod_cli]) : [];

    const cabecera = venta[0] ?? credito[0];
    if (!cabecera) {
      throw new NotFoundException(`Compra ${cod_venta} no encontrada para el cliente ${cod_cli}`);
    }

    // Items según tipo
    const tabla = cabecera.tipo === 'CONTADO' ? 'DET_VENTA' : 'DET_CREDITO';
    const campoCod = cabecera.tipo === 'CONTADO' ? 'COD_VENTA' : 'COD_CRE';
    const campoPrecio = cabecera.tipo === 'CONTADO' ? 'PRECIO_VENTA' : 'PRECIO_CRE';

    const items = await manager.query(`
      SELECT
        d.ID_FAB           as idFab,
        d.COD_FAB          as codFab,
        d.CANTIDAD         as cantidad,
        d.${campoPrecio}   as precioVenta,
        d.CANTIDAD * d.${campoPrecio} as subtotal,
        p.DESC_PRO         as descPro,
        p.COD_PRO          as codPro,
        ma.NOM_MARCA       as marca
      FROM ${tabla} d
      INNER JOIN PROV_PRO pp ON pp.ID_FAB = d.ID_FAB
      INNER JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
      LEFT JOIN MODELO mo ON mo.COD_MODELO = p.COD_MOD
      LEFT JOIN MARCA ma ON ma.COD_MARCA = mo.COD_MARCA
      WHERE d.${campoCod} = @0
    `, [cod_venta]);

    return { ...cabecera, items };
  }
}