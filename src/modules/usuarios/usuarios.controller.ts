import { Controller, Get, Query, Request } from '@nestjs/common';
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

  // Combo de vendedores para firmar traspasos (excluye al usuario que consulta)
  @Get('vendedores')
  getVendedores(@CodEmp() cod_emp: string, @Request() req: { user?: { cod_usu?: string } }) {
    return this.usuariosService.getVendedores(cod_emp, req.user?.cod_usu);
  }

  @Get('search')
  search(@Query() dto: SearchUsuarioDto, @CodEmp() cod_emp: string) {
    return this.usuariosService.search(dto, cod_emp);
  }
}