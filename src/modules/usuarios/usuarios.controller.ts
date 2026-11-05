import { Controller, Get, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { SearchUsuarioDto } from './dto/search-usuario.dto';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  findAll(@CodEmp() cod_emp: string) {
    return this.usuariosService.findAll(cod_emp);
  }

  @Get('search')
  search(@Query() dto: SearchUsuarioDto, @CodEmp() cod_emp: string) {
    return this.usuariosService.search(dto, cod_emp);
  }
}