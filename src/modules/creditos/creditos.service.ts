import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { CreateDevolucionCreditoDto } from './dto/create-devolucion-credito.dto';

const COD_SUC_MOTORZONE = '00011';
const PLAZO_DEFAULT_SEMANAS = 4;

@Injectable()
export class CreditosService {
  constructor(private readonly dataSource: DataSource) {}

  // ─────────────────────────────────────────
  // Generar COD_CRE: {COD_USU(7)}{YY(2)}{secuencial(4)} = 13 chars
  // TODO: confirmar formato real con: SELECT TOP 10 COD_CRE FROM CREDITO ORDER BY FEC_INICIO DESC
  // ─────────────────────────────────────────
  private async generarCodCre(cod_usu: string): Promise<string> {
    const yy = new Date().getFullYear().toString().slice(-2);
    const prefix = `${cod_usu}${yy}`;

    const result = await this.dataSource.query(`
      SELECT TOP 1 COD_CRE
      FROM CREDITO
      WHERE COD_CRE LIKE @0
      ORDER BY COD_CRE DESC
    `, [`${prefix}%`]);

    let secuencial = 1;
    if (result.length > 0) {
      const ultimo = result[0].COD_CRE as string;
      const ultimoSec = parseInt(ultimo.slice(-4), 10);
      secuencial = ultimoSec + 1;
    }

    const sec = secuencial.toString().padStart(4, '0');
    return `${prefix}${sec}`;
  }

  private async generarNPago(cod_cre: string): Promise<string> {
    const result = await this.dataSource.query(`
        SELECT TOP 1 N_PAGO
        FROM PAGO_CREDITO
        WHERE COD_CRE = @0
        ORDER BY N_PAGO DESC
    `, [cod_cre]);

    let secuencial = 0;
    if (result.length > 0) {
        const ultimo = result[0].N_PAGO as string;
        const ultimoSec = parseInt(ultimo.slice(-2), 10);
        secuencial = ultimoSec + 1;
    }

    const sec = secuencial.toString().padStart(2, '0');
    return `${cod_cre}${sec}`;
    }

  // ─────────────────────────────────────────
  // Cupo disponible de un cliente:
  // CREDITO_MAXIMO - suma de SALDO de sus créditos activos
  // ─────────────────────────────────────────
  private async getCupoDisponible(cod_cli: number): Promise<{ maximo: number; usado: number; disponible: number }> {
    const cliente = await this.dataSource.query(`
      SELECT CREDITO_MAXIMO FROM CLIENTE WHERE cod_cli = @0
    `, [cod_cli]);

    if (cliente.length === 0) {
      throw new NotFoundException(`Cliente ${cod_cli} no existe`);
    }

    const maximo = Number(cliente[0].CREDITO_MAXIMO ?? 0);

    const usado = await this.dataSource.query(`
      SELECT ISNULL(SUM(SALDO), 0) as usado
      FROM CREDITO
      WHERE COD_CLI = @0 AND ESTADO = 'A'
    `, [cod_cli]);

    const usadoNum = Number(usado[0].usado);

    return { maximo, usado: usadoNum, disponible: maximo - usadoNum };
  }

  // ─────────────────────────────────────────
  // Crear crédito
  // ─────────────────────────────────────────
  async create(dto: CreateCreditoDto, cod_usu: string, cod_emp: string) {
    if (!dto.cod_cli) {
      throw new BadRequestException('Debe seleccionar un cliente');
    }

    // 0. Validar que el cliente pertenezca a la empresa del usuario logueado
    const clienteEmp = await this.dataSource.query(`
      SELECT s.COD_EMP
      FROM CLIENTE cl
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE cl.cod_cli = @0
    `, [dto.cod_cli]);

    if (clienteEmp.length === 0 || clienteEmp[0].COD_EMP !== cod_emp) {
      throw new BadRequestException('Este cliente no pertenece a su empresa');
    }

    // 1. Validar que el cliente pueda comprar a crédito
    const cupo = await this.getCupoDisponible(dto.cod_cli);
    if (cupo.maximo <= 0) {
      throw new BadRequestException('Este cliente no tiene habilitada la compra a crédito');
    }

    // 2. Validar stock exclusivamente en MOTOR ZONE (00011), igual que la venta al contado.
    //    Los productos de otros almacenes deben traspasarse antes a MOTOR ZONE.
    for (const item of dto.items) {
      const stock = await this.dataSource.query(`
        SELECT CANTIDAD
        FROM SUC_PRO_PROV
        WHERE ID_FAB = @0 AND COD_SUC = @1
      `, [item.id_fab, COD_SUC_MOTORZONE]);

      const disponible = stock.length > 0 ? Number(stock[0].CANTIDAD) : 0;
      if (disponible < item.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente en MOTOR ZONE para ID_FAB ${item.id_fab}. ` +
          `Disponible: ${disponible}, solicitado: ${item.cantidad}. Debe realizar un traspaso previo desde otro almacén.`
        );
      }
    }

    // 3. Calcular total
    const descuento = dto.descuento ?? 0;
    const totalBruto = dto.items.reduce((sum, i) => sum + i.precio_cre * i.cantidad, 0);
    const totalFinal = totalBruto * (1 - descuento / 100);

    // 4. Validar que el crédito nuevo no exceda el cupo disponible del cliente
    if (totalFinal > cupo.disponible) {
      throw new BadRequestException(
        `El cliente excede su límite de crédito. ` +
        `Cupo disponible: ${cupo.disponible.toFixed(2)}, monto solicitado: ${totalFinal.toFixed(2)}`
      );
    }

    // 5. Calcular fecha de vencimiento (plazo default 4 semanas, editable)
    const semanasPlazo = dto.semanasPlazo ?? PLAZO_DEFAULT_SEMANAS;
    const fecInicio = new Date();
    const fecFin = new Date(fecInicio);
    fecFin.setDate(fecFin.getDate() + semanasPlazo * 7);

    const cod_cre = await this.generarCodCre(cod_usu);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Insertar cabecera CREDITO — directo en estado 'A' (activo), sin pasos intermedios
      await queryRunner.query(`
        INSERT INTO CREDITO (
          COD_CRE, COD_SUC, COD_CLI, COD_USU, FEC_INICIO, FEC_FIN,
          TOTAL, SALDO, ESTADO, DOLAR, SALDO_FAVOR, OBS,
          DevCedito, fecha_dev, cod_usu_desc, descuento, obs_desc,
          Tipo_venta, intervalo, nro_pago, fecha_desc, fecha_val,
          usuario_val, cod_nota, dolarParalelo
        ) VALUES (
          @0, @1, @2, @3, @4, @5,
          @6, @7, 'A', @8, 0, @9,
          0, @4, @3, @10, '',
          'CREDITO', @11, 0, @4, @4,
          @3, '1', 0
        )
      `, [
        cod_cre, COD_SUC_MOTORZONE, dto.cod_cli, cod_usu, fecInicio, fecFin,
        totalFinal, totalFinal, dto.dolar ?? 0, dto.obs ?? '',
        descuento, semanasPlazo,
      ]);

      // Insertar items y descontar stock
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];

        await queryRunner.query(`
          INSERT INTO DET_CREDITO (
            COD_CRE, COD_FAB, CANTIDAD, PRECIO_CRE, DESCUENTO,
            nro_registro, ID_FAB
          ) VALUES (
            @0, @1, @2, @3, @4,
            @5, @6
          )
        `, [
          cod_cre, item.cod_fab, item.cantidad, item.precio_cre, 0,
          i + 1, item.id_fab,
        ]);

        // Descontar stock exclusivamente de MOTOR ZONE (00011)
        await queryRunner.query(`
          UPDATE SUC_PRO_PROV
          SET CANTIDAD = CANTIDAD - @0
          WHERE ID_FAB = @1 AND COD_SUC = @2
        `, [item.cantidad, item.id_fab, COD_SUC_MOTORZONE]);
      }

      await queryRunner.commitTransaction();

      return {
        cod_cre,
        total: totalFinal,
        fecFin,
        items: dto.items.length,
        message: 'Crédito registrado correctamente',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────
  // Apartado 1: créditos activos (ESTADO = 'A'), con semáforo de vencimiento
  // ─────────────────────────────────────────
  async findActivos(cod_emp: string) {
    const creditos = await this.dataSource.query(`
      SELECT
        c.COD_CRE      as codCre,
        c.COD_CLI      as codCli,
        cl.NOM_CLI     as nomCliente,
        cl.APE_CLI     as apeCliente,
        cl.RAZON_SOCIAL as razonSocial,
        c.FEC_INICIO   as fecInicio,
        c.FEC_FIN      as fecFin,
        c.TOTAL        as total,
        c.SALDO        as saldo,
        DATEDIFF(DAY, GETDATE(), c.FEC_FIN) as diasRestantes
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE c.ESTADO = 'A'
        AND s.COD_EMP = @0
      ORDER BY c.FEC_FIN ASC
    `, [cod_emp]);

    return creditos.map((c: any) => ({
      ...c,
      alerta: this.calcularAlerta(c.diasRestantes),
    }));
  }
  async findAbiertos(cod_emp: string) {
    const creditos = await this.dataSource.query(`
      SELECT
        c.COD_CRE      as codCre,
        cl.cod_cli     as codCli,
        cl.NOM_CLI     as nomCliente,
        cl.APE_CLI     as apeCliente,
        cl.RAZON_SOCIAL as razonSocial,
        c.FEC_INICIO   as fecApertura,
        c.FEC_FIN      as fecPlazo,
        DATEDIFF(DAY, c.FEC_INICIO, GETDATE()) as diasEnCredito,
        c.TOTAL        as totalCredito,
        ISNULL(dev.TOTAL_DEV, 0) as devolucion,
        c.SALDO        as saldoXCobrar,
        c.ESTADO       as estado,
        c.COD_USU      as usuario,
        c.OBS          as observacion,
        DATEDIFF(DAY, GETDATE(), c.FEC_FIN) as diasRestantes
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      LEFT JOIN (
        SELECT COD_CRE, SUM(TOTAL) as TOTAL_DEV
        FROM DET_DEVOLUCION_CREDITO
        GROUP BY COD_CRE
      ) dev ON dev.COD_CRE = c.COD_CRE
      WHERE c.SALDO > 0
        AND s.COD_EMP = @0
      ORDER BY c.FEC_FIN ASC
    `, [cod_emp]);

    return creditos.map((c: any) => ({
      ...c,
      alerta: this.calcularAlerta(c.diasRestantes),
    }));
  }

  private calcularAlerta(diasRestantes: number): 'ok' | 'proximo' | 'vencido' {
    if (diasRestantes < 0) return 'vencido';
    if (diasRestantes < 14) return 'proximo';
    return 'ok';
  }

  // ─────────────────────────────────────────
  // Apartado 2, panel izquierdo: clientes habilitados para crédito
  // ─────────────────────────────────────────
  async findClientesHabilitados(cod_emp: string) {
    const clientes = await this.dataSource.query(`
      SELECT
        cl.cod_cli      as codCli,
        cl.NOM_CLI      as nomCliente,
        cl.APE_CLI      as apeCliente,
        cl.RAZON_SOCIAL as razonSocial,
        cl.CREDITO_MAXIMO as creditoMaximo,
        ISNULL(uso.usado, 0) as usado
      FROM CLIENTE cl
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      LEFT JOIN (
        SELECT COD_CLI, SUM(SALDO) as usado
        FROM CREDITO
        WHERE ESTADO = 'A'
        GROUP BY COD_CLI
      ) uso ON uso.COD_CLI = cl.cod_cli
      WHERE cl.CREDITO_MAXIMO > 0
        AND s.COD_EMP = @0
      ORDER BY cl.NOM_CLI ASC
    `, [cod_emp]);

    return clientes.map((c: any) => ({
      ...c,
      disponible: Number(c.creditoMaximo) - Number(c.usado),
    }));
  }

  // ─────────────────────────────────────────
  // Apartado 2, panel derecho: créditos activos de un cliente
  // ─────────────────────────────────────────
  async findCreditosPorCliente(cod_cli: number, cod_emp: string) {
    const creditos = await this.dataSource.query(`
      SELECT
        c.COD_CRE    as codCre,
        c.FEC_INICIO as fecInicio,
        c.FEC_FIN    as fecFin,
        c.TOTAL      as total,
        c.SALDO      as saldo,
        DATEDIFF(DAY, GETDATE(), c.FEC_FIN) as diasRestantes
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE c.COD_CLI = @0 AND c.ESTADO = 'A'
        AND s.COD_EMP = @1
      ORDER BY c.FEC_FIN ASC
    `, [cod_cli, cod_emp]);

    const items = creditos.map((c: any) => ({
      ...c,
      alerta: this.calcularAlerta(c.diasRestantes),
    }));

    const totalSeleccionable = items.reduce((sum: number, c: any) => sum + Number(c.saldo), 0);

    return { creditos: items, totalSaldos: totalSeleccionable };
  }

  async registrarDevolucion(cod_cre: string, dto: CreateDevolucionCreditoDto, cod_usu: string, cod_emp: string) {
    const credito = await this.dataSource.query(`
      SELECT c.SALDO, c.ESTADO, s.COD_EMP
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE c.COD_CRE = @0
    `, [cod_cre]);

    if (credito.length === 0) {
      throw new NotFoundException(`Crédito ${cod_cre} no encontrado`);
    }
    if (credito[0].COD_EMP !== cod_emp) {
      throw new BadRequestException('Este crédito no pertenece a su empresa');
    }
    if (credito[0].ESTADO !== 'A') {
      throw new BadRequestException('Solo se pueden devolver ítems de créditos activos');
    }

    // Validar cantidad disponible a devolver por cada ítem
    for (const item of dto.items) {
      const original = await this.dataSource.query(`
        SELECT dc.CANTIDAD,
          ISNULL((SELECT SUM(ddc.CANTIDAD) FROM DET_DEVOLUCION_CREDITO ddc
                  WHERE ddc.COD_CRE = @0 AND ddc.ID_FAB = @1), 0) as yaDevuelto
        FROM DET_CREDITO dc
        WHERE dc.COD_CRE = @0 AND dc.ID_FAB = @1
      `, [cod_cre, item.id_fab]);

      if (original.length === 0) {
        throw new BadRequestException(`El ítem ID_FAB ${item.id_fab} no pertenece a este crédito`);
      }

      const disponibleADevolver = Number(original[0].CANTIDAD) - Number(original[0].yaDevuelto);
      if (item.cantidad > disponibleADevolver) {
        throw new BadRequestException(
          `No se puede devolver ${item.cantidad} de ID_FAB ${item.id_fab}. ` +
          `Disponible para devolver: ${disponibleADevolver}`
        );
      }
    }

    const totalDevolucion = dto.items.reduce((sum, i) => sum + i.total, 0);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Cabecera — COD_DEVC es IDENTITY, lo recuperamos con OUTPUT INSERTED
      const insertHeader = await queryRunner.query(`
        INSERT INTO DEVOLUCION_CREDITO (COD_CRE, COD_USU, FECHA, TOTAL, OBS, Tipo)
        OUTPUT INSERTED.COD_DEVC
        VALUES (@0, @1, @2, @3, @4, @5)
      `, [cod_cre, cod_usu, new Date(), totalDevolucion, dto.obs ?? '', dto.esTotal ?? 0]);

      const cod_devc = insertHeader[0].COD_DEVC;

      for (const item of dto.items) {
        await queryRunner.query(`
          INSERT INTO DET_DEVOLUCION_CREDITO (COD_CRE, COD_FAB, CANTIDAD, TOTAL, COD_DEVC, ID_FAB)
          VALUES (@0, @1, @2, @3, @4, @5)
        `, [cod_cre, item.cod_fab, item.cantidad, item.total, cod_devc, item.id_fab]);

        // Reponer stock en la sucursal indicada (mismo patrón que devoluciones de venta)
        await queryRunner.query(`
          UPDATE SUC_PRO_PROV
          SET CANTIDAD = CANTIDAD + @0
          WHERE ID_FAB = @1 AND COD_SUC = @2
        `, [item.cantidad, item.id_fab, dto.cod_suc]);
      }

      // Ajustar saldo del crédito, sin bajar de 0
      const nuevoSaldo = Math.max(0, Number(credito[0].SALDO) - totalDevolucion);
      const nuevoEstado = nuevoSaldo <= 0 ? 'C' : 'A';

      await queryRunner.query(`
        UPDATE CREDITO SET SALDO = @0, ESTADO = @1 WHERE COD_CRE = @2
      `, [nuevoSaldo, nuevoEstado, cod_cre]);

      await queryRunner.commitTransaction();

      return {
        cod_devc,
        cod_cre,
        totalDevuelto: totalDevolucion,
        nuevoSaldo,
        estado: nuevoEstado,
        message: 'Devolución de crédito registrada correctamente',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
  async registrarPago(cod_cre: string, dto: RegistrarPagoDto, cod_usu: string, cod_emp: string) {
    const credito = await this.dataSource.query(`
      SELECT c.SALDO, c.ESTADO, s.COD_EMP
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE c.COD_CRE = @0
    `, [cod_cre]);

    if (credito.length === 0) {
      throw new NotFoundException(`Crédito ${cod_cre} no encontrado`);
    }
    if (credito[0].COD_EMP !== cod_emp) {
      throw new BadRequestException('Este crédito no pertenece a su empresa');
    }

  // ... resto del método sin cambios (usa credito[0].SALDO / ESTADO igual que antes)

    const saldoActual = Number(credito[0].SALDO);

    if (dto.monto <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a 0');
    }

    if (dto.monto > saldoActual) {
      throw new BadRequestException(
        `El monto excede el saldo pendiente. Saldo actual: ${saldoActual.toFixed(2)}`
      );
    }

    const nuevoSaldo = saldoActual - dto.monto;
    const nuevoEstado = nuevoSaldo <= 0 ? 'C' : 'A';
    const n_pago = await this.generarNPago(cod_cre); // TODO: confirmar formato real de N_PAGO con datos legacy

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`
        INSERT INTO PAGO_CREDITO (
          COD_CRE, N_PAGO, TOTAL, SALDO, FECHA, COD_USU, OBS, estado, fecha_pago, tipo_pago
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, 'A', @4, @7
        )
      `, [cod_cre, n_pago, dto.monto, nuevoSaldo, new Date(), cod_usu, dto.obs ?? '', dto.tipoPago ?? 'EFECTIVO']);

      await queryRunner.query(`
        UPDATE CREDITO SET SALDO = @0, ESTADO = @1 WHERE COD_CRE = @2
      `, [nuevoSaldo, nuevoEstado, cod_cre]);

      await queryRunner.commitTransaction();

      return {
        cod_cre,
        montoAbonado: dto.monto,
        nuevoSaldo,
        estado: nuevoEstado,
        message: nuevoEstado === 'C' ? 'Crédito saldado completamente' : 'Pago registrado correctamente',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
  // ─────────────────────────────────────────
// Detalle de un crédito (cabecera + items, con disponible a devolver)
// ─────────────────────────────────────────
   async findOne(cod_cre: string, cod_emp: string) {
    const credito = await this.dataSource.query(`
      SELECT
        c.COD_CRE      as codCre,
        c.COD_CLI      as codCli,
        cl.NOM_CLI     as nomCliente,
        cl.APE_CLI     as apeCliente,
        cl.RAZON_SOCIAL as razonSocial,
        cl.NUM_CI_NIT  as numCiNit,
        c.FEC_INICIO   as fecInicio,
        c.FEC_FIN      as fecFin,
        c.TOTAL        as total,
        c.SALDO        as saldo,
        c.ESTADO       as estado,
        c.COD_SUC      as codSuc,
        c.COD_USU      as codUsu,
        c.OBS          as obs,
        DATEDIFF(DAY, GETDATE(), c.FEC_FIN) as diasRestantes
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE c.COD_CRE = @0 AND s.COD_EMP = @1
    `, [cod_cre, cod_emp]);

    if (credito.length === 0) {
      throw new NotFoundException(`Crédito ${cod_cre} no encontrado`);
    }

    const items = await this.dataSource.query(`
      SELECT
        dc.ID_FAB       as idFab,
        dc.COD_FAB      as codFab,
        dc.CANTIDAD     as cantidadOriginal,
        (dc.CANTIDAD - ISNULL(dd.CANTIDAD_DEV, 0)) as cantidadDisponible,
        ISNULL(dd.CANTIDAD_DEV, 0) as cantidadDevuelta,
        dc.PRECIO_CRE   as precioCre,
        dc.DESCUENTO    as descuento,
        p.DESC_PRO      as descPro,
        p.COD_PRO       as codPro
      FROM DET_CREDITO dc
      INNER JOIN PROV_PRO pp ON pp.ID_FAB = dc.ID_FAB
      INNER JOIN PRODUCTO p ON p.ID_PRO = pp.ID_PRO
      LEFT JOIN (
        SELECT COD_CRE, ID_FAB, SUM(CANTIDAD) as CANTIDAD_DEV
        FROM DET_DEVOLUCION_CREDITO
        GROUP BY COD_CRE, ID_FAB
      ) dd ON dd.COD_CRE = dc.COD_CRE AND dd.ID_FAB = dc.ID_FAB
      WHERE dc.COD_CRE = @0
    `, [cod_cre]);

    return {
      ...credito[0],
      alerta: this.calcularAlerta(credito[0].diasRestantes),
      items,
    };
  }
    async pagoMultiple(cod_cli: number, codCreList: string[], cod_emp: string) {
      if (!Array.isArray(codCreList) || codCreList.length === 0) {
        throw new BadRequestException('Debe seleccionar al menos un crédito');
      }

      const clienteEmp = await this.dataSource.query(`
        SELECT s.COD_EMP
        FROM CLIENTE cl
        INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
        WHERE cl.cod_cli = @0
      `, [cod_cli]);

      if (clienteEmp.length === 0 || clienteEmp[0].COD_EMP !== cod_emp) {
        throw new BadRequestException('Este cliente no pertenece a su empresa');
      }

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        let totalAbonado = 0;
        const detalles: { cod_cre: string; monto: number }[] = [];

        for (const cod_cre of codCreList) {
          const credito = await queryRunner.query(`
            SELECT SALDO, ESTADO, COD_CLI FROM CREDITO WHERE COD_CRE = @0
          `, [cod_cre]);

          if (credito.length === 0) {
            throw new NotFoundException(`Crédito ${cod_cre} no encontrado`);
          }
          if (Number(credito[0].COD_CLI) !== Number(cod_cli)) {
            throw new BadRequestException(`El crédito ${cod_cre} no pertenece a este cliente`);
          }
          if (credito[0].ESTADO !== 'A') {
            throw new BadRequestException(`El crédito ${cod_cre} no está activo`);
          }

          const saldo = Number(credito[0].SALDO);
          if (saldo <= 0) {
            throw new BadRequestException(`El crédito ${cod_cre} no tiene saldo pendiente`);
          }

          // Generar N_PAGO dentro de la misma transacción
          const ultimoPago = await queryRunner.query(`
            SELECT TOP 1 N_PAGO FROM PAGO_CREDITO
            WHERE COD_CRE = @0
            ORDER BY N_PAGO DESC
          `, [cod_cre]);

          let secuencial = 0;
          if (ultimoPago.length > 0) {
            secuencial = parseInt((ultimoPago[0].N_PAGO as string).slice(-2), 10) + 1;
          }
          const n_pago = `${cod_cre}${secuencial.toString().padStart(2, '0')}`;

          await queryRunner.query(`
            INSERT INTO PAGO_CREDITO (
              COD_CRE, N_PAGO, TOTAL, SALDO, FECHA, COD_USU, OBS, estado, fecha_pago, tipo_pago
            ) VALUES (
              @0, @1, @2, 0, @3, @4, @5, 'A', @3, @6
            )
          `, [cod_cre, n_pago, saldo, new Date(), 'SISTEMA', 'Pago múltiple', 'EFECTIVO']);

          await queryRunner.query(`
            UPDATE CREDITO SET SALDO = 0, ESTADO = 'C' WHERE COD_CRE = @0
          `, [cod_cre]);

          totalAbonado += saldo;
          detalles.push({ cod_cre, monto: saldo });
        }

        await queryRunner.commitTransaction();

        return {
          totalAbonado,
          creditosPagados: detalles.length,
          detalles,
          message: `${detalles.length} crédito(s) saldado(s) correctamente`,
        };
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }
    }
}