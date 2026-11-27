import { Controller, Post, Body } from '@nestjs/common';
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { CodEmp } from '../auth/decorators/cod-emp.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { usuarioDelToken } from '../auth/utils/usuario-del-token';

@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devolucionesService: DevolucionesService) {}

  @Roles('Administrador')
  @Post()
  create(
    @Body() createDevolucionDto: CreateDevolucionDto,
    @CurrentUser('cod_usu') cod_usu: string,
    @CodEmp() cod_emp: string,
  ) {
    createDevolucionDto.cod_usu = usuarioDelToken(createDevolucionDto.cod_usu, cod_usu);
    return this.devolucionesService.create(createDevolucionDto, cod_emp);
  }
}