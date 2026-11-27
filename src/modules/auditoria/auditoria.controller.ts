import { Controller, Get, Query } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { FiltrosAuditoriaDto, MODULOS_AUDITORIA } from './dto/filtros-auditoria.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CodEmp } from '../auth/decorators/cod-emp.decorator';

// Rastros de auditoría: solo Administrador
@Roles('Administrador')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  listar(@Query() filtros: FiltrosAuditoriaDto, @CodEmp() cod_emp: string) {
    return this.auditoria.listar(filtros, cod_emp);
  }

  @Get('filtros')
  async filtros(@CodEmp() cod_emp: string) {
    return {
      modulos: MODULOS_AUDITORIA,
      usuarios: await this.auditoria.usuariosConRegistros(cod_emp),
    };
  }
}
