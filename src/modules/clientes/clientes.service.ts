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
    const cliente = await this.clienteRepository.findOne({
      where: { cod_cli },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente ${cod_cli} no encontrado`);
    }

    const extension = await this.extensionRepository.findOne({
      where: { cod_cli },
    });

    return {
      cod_cli: cliente.cod_cli,
      razon_social: cliente.RAZON_SOCIAL,
      num_ci_nit: cliente.NUM_CI_NIT,
      telefono: cliente.TEL_DOM,
      celular: cliente.CEL,
      domicilio: cliente.DOMICILIO,
      activo: cliente.baja === 0,
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
}