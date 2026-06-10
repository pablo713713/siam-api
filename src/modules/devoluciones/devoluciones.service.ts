import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';

const COD_SUC_MOTORZONE = '00011';

@Injectable()
export class DevolucionesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(dto: CreateDevolucionDto) {
    const { cod_venta, cod_usu, obs, items } = dto;
    const fecha = new Date();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validar que la venta exista y no esté anulada
      const ventaResult = await queryRunner.query(`
        SELECT ESTADO FROM VENTA WHERE COD_VENTA = @0
      `, [cod_venta]);

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

        // 4. Restaurar stock a Motor Zone (00011)
        await queryRunner.query(`
          UPDATE SUC_PRO_PROV
          SET CANTIDAD = CANTIDAD + @0
          WHERE ID_FAB = @1 AND COD_SUC = @2
        `, [item.cantidad, item.id_fab, COD_SUC_MOTORZONE]);
      }

      await queryRunner.commitTransaction();

      return {
        message: 'Devolución parcial registrada correctamente',
        cod_venta,
        itemsProcesados: items.length
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
