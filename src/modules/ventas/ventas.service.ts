import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateVentaDto } from './dto/create-venta.dto';
import { ConfigService } from '@nestjs/config';


const COD_SUC_MOTORZONE = '00011';

@Injectable()
export class VentasService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────
  // Generar COD_VENTA: {COD_USU(7)}{YYYY(4)}{secuencial(3)}
  // ─────────────────────────────────────────
  private async generarCodVenta(cod_usu: string): Promise<string> {
    const year = new Date().getFullYear().toString();
    const prefix = `${cod_usu}${year}`;

    const result = await this.dataSource.query(`
      SELECT TOP 1 COD_VENTA
      FROM VENTA
      WHERE COD_VENTA LIKE @0
      ORDER BY COD_VENTA DESC
    `, [`${prefix}%`]);

    let secuencial = 1;
    if (result.length > 0) {
      const ultimo = result[0].COD_VENTA as string;
      const ultimoSec = parseInt(ultimo.slice(-3), 10);
      secuencial = ultimoSec + 1;
    }

    const sec = secuencial.toString().padStart(3, '0');
    return `${prefix}${sec}`;
  }

  // ─────────────────────────────────────────
  // Registrar venta contado
  // ─────────────────────────────────────────
  async create(dto: CreateVentaDto, cod_usu: string) {
    // 1. Validar stock por distribución
    for (const item of dto.items) {
      const distribucion = item.distribucion && item.distribucion.length > 0
        ? item.distribucion
        : [{ cod_suc: COD_SUC_MOTORZONE, cantidad: item.cantidad }];

      for (const distrib of distribucion) {
        const stock = await this.dataSource.query(`
          SELECT CANTIDAD
          FROM SUC_PRO_PROV
          WHERE ID_FAB = @0 AND COD_SUC = @1
        `, [item.id_fab, distrib.cod_suc]);

        if (stock.length === 0 || Number(stock[0].CANTIDAD) < distrib.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente para ID_FAB ${item.id_fab} en sucursal ${distrib.cod_suc}. ` +
            `Disponible: ${stock[0]?.CANTIDAD ?? 0}, solicitado: ${distrib.cantidad}`
          );
        }
      }
    }

    // 2. Calcular total
    const descuento = dto.descuento ?? 0;
    const totalBruto = dto.items.reduce((sum, i) => sum + i.precio_venta * i.cantidad, 0);
    const totalFinal = totalBruto * (1 - descuento / 100);

    // 3. Generar código
    const cod_venta = await this.generarCodVenta(cod_usu);
    const fecha = new Date();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Insertar cabecera VENTA
      await queryRunner.query(`
        INSERT INTO VENTA (
          COD_VENTA, FECHA, COD_USU, TIPO, TOTAL, OBS,
          COD_CLI, ESTADO, FACTURA, DESC_PROF, COD_INI,
          TIPO_VENTA, TOTAL_INI, saw, fecha_envio, dolarParalelo
        ) VALUES (
          @0, @1, @2, @3, @4, @5,
          @6, @7, @8, @9, @10,
          @11, @12, @13, @14, @15
        )
      `, [
        cod_venta, fecha, cod_usu, 'CONTADO', totalFinal, dto.obs ?? '',
        dto.cod_cli, 'C', dto.factura ? 1 : 0, descuento, cod_usu,
        'CO', totalFinal, 'N', fecha, 0,
      ]);

      // Insertar items y descontar stock por distribución
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];

        await queryRunner.query(`
          INSERT INTO DET_VENTA (
            COD_VENTA, COD_FAB, CANTIDAD, PRECIO_VENTA,
            PREC_LISTA, DOLAR, DESC_UNIT, NRO,
            PLIS_BS, p_fob, existencia, ID_FAB
          ) VALUES (
            @0, @1, @2, @3,
            @4, @5, @6, @7,
            @8, @9, @10, @11
          )
        `, [
          cod_venta, item.cod_fab, item.cantidad, item.precio_venta,
          item.prec_lista, item.precio_venta, 0, i + 1,
          0, 0, item.existencia, item.id_fab,
        ]);

        // Descontar stock por cada almacén de la distribución
        const distribucion = item.distribucion && item.distribucion.length > 0
          ? item.distribucion
          : [{ cod_suc: dto.cod_suc, cantidad: item.cantidad }];

        for (const distrib of distribucion) {
          await queryRunner.query(`
            UPDATE SUC_PRO_PROV
            SET CANTIDAD = CANTIDAD - @0
            WHERE ID_FAB = @1 AND COD_SUC = @2
          `, [distrib.cantidad, item.id_fab, distrib.cod_suc]);
        }
      }

      await queryRunner.commitTransaction();

      return {
        cod_venta,
        total: totalFinal,
        items: dto.items.length,
        message: 'Venta registrada correctamente',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────
  // Listar ventas con filtros
  // ─────────────────────────────────────────
  async findAll(
    fecha?: string,
    fechaFin?: string,
    cod_suc?: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    let filtroFecha = '';
    const params: any[] = [];

    if (fecha && fechaFin) {
      params.push(fecha, fechaFin);
      filtroFecha = `WHERE CAST(v.FECHA AS DATE) >= @0 AND CAST(v.FECHA AS DATE) <= @1`;
    } else if (fecha) {
      params.push(fecha);
      filtroFecha = `WHERE CAST(v.FECHA AS DATE) = @0`;
    } else {
      filtroFecha = `WHERE 1=1`;
    }

    params.push(skip, limit);
    const skipIdx = params.length - 2;
    const limitIdx = params.length - 1;

    const ventas = await this.dataSource.query(`
      SELECT
        v.COD_VENTA  as codVenta,
        v.FECHA      as fecha,
        v.TOTAL      as total,
        v.ESTADO     as estado,
        v.FACTURA    as factura,
        v.TIPO_VENTA as tipoVenta,
        v.DESC_PROF  as descuento,
        v.COD_USU    as codUsu,
        c.NOM_CLI    as nomCliente,
        c.APE_CLI    as apeCliente,
        c.RAZON_SOCIAL as razonSocial
      FROM VENTA v
      LEFT JOIN CLIENTE c ON c.cod_cli = v.COD_CLI
      ${filtroFecha}
      ORDER BY v.FECHA DESC
      OFFSET @${skipIdx} ROWS FETCH NEXT @${limitIdx} ROWS ONLY
    `, params);

    const countParams = params.slice(0, -2);
    const countResult = await this.dataSource.query(`
      SELECT COUNT(*) as total
      FROM VENTA v
      ${filtroFecha}
    `, countParams);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: ventas,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─────────────────────────────────────────
  // Detalle de una venta
  // ─────────────────────────────────────────
  async findOne(cod_venta: string) {
    const venta = await this.dataSource.query(`
      SELECT
        v.COD_VENTA  as codVenta,
        v.FECHA      as fecha,
        v.TOTAL      as total,
        v.ESTADO     as estado,
        v.FACTURA    as factura,
        v.TIPO_VENTA as tipoVenta,
        v.DESC_PROF  as descuento,
        v.OBS        as obs,
        v.COD_USU    as codUsu,
        c.cod_cli    as codCli,
        c.NOM_CLI    as nomCliente,
        c.APE_CLI    as apeCliente,
        c.RAZON_SOCIAL as razonSocial,
        c.NUM_CI_NIT as numCiNit
      FROM VENTA v
      LEFT JOIN CLIENTE c ON c.cod_cli = v.COD_CLI
      WHERE v.COD_VENTA = @0
    `, [cod_venta]);

    if (venta.length === 0) {
      throw new NotFoundException(`Venta ${cod_venta} no encontrada`);
    }

    const items = await this.dataSource.query(`
      SELECT
        dv.ID_FAB      as idFab,
        dv.COD_FAB     as codFab,
        dv.CANTIDAD    as cantidad,
        dv.PRECIO_VENTA as precioVenta,
        dv.PREC_LISTA  as precLista,
        dv.DESC_UNIT   as descuento,
        p.DESC_PRO     as descPro,
        p.COD_PRO      as codPro
      FROM DET_VENTA dv
      INNER JOIN PROV_PRO pp ON pp.ID_FAB = dv.ID_FAB
      INNER JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
      WHERE dv.COD_VENTA = @0
    `, [cod_venta]);

    return { ...venta[0], items };
  }

  // ─────────────────────────────────────────
  // Anular venta
  // ─────────────────────────────────────────
  async anular(cod_venta: string, cod_usu: string) {
    const venta = await this.findOne(cod_venta);

    if (venta.estado === 'A') {
      throw new BadRequestException('La venta ya está anulada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Cambiar estado a anulado
      await queryRunner.query(`
        UPDATE VENTA SET ESTADO = 'A' WHERE COD_VENTA = @0
      `, [cod_venta]);

      // Revertir stock
      for (const item of venta.items) {
        await queryRunner.query(`
          UPDATE SUC_PRO_PROV
          SET CANTIDAD = CANTIDAD + @0
          WHERE ID_FAB = @1 AND COD_SUC = (
            SELECT COD_INI FROM VENTA WHERE COD_VENTA = @2
          )
        `, [item.cantidad, item.idFab, cod_venta]);
      }

      await queryRunner.commitTransaction();
      return { message: `Venta ${cod_venta} anulada correctamente` };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
  async getTipoCambioVigente() {
    const result = await this.dataSource.query(`
        SELECT TOP 1
        FECHA as fecha,
        TIPO_CAMBIO as tipoCambio,
        cOD_USU as codUsu
        FROM CAMBIO_DOLAR
        ORDER BY FECHA DESC
    `);

    if (result.length === 0) {
        throw new NotFoundException('No hay tipo de cambio registrado');
    }

    return result[0];
    }

    async registrarTipoCambio(tipoCambio: number, cod_usu: string) {
    const fecha = new Date();

    const existe = await this.dataSource.query(`
        SELECT TOP 1 FECHA FROM CAMBIO_DOLAR
        WHERE CAST(FECHA AS DATE) = CAST(@0 AS DATE)
    `, [fecha]);

    if (existe.length > 0) {
        throw new BadRequestException('Ya existe un tipo de cambio registrado para hoy');
    }

    await this.dataSource.query(`
        INSERT INTO CAMBIO_DOLAR (FECHA, TIPO_CAMBIO, cOD_USU)
        VALUES (@0, @1, @2)
    `, [fecha, tipoCambio, cod_usu]);

    return {
        fecha,
        tipoCambio,
        message: 'Tipo de cambio registrado correctamente',
    };
    }
    async getDolarParaleloVigente(cod_emp: string) {
    const result = await this.dataSource.query(`
      SELECT TOP 1
        FECHA        as fecha,
        TIPO_CAMBIO  as tipoCambio,
        COD_EMP      as codEmp,
        COD_USU      as codUsu
      FROM CAMBIO_DOLAR_PARALELO
      WHERE COD_EMP = @0
      ORDER BY FECHA DESC
    `, [cod_emp]);

    if (result.length === 0) {
      throw new NotFoundException('No hay tipo de cambio paralelo registrado');
    }

    return result[0];
  }

  async registrarDolarParalelo(tipoCambio: number, cod_usu: string, cod_emp: string) {
    const hoy = new Date();
    const fechaDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    const existe = await this.dataSource.query(`
      SELECT TOP 1 FECHA FROM CAMBIO_DOLAR_PARALELO
      WHERE CAST(FECHA AS DATE) = CAST(@0 AS DATE)
      AND COD_EMP = @1
    `, [fechaDia, cod_emp]);

    if (existe.length > 0) {
      await this.dataSource.query(`
        UPDATE CAMBIO_DOLAR_PARALELO
        SET TIPO_CAMBIO = @0, FECHA_INGRESO = @1, COD_USU = @2
        WHERE CAST(FECHA AS DATE) = CAST(@3 AS DATE)
        AND COD_EMP = @4
      `, [tipoCambio, hoy, cod_usu, fechaDia, cod_emp]);

      return {
        fecha: fechaDia,
        tipoCambio,
        message: 'Tipo de cambio paralelo actualizado correctamente',
      };
    }

    await this.dataSource.query(`
      INSERT INTO CAMBIO_DOLAR_PARALELO (FECHA, FECHA_INGRESO, TIPO_CAMBIO, COD_EMP, COD_USU)
      VALUES (@0, @1, @2, @3, @4)
    `, [fechaDia, hoy, tipoCambio, cod_emp, cod_usu]);

    return {
      fecha: fechaDia,
      tipoCambio,
      message: 'Tipo de cambio paralelo registrado correctamente',
    };
  }
}