import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { ClienteExtension } from './entities/cliente-extension.entity';
import { UpdateClienteExtensionDto } from './dto/update-cliente-extension.dto';
import { calcularCupo } from '../creditos/credito-cupo';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
    @InjectRepository(ClienteExtension)
    private readonly extensionRepository: Repository<ClienteExtension>,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Calificaciones de cliente (CLIENTE_CONSIGNACION) para el alta. */
  async getCalificaciones() {
    return this.clienteRepository.manager.query(`
      SELECT codigo, Tipo_cliente as tipoCliente, consignacion, Calificacion as calificacion, tiempo
      FROM CLIENTE_CONSIGNACION
      ORDER BY codigo
    `);
  }

  /**
   * Alta de cliente. Queda en la sucursal del usuario que lo registra (eso
   * define su empresa). Los campos legacy obligatorios que no se piden toman
   * los mismos valores por defecto que usa la BD ('NINGUNO', '0').
   */
  async create(dto: CreateClienteDto, cod_usu: string, cod_emp: string) {
    const manager = this.clienteRepository.manager;
    const suc: { codSuc: string }[] = await manager.query(`
      SELECT u.COD_SUC as codSuc FROM USUARIO u
      INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
      WHERE u.COD_USU = @0 AND s.COD_EMP = @1
    `, [cod_usu, cod_emp]);
    if (!suc.length) throw new BadRequestException('Su usuario no tiene una sucursal válida para registrar clientes.');

    const doc = (dto.num_ci_nit ?? '').trim();
    if (doc && doc !== '0') {
      const dup = await manager.query(`
        SELECT TOP 1 c.cod_cli as codCli, c.NOM_CLI as nom, c.APE_CLI as ape
        FROM CLIENTE c INNER JOIN SUCURSAL s ON s.COD_SUC = c.COD_SUC
        WHERE LTRIM(RTRIM(c.NUM_CI_NIT)) = @0 AND s.COD_EMP = @1 AND c.baja = '0'
      `, [doc, cod_emp]);
      if (dup.length) {
        throw new ConflictException(`Ya existe un cliente con CI/NIT ${doc}: ${dup[0].nom} ${dup[0].ape} (código ${dup[0].codCli}).`);
      }
    }

    const codigo = dto.codigo?.trim() || '0';
    const calif = await manager.query(`SELECT 1 as ok FROM CLIENTE_CONSIGNACION WHERE codigo = @0`, [codigo]);
    if (!calif.length) throw new BadRequestException(`La calificación ${codigo} no existe.`);

    const n = (v: string | undefined) => (v && v.trim() ? v.trim() : 'NINGUNO');
    const qr = this.clienteRepository.manager.connection.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const ins: { codCli: number }[] = await qr.query(`
        INSERT INTO CLIENTE (
          NOM_CLI, APE_CLI, COD_SUC, FONO, FECHA_INGRESO,
          NUM_CI_NIT, CI_NIT, RAZON_SOCIAL, TEL_DOM, CEL, DOMICILIO,
          NOM_COLAB, AP_COLAB, codigo, celular, email, ciudad, baja
        )
        OUTPUT INSERTED.cod_cli AS codCli
        VALUES (@0, @1, @2, @3, GETDATE(), @4, @5, @6, @7, @8, @9, 'NINGUNO', 'NINGUNO', @10, @11, @12, @13, '0')
      `, [
        dto.nom_cli.toUpperCase(), dto.ape_cli.toUpperCase(), suc[0].codSuc, dto.telefono?.trim() || '0',
        doc || '0', dto.tipo_doc ?? (doc ? 'CI' : 'NIN'),
        (dto.razon_social?.trim() || `${dto.nom_cli} ${dto.ape_cli}`).toUpperCase(),
        n(dto.telefono), n(dto.celular), n(dto.domicilio),
        codigo, dto.celular?.trim() || null, dto.email?.trim() || null, dto.ciudad?.trim() || null,
      ]);
      const cod_cli = Number(ins[0].codCli);

      if (dto.limite_credito !== undefined || dto.acepta_devoluciones !== undefined) {
        await qr.query(`
          INSERT INTO CLIENTE_EXTENSION (cod_cli, acepta_devoluciones, limite_credito, nivel_fidelidad, createdAt, updatedAt)
          VALUES (@0, @1, @2, 0, GETDATE(), GETDATE())
        `, [cod_cli, dto.acepta_devoluciones ?? true, dto.limite_credito ?? null]);
      }

      await this.auditoria.registrar({
        cod_usu, modulo: 'CLIENTE', accion: 'CREAR', documento: String(cod_cli),
        descripcion: `Registró al cliente ${dto.nom_cli} ${dto.ape_cli} (código ${cod_cli})`,
        despues: { cod_cli, ...dto },
      }, qr);

      await qr.commitTransaction();
      return { cod_cli, message: 'Cliente registrado correctamente' };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 404 si el cliente no existe o pertenece a otra empresa (no revela cuál de las dos). */
  private async asegurarClienteDeEmpresa(cod_cli: number, cod_emp: string): Promise<void> {
    const filas: unknown[] = await this.clienteRepository.manager.query(`
      SELECT 1 as ok
      FROM CLIENTE c
      INNER JOIN SUCURSAL s ON s.COD_SUC = c.COD_SUC
      WHERE c.cod_cli = @0 AND s.COD_EMP = @1
    `, [cod_cli, cod_emp]);
    if (filas.length === 0) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }
  }

  async getPerfil(cod_cli: number, cod_emp: string) {
    await this.asegurarClienteDeEmpresa(cod_cli, cod_emp);
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

    // Límite efectivo, deuda y margen disponible
    const credito = await calcularCupo(this.clienteRepository.manager, cod_cli);

    return {
      ...cliente,
      puedeCredito: credito?.habilitado ? 1 : 0,
      credito,
      activo: cliente.baja === '0',
      extension: extension ?? {
        acepta_devoluciones: false,
        limite_credito: null,
        nivel_fidelidad: 0,
        observaciones: null,
      },
    };
  }

  async updateExtension(cod_cli: number, dto: UpdateClienteExtensionDto, cod_emp: string, cod_usu: string) {
    await this.asegurarClienteDeEmpresa(cod_cli, cod_emp);
    const cliente = await this.clienteRepository.findOne({
      where: { cod_cli },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }

    let extension = await this.extensionRepository.findOne({
      where: { cod_cli },
    });

    const campos = ['acepta_devoluciones', 'limite_credito', 'nivel_fidelidad', 'observaciones'] as const;
    const antes = extension
      ? Object.fromEntries(campos.map((c) => [c, extension![c] ?? null]))
      : null;

    if (extension) {
      Object.assign(extension, dto);
    } else {
      extension = this.extensionRepository.create({ cod_cli, ...dto });
    }

    const guardada = await this.extensionRepository.save(extension);
    await this.auditoria.registrarSeguro({
      cod_usu, modulo: 'CLIENTE', accion: 'EDITAR', documento: String(cod_cli),
      descripcion: `Editó la configuración del cliente ${cod_cli}` +
        (dto.limite_credito !== undefined ? ` (límite de crédito: ${dto.limite_credito || 'del sistema anterior'})` : ''),
      antes,
      despues: Object.fromEntries(campos.map((c) => [c, guardada[c] ?? null])),
    });
    return guardada;
  }

  async getHistorialCompras(cod_cli: number, cod_emp: string) {
    await this.asegurarClienteDeEmpresa(cod_cli, cod_emp);
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

  async search(q: string, cod_emp: string, limit = 20) {
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
        ISNULL(NULLIF(ce.limite_credito, 0), ISNULL(c.CREDITO_MAXIMO, 0)) as creditoMaximo,
        c.codigo           as codigoCalificacion,
        cc.Tipo_cliente    as tipoCliente,
        cc.consignacion    as condicionCredito,
        cc.Calificacion    as calificacion,
        cc.tiempo          as tiempoCredito,
        -- límite efectivo: el del perfil y, si no está cargado, CREDITO_MAXIMO
        CASE WHEN ISNULL(NULLIF(ce.limite_credito, 0), ISNULL(c.CREDITO_MAXIMO, 0)) > 0 THEN 1 ELSE 0 END as puedeCredito
      FROM CLIENTE c
      INNER JOIN SUCURSAL s ON s.COD_SUC = c.COD_SUC
      LEFT JOIN CLIENTE_EXTENSION ce ON ce.cod_cli = c.cod_cli
      LEFT JOIN CLIENTE_CONSIGNACION cc ON cc.codigo = c.codigo
      WHERE c.baja = '0'
        AND s.COD_EMP = @1
        AND (
          c.NOM_CLI      LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          c.APE_CLI      LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          c.RAZON_SOCIAL LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          c.NUM_CI_NIT   LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI
        )
      ORDER BY c.NOM_CLI ASC
    `, [term, cod_emp]);

    return { data: clientes, total: clientes.length };
  }

async getOcasional(cod_emp: string) {
  const resultado = await this.clienteRepository.manager.query(`
    SELECT TOP 1
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
    INNER JOIN SUCURSAL s ON s.COD_SUC = c.COD_SUC
    LEFT JOIN CLIENTE_CONSIGNACION cc ON cc.codigo = c.codigo
    WHERE s.COD_EMP = @0
      AND (
        c.cod_cli = 1 OR
        LTRIM(RTRIM(ISNULL(c.NUM_CI_NIT, ''))) = '1191' OR
        UPPER(ISNULL(c.NOM_CLI, '')) LIKE '%OCASIONAL%' OR
        UPPER(ISNULL(c.APE_CLI, '')) LIKE '%OCASIONAL%' OR
        UPPER(ISNULL(c.RAZON_SOCIAL, '')) LIKE '%OCASIONAL%'
      )
    ORDER BY CASE WHEN c.cod_cli = 1 THEN 0 ELSE 1 END, c.cod_cli
  `, [cod_emp]);

  if (!resultado.length) {
    throw new NotFoundException(
      `No se encontró el cliente ocasional para la empresa ${cod_emp}.`,
    );
  }

  return resultado[0];
}
  async getDetalleCompra(cod_cli: number, cod_venta: string, cod_emp: string) {
    await this.asegurarClienteDeEmpresa(cod_cli, cod_emp);
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