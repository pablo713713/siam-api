import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { CreateDevolucionCreditoDto } from './dto/create-devolucion-credito.dto';
import { TraspasoEstadosService } from '../productos/traspaso-estados.service';
import { calcularCupo, CupoCredito, SQL_LIMITE_EFECTIVO } from './credito-cupo';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  asegurarTablaRegistro, FilaRegistroDevolucion, guardarRegistroDevolucion, listarRegistroDevoluciones,
} from '../devoluciones/registro-devolucion';

const COD_SUC_MOTORZONE = '00011';
const PLAZO_DEFAULT_SEMANAS = 4;

@Injectable()
export class CreditosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly traspasoEstados: TraspasoEstadosService,
    private readonly usuariosService: UsuariosService,
    private readonly auditoria: AuditoriaService,
  ) {}

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
  // Cupo del cliente (límite del perfil o, si no, CREDITO_MAXIMO legacy)
  // ─────────────────────────────────────────
  async getCupo(cod_cli: number, cod_emp: string): Promise<CupoCredito> {
    const emp = await this.dataSource.query(`
      SELECT s.COD_EMP FROM CLIENTE cl
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      WHERE cl.cod_cli = @0
    `, [cod_cli]);
    if (!emp.length || emp[0].COD_EMP !== cod_emp) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }
    return (await calcularCupo(this.dataSource, cod_cli))!;
  }

  private mensajeLimite(cupo: CupoCredito, monto: number): string {
    return `El cliente alcanzó su límite de crédito. Límite: ${cupo.limite.toFixed(2)}, ` +
      `deuda pendiente: ${cupo.deuda.toFixed(2)}, disponible: ${cupo.disponible.toFixed(2)}, ` +
      `monto de este crédito: ${monto.toFixed(2)}. No se puede registrar.`;
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

    // 1. Validar que el cliente pueda comprar a crédito (tiene un límite > 0)
    const cupo = (await calcularCupo(this.dataSource, dto.cod_cli))!;
    if (!cupo.habilitado) {
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
    //    (se vuelve a validar dentro de la transacción, con bloqueo)
    if (totalFinal > cupo.disponible + 0.005) {
      throw new BadRequestException(this.mensajeLimite(cupo, totalFinal));
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
      // Revalidar el cupo bloqueando los créditos activos del cliente: dos créditos
      // registrados a la vez no pueden pasar juntos el límite
      const cupoActual = (await calcularCupo(queryRunner, dto.cod_cli, true))!;
      if (totalFinal > cupoActual.disponible + 0.005) {
        throw new BadRequestException(this.mensajeLimite(cupoActual, totalFinal));
      }

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

      await this.auditoria.registrar({
        cod_usu, modulo: 'CREDITO', accion: 'CREAR', documento: cod_cre,
        descripcion: `Crédito ${cod_cre} al cliente ${dto.cod_cli} por Bs ${totalFinal.toFixed(2)}, vence en ${semanasPlazo} semana(s)`,
        despues: {
          cliente: dto.cod_cli, total: totalFinal, descuento, semanasPlazo,
          cupoAntes: { limite: cupoActual.limite, deuda: cupoActual.deuda, disponible: cupoActual.disponible },
          items: dto.items.map((i) => ({ id_fab: i.id_fab, cod_fab: i.cod_fab, cantidad: i.cantidad, precio: i.precio_cre })),
        },
      }, queryRunner);

      await queryRunner.commitTransaction();

      return {
        cod_cre,
        total: totalFinal,
        fecFin,
        items: dto.items.length,
        // cupo después de este crédito (para la pantalla y la boleta)
        cupo: { ...cupoActual, deuda: cupoActual.deuda + totalFinal, disponible: Math.max(0, cupoActual.disponible - totalFinal) },
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
        ${SQL_LIMITE_EFECTIVO} as creditoMaximo,
        ISNULL(uso.usado, 0) as usado
      FROM CLIENTE cl
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      LEFT JOIN CLIENTE_EXTENSION ce ON ce.cod_cli = cl.cod_cli
      LEFT JOIN (
        SELECT COD_CLI, SUM(SALDO) as usado
        FROM CREDITO
        WHERE ESTADO = 'A'
        GROUP BY COD_CLI
      ) uso ON uso.COD_CLI = cl.cod_cli
      WHERE ${SQL_LIMITE_EFECTIVO} > 0
        AND s.COD_EMP = @0
      ORDER BY cl.NOM_CLI ASC
    `, [cod_emp]);

    return clientes.map((c: any) => ({
      ...c,
      // límite = creditoMaximo (efectivo), deuda = usado
      disponible: Math.max(0, Number(c.creditoMaximo) - Number(c.usado)),
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

    const cupo = await calcularCupo(this.dataSource, cod_cli);
    return { creditos: items, totalSaldos: totalSeleccionable, cupo };
  }

  async registrarDevolucion(cod_cre: string, dto: CreateDevolucionCreditoDto, cod_usu: string, cod_emp: string) {
    const credito = await this.dataSource.query(`
      SELECT c.SALDO, c.ESTADO, s.COD_EMP, ISNULL(c.descuento, 0) as DESCUENTO, c.COD_CLI
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

    const suc = await this.dataSource.query(
      `SELECT 1 as ok FROM SUCURSAL WHERE COD_SUC = @0 AND COD_EMP = @1`, [dto.cod_suc, cod_emp],
    );
    if (!suc.length) throw new BadRequestException(`El almacén ${dto.cod_suc} no es válido.`);

    // Firma digital: el vendedor elige su usuario y pone su contraseña
    const firmante = await this.usuariosService.verificarFirma(
      dto.cod_usu_vendedor, dto.password_vendedor, cod_emp, this.usuariosService.rolVendedor,
    );

    // Validar cantidad disponible a devolver por cada ítem. El total sale del
    // precio del crédito (con su descuento), no del que manda el cliente.
    const descuentoPct = Number(credito[0].DESCUENTO) || 0;
    const precios = new Map<number, number>();
    for (const item of dto.items) {
      const original = await this.dataSource.query(`
        SELECT dc.CANTIDAD, dc.PRECIO_CRE,
          ISNULL((SELECT SUM(ddc.CANTIDAD) FROM DET_DEVOLUCION_CREDITO ddc
                  WHERE ddc.COD_CRE = @0 AND ddc.ID_FAB = @1), 0) as yaDevuelto
        FROM DET_CREDITO dc
        WHERE dc.COD_CRE = @0 AND dc.ID_FAB = @1
      `, [cod_cre, item.id_fab]);

      if (original.length === 0) {
        throw new BadRequestException(`El ítem ID_FAB ${item.id_fab} no pertenece a este crédito`);
      }

      precios.set(item.id_fab, Number(original[0].PRECIO_CRE) * (1 - descuentoPct / 100));
      const disponibleADevolver = Number(original[0].CANTIDAD) - Number(original[0].yaDevuelto);
      if (item.cantidad > disponibleADevolver) {
        throw new BadRequestException(
          `No se puede devolver ${item.cantidad} de ID_FAB ${item.id_fab}. ` +
          `Disponible para devolver: ${disponibleADevolver}`
        );
      }
    }

    const redondear = (n: number) => Math.round(n * 100) / 100;
    for (const i of dto.items) i.total = redondear(i.cantidad * precios.get(i.id_fab)!);
    const totalDevolucion = redondear(dto.items.reduce((sum, i) => sum + i.total!, 0));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await asegurarTablaRegistro(queryRunner);

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

      // Cambio de producto: lo que el cliente se lleva se agrega a este mismo
      // crédito (sale de MOTOR ZONE y cuenta como vendido por el vendedor que firma)
      const lleva = dto.lleva ?? [];
      let totalLleva = 0;
      if (lleva.length > 0) {
        for (const l of lleva) {
          const pedido = lleva.filter((x) => x.id_fab === l.id_fab).reduce((s, x) => s + x.cantidad, 0);
          const stock = await queryRunner.query(`
            SELECT CANTIDAD FROM SUC_PRO_PROV WITH (UPDLOCK, ROWLOCK)
            WHERE ID_FAB = @0 AND COD_SUC = @1
          `, [l.id_fab, COD_SUC_MOTORZONE]);
          const disponible = stock.length > 0 ? Number(stock[0].CANTIDAD) : 0;
          if (disponible < pedido) {
            throw new BadRequestException(
              `Stock insuficiente en MOTOR ZONE para ID_FAB ${l.id_fab}. Disponible: ${disponible}, solicitado: ${pedido}. ` +
              'Debe realizar un traspaso previo desde otro almacén.',
            );
          }
        }
        const ult = await queryRunner.query(
          `SELECT ISNULL(MAX(nro_registro), 0) as n FROM DET_CREDITO WHERE COD_CRE = @0`, [cod_cre],
        );
        let nro = Number(ult[0]?.n ?? 0);
        for (const l of lleva) {
          nro += 1;
          await queryRunner.query(`
            INSERT INTO DET_CREDITO (COD_CRE, COD_FAB, CANTIDAD, PRECIO_CRE, DESCUENTO, nro_registro, ID_FAB)
            VALUES (@0, @1, @2, @3, 0, @4, @5)
          `, [cod_cre, l.cod_fab, l.cantidad, l.precio, nro, l.id_fab]);
          await queryRunner.query(`
            UPDATE SUC_PRO_PROV SET CANTIDAD = CANTIDAD - @0
            WHERE ID_FAB = @1 AND COD_SUC = @2
          `, [l.cantidad, l.id_fab, COD_SUC_MOTORZONE]);
        }
        totalLleva = redondear(lleva.reduce((s, l) => s + l.cantidad * l.precio, 0));
      }

      // Nuevo saldo: saldo − devuelto + lo que se lleva. Nunca negativo; si lo
      // devuelto supera la deuda, la diferencia se le devuelve al cliente.
      const saldoActual = Number(credito[0].SALDO);
      const neto = redondear(saldoActual - totalDevolucion + totalLleva);
      const nuevoSaldo = Math.max(0, neto);
      const aFavorCliente = Math.max(0, -neto);
      const nuevoEstado = nuevoSaldo <= 0 ? 'C' : 'A';

      // Si el cambio aumenta la deuda, debe entrar en el límite de crédito
      if (nuevoSaldo > saldoActual) {
        const cupo = (await calcularCupo(queryRunner, Number(credito[0].COD_CLI), true))!;
        const deudaOtros = cupo.deuda - saldoActual;
        if (deudaOtros + nuevoSaldo > cupo.limite + 0.005) {
          throw new BadRequestException(
            `El cambio supera el límite de crédito del cliente. Límite: ${cupo.limite.toFixed(2)}, ` +
            `deuda con el cambio: ${(deudaOtros + nuevoSaldo).toFixed(2)}.`,
          );
        }
      }

      await queryRunner.query(`
        UPDATE CREDITO SET SALDO = @0, ESTADO = @1, TOTAL = TOTAL + @3 WHERE COD_CRE = @2
      `, [nuevoSaldo, nuevoEstado, cod_cre, totalLleva]);

      const registro: FilaRegistroDevolucion[] = [
        ...dto.items.map((i): FilaRegistroDevolucion => ({
          movimiento: 'DEVUELVE', id_fab: i.id_fab, cod_fab: i.cod_fab,
          cantidad: i.cantidad, precio: precios.get(i.id_fab)!, cod_suc: dto.cod_suc,
        })),
        ...lleva.map((l): FilaRegistroDevolucion => ({
          movimiento: 'LLEVA', id_fab: l.id_fab, cod_fab: l.cod_fab,
          cantidad: l.cantidad, precio: l.precio, cod_suc: COD_SUC_MOTORZONE,
        })),
      ];
      const firma = await guardarRegistroDevolucion(queryRunner, {
        tipoDoc: 'CREDITO', codDoc: cod_cre, codDevc: Number(cod_devc), codEmp: cod_emp,
        codUsuRegistra: cod_usu, codUsuFirmante: firmante.cod_usu, obs: dto.obs,
      }, registro);

      await this.auditoria.registrar({
        cod_usu, modulo: 'DEVOLUCION', accion: lleva.length ? 'CAMBIO_CREDITO' : 'CREDITO', documento: cod_cre,
        descripcion: (lleva.length ? `Cambio de producto en el crédito ${cod_cre}` : `Devolución en el crédito ${cod_cre}`) +
          `: devuelve Bs ${totalDevolucion.toFixed(2)}` + (lleva.length ? `, lleva Bs ${totalLleva.toFixed(2)}` : '') +
          `. Firmó ${firmante.nombreCompleto || firmante.cod_usu}`,
        antes: { saldo: saldoActual },
        despues: {
          saldo: nuevoSaldo, estado: nuevoEstado, aFavorCliente, almacen: dto.cod_suc, firmante: firmante.cod_usu,
          devuelve: dto.items.map((i) => ({ id_fab: i.id_fab, cantidad: i.cantidad, total: i.total })),
          lleva: lleva.map((l) => ({ id_fab: l.id_fab, cantidad: l.cantidad, precio: l.precio })),
        },
      }, queryRunner);

      await queryRunner.commitTransaction();

      return {
        cod_devc,
        cod_cre,
        totalDevuelto: totalDevolucion,
        nuevoSaldo,
        estado: nuevoEstado,
        totalLleva,
        aFavorCliente,
        firma: {
          idGrupo: firma.idGrupo,
          firmante: { codUsu: firmante.cod_usu, alias: firmante.alias, nombre: firmante.nombreCompleto },
          fechaBolivia: firma.fecha,
          horaBolivia: firma.hora,
        },
        message: lleva.length ? 'Cambio de producto registrado en el crédito' : 'Devolución de crédito registrada correctamente',
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

      await this.auditoria.registrar({
        cod_usu, modulo: 'PAGO', accion: 'PAGAR', documento: cod_cre,
        descripcion: `Pago de Bs ${Number(dto.monto).toFixed(2)} al crédito ${cod_cre}: saldo Bs ${saldoActual.toFixed(2)} → Bs ${nuevoSaldo.toFixed(2)}`,
        antes: { saldo: saldoActual },
        despues: { saldo: nuevoSaldo, estado: nuevoEstado, monto: dto.monto, n_pago, tipoPago: dto.tipoPago ?? 'EFECTIVO' },
      }, queryRunner);

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
        LTRIM(RTRIM(ISNULL(u.NOM_USU, '') + ' ' + ISNULL(u.AP_USU, ''))) as nomVendedor,
        c.descuento    as descuento,
        c.OBS          as obs,
        DATEDIFF(DAY, GETDATE(), c.FEC_FIN) as diasRestantes
      FROM CREDITO c
      INNER JOIN CLIENTE cl ON cl.cod_cli = c.COD_CLI
      INNER JOIN SUCURSAL s ON s.COD_SUC = cl.COD_SUC
      LEFT JOIN USUARIO u ON u.COD_USU = c.COD_USU
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
      cupo: await calcularCupo(this.dataSource, Number(credito[0].codCli)),
      devoluciones: await listarRegistroDevoluciones(this.dataSource, 'CREDITO', cod_cre),
    };
  }
    async pagoMultiple(cod_cli: number, codCreList: string[], cod_emp: string, cod_usu: string) {
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
          `, [cod_cre, n_pago, saldo, new Date(), cod_usu, 'Pago múltiple', 'EFECTIVO']);

          await queryRunner.query(`
            UPDATE CREDITO SET SALDO = 0, ESTADO = 'C' WHERE COD_CRE = @0
          `, [cod_cre]);

          totalAbonado += saldo;
          detalles.push({ cod_cre, monto: saldo });
        }

        await this.auditoria.registrar({
          cod_usu, modulo: 'PAGO', accion: 'PAGO_MULTIPLE', documento: String(cod_cli),
          descripcion: `Pago de Bs ${totalAbonado.toFixed(2)} que salda ${detalles.length} crédito(s) del cliente ${cod_cli}`,
          despues: { cliente: cod_cli, totalAbonado, creditos: detalles },
        }, queryRunner);

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