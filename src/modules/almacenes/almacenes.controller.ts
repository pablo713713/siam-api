import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { AlmacenesService } from './almacenes.service';
import { AsignarAlmacenDto } from './dto/asignar-almacen.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Controller('almacenes')
export class AlmacenesController {
  constructor(
    private readonly almacenesService: AlmacenesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Roles('Administrador')
  @Get()
  findAll(@CodEmp() cod_emp: string) {
    return this.almacenesService.findAll(cod_emp);
  }

  // Encargados de cada almacén (quiénes pueden registrar traspasos desde él)
  @Roles('Administrador', 'Encargado de Almacen')
  @Get('encargados')
  getEncargados(@CodEmp() cod_emp: string) {
    return this.almacenesService.getEncargadosPorAlmacen(cod_emp);
  }

  @Roles('Administrador')
  @Get('usuario/:cod_usu')
  getAlmacenesDeUsuario(@Param('cod_usu') cod_usu: string) {
    return this.almacenesService.getAlmacenesDeUsuario(cod_usu);
  }

  @Roles('Administrador')
  @Post('asignar')
  async asignarAlmacen(@Body() dto: AsignarAlmacenDto, @CurrentUser('cod_usu') cod_usu: string) {
    const res = await this.almacenesService.asignarAlmacen(dto);
    await this.auditoria.registrarSeguro({
      cod_usu, modulo: 'ALMACEN', accion: 'ASIGNAR', documento: dto.cod_usu,
      descripcion: `Asignó el almacén ${dto.cod_suc} al usuario ${dto.cod_usu}`,
      despues: { cod_usu: dto.cod_usu, cod_suc: dto.cod_suc },
    });
    return res;
  }

  @Roles('Administrador')
  @Delete('usuario/:cod_usu/almacen/:cod_suc')
  async quitarAlmacen(
    @Param('cod_usu') cod_usu: string,
    @Param('cod_suc') cod_suc: string,
    @CurrentUser('cod_usu') quien: string,
  ) {
    const res = await this.almacenesService.quitarAlmacen(cod_usu, cod_suc);
    await this.auditoria.registrarSeguro({
      cod_usu: quien, modulo: 'ALMACEN', accion: 'QUITAR', documento: cod_usu,
      descripcion: `Quitó el almacén ${cod_suc} al usuario ${cod_usu}`,
      antes: { cod_usu, cod_suc },
    });
    return res;
  }
}