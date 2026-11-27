import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { VentasService } from '../ventas/ventas.service';
import {
  asegurarTablaRegistro, FilaRegistroDevolucion, guardarRegistroDevolucion,
} from './registro-devolucion';

const COD_SUC_MOTORZONE = '00011';

@Injectable()
export class DevolucionesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usuariosService: UsuariosService,
    private readonly ventasService: VentasService,
  ) {}

  /** El almacén de reingreso debe existir y ser de la empresa. */
  private async validarAlmacen(cod_suc: string, cod_emp: string): Promise<void> {
    const r = await this.dataSource.query(
      `SELECT 1 as ok FROM SUCURSAL WHERE COD_SUC = @0 AND COD_EMP = @1`, [cod_suc, cod_emp],
    );
    if (!r.length) throw new BadRequestException(`El almacén ${cod_suc} no es válido.`);
  }

  async create(dto: CreateDevolucionDto, cod_emp: string) {
    const { cod_venta, cod_usu, obs, items } = dto;
    const fecha = new Date();
    const sucDestino = dto.cod_suc || COD_SUC_MOTORZONE;
    await this.validarAlmacen(sucDestino, cod_emp);

    // Firma digital: el vendedor elige su usuario y pone su contraseña
    const firmante = await this.usuariosService.verificarFirma(
      dto.cod_usu_vendedor, dto.password_vendedor, cod_emp, this.usuariosService.rolVendedor,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await asegurarTablaRegistro(queryRunner);
      const registro: FilaRegistroDevolucion[] = [];

      // 1. Validar que la venta exista, sea de la empresa correcta, y no esté anulada
      const ventaResult = await queryRunner.query(`
        SELECT v.ESTADO, v.FECHA, v.COD_CLI
        FROM VENTA v
        INNER JOIN USUARIO u ON u.COD_USU = v.COD_USU
        INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
        WHERE v.COD_VENTA = @0 AND s.COD_EMP = @1
      `, [cod_venta, cod_emp]);

      if (ventaResult.length === 0) {
        throw new NotFoundException(`Venta ${cod_venta} no encontrada`);
      }
      if (ventaResult[0].ESTADO === 'A') {
        throw new BadRequestException(`La venta ${cod_venta} ya está anulada`);
      }

      // 2. Insert or ignore in DEVOLUCION (prevent PK violation)
      const devExist = await queryRunner.query(`
        SELECT COD_VENTA FROM DEVOLUCION WHERE COD_VENTA = @0
      `, [cod_venta]);

      if (devExist.length === 0) {
        await queryRunner.query(`
          INSERT INTO DEVOLUCION (COD_VENTA, FECHA, COD_USU, OBS)
          VALUES (@0, @1, @2, @3)
        `, [cod_venta, fecha, cod_usu, obs || '']);
      }

      let granTotalDevuelto = 0;

      // 3. Procesar items
      for (const item of items) {
        // Validar item en la venta original y calcular total
        const detVenta = await queryRunner.query(`
          SELECT CANTIDAD, PRECIO_VENTA FROM DET_VENTA
          WHERE COD_VENTA = @0 AND ID_FAB = @1
        `, [cod_venta, item.id_fab]);

        if (detVenta.length === 0) {
          throw new BadRequestException(`El ítem con ID_FAB ${item.id_fab} no pertenece a la venta ${cod_venta}`);
        }

        const precioVenta = Number(detVenta[0].PRECIO_VENTA);
        const cantidadVendida = Number(detVenta[0].CANTIDAD);
        const totalDevuelto = item.cantidad * precioVenta;
        granTotalDevuelto += totalDevuelto;

        // Verificar si ya existe en DET_DEVOLUCION
        const detDevExist = await queryRunner.query(`
          SELECT CANTIDAD, TOTAL FROM DET_DEVOLUCION
          WHERE COD_VENTA = @0 AND ID_FAB = @1
        `, [cod_venta, item.id_fab]);

        const cantidadYaDevuelta = detDevExist.length > 0 ? Number(detDevExist[0].CANTIDAD) : 0;

        if (cantidadYaDevuelta + item.cantidad > cantidadVendida) {
          throw new BadRequestException(
            `No puedes devolver más de lo vendido para el ID_FAB ${item.id_fab}. Vendido: ${cantidadVendida}, Ya devuelto: ${cantidadYaDevuelta}, Intentas devolver: ${item.cantidad}`
          );
        }

        if (detDevExist.length === 0) {
          // INSERT
          await queryRunner.query(`
            INSERT INTO DET_DEVOLUCION (COD_VENTA, COD_FAB, CANTIDAD, TOTAL, ID_FAB)
            VALUES (@0, @1, @2, @3, @4)
          `, [cod_venta, item.cod_fab, item.cantidad, totalDevuelto, item.id_fab]);
        } else {
          // UPDATE
          await queryRunner.query(`
            UPDATE DET_DEVOLUCION
            SET CANTIDAD = CANTIDAD + @0, TOTAL = TOTAL + @1
            WHERE COD_VENTA = @2 AND ID_FAB = @3
          `, [item.cantidad, totalDevuelto, cod_venta, item.id_fab]);
        }

        registro.push({
          movimiento: 'DEVUELVE', id_fab: item.id_fab, cod_fab: item.cod_fab,
          cantidad: item.cantidad, precio: precioVenta, cod_suc: sucDestino,
        });

        // 4. Restaurar stock al almacén indicado (por defecto Motor Zone 00011)
        const existeStock = await queryRunner.query(`
          SELECT CANTIDAD FROM SUC_PRO_PROV WHERE ID_FAB = @0 AND COD_SUC = @1
        `, [item.id_fab, sucDestino]);

        if (existeStock.length > 0) {
          await queryRunner.query(`
            UPDATE SUC_PRO_PROV
            SET CANTIDAD = CANTIDAD + @0
            WHERE ID_FAB = @1 AND COD_SUC = @2
          `, [item.cantidad, item.id_fab, sucDestino]);
        } else {
          await queryRunner.query(`
            INSERT INTO SUC_PRO_PROV (COD_SUC, COD_FAB, CANTIDAD, STOCK_MIN, cantidad_virtual, ID_FAB)
            VALUES (@0, @1, @2, 0, 0, @3)
          `, [sucDestino, item.cod_fab, item.cantidad, item.id_fab]);
        }
      }

      // 5. Ajuste financiero en CIERRE_CAJA (HU-D.02)
      if (granTotalDevuelto > 0) {
        const fechaVentaOriginal = ventaResult[0].FECHA;
        const cierres = await queryRunner.query(`
          SELECT cod_cc FROM CIERRE_CAJA
          WHERE CAST(FECHA_INI AS DATE) = CAST(@0 AS DATE)
            AND COD_SUC = @1
        `, [fechaVentaOriginal, COD_SUC_MOTORZONE]);

        if (cierres.length > 0) {
          const cod_cc = cierres[0].cod_cc;
          await queryRunner.query(`
            UPDATE CIERRE_CAJA
            SET VENTA = ISNULL(VENTA, 0) - @0,
                DEVOLUCION = ISNULL(DEVOLUCION, 0) + @0
            WHERE cod_cc = @1
          `, [granTotalDevuelto, cod_cc]);
        }
      }

      // 6. Cambio de producto: lo que el cliente se lleva es una venta nueva (mismo
      //    cliente, a nombre del vendedor que firma), con el mismo ciclo de una
      //    venta: valida y descuenta stock de MOTOR ZONE y suma a las ganancias.
      const lleva = dto.lleva ?? [];
      let codVentaCambio: string | null = null;
      let totalLleva = 0;
      if (lleva.length > 0) {
        const nueva = await this.ventasService.registrarVentaEnTransaccion(queryRunner, {
          cod_usu: firmante.cod_usu,
          cod_cli: Number(ventaResult[0].COD_CLI),
          items: lleva.map((l) => ({
            id_fab: l.id_fab, cod_fab: l.cod_fab, cantidad: l.cantidad,
            precio_venta: l.precio, prec_lista: l.prec_lista || l.precio,
          })),
          obs: `Cambio de producto de la venta ${cod_venta}`,
        });
        codVentaCambio = nueva.cod_venta;
        totalLleva = nueva.total;
        for (const l of lleva) {
          registro.push({
            movimiento: 'LLEVA', id_fab: l.id_fab, cod_fab: l.cod_fab,
            cantidad: l.cantidad, precio: l.precio, cod_suc: COD_SUC_MOTORZONE,
          });
        }
      }

      const firma = await guardarRegistroDevolucion(queryRunner, {
        tipoDoc: 'VENTA', codDoc: cod_venta, codEmp: cod_emp,
        codUsuRegistra: cod_usu, codUsuFirmante: firmante.cod_usu, obs,
        codVentaCambio,
      }, registro);

      await queryRunner.commitTransaction();

      return {
        message: codVentaCambio ? 'Cambio de producto registrado correctamente' : 'Devolución registrada correctamente',
        cod_venta,
        itemsProcesados: items.length,
        totalDevuelto: granTotalDevuelto,
        // Cambio: venta generada y diferencia (> 0 paga el cliente, < 0 se le devuelve)
        codVentaCambio,
        totalLleva,
        diferencia: Math.round((totalLleva - granTotalDevuelto) * 100) / 100,
        firma: {
          idGrupo: firma.idGrupo,
          firmante: { codUsu: firmante.cod_usu, alias: firmante.alias, nombre: firmante.nombreCompleto },
          fechaBolivia: firma.fecha,
          horaBolivia: firma.hora,
        },
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
