import { Body, Controller, Get, HttpCode, Post, Query, Request } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { SearchUsuarioDto } from './dto/search-usuario.dto';
import { VerificarPasswordDto } from './dto/verificar-password.dto';
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

  // Confirma la identidad del usuario en sesión pidiéndole de nuevo su contraseña
  // (antes de acciones sensibles, p. ej. editar un producto). Limitado a 5 intentos.
  @Post('verificar-password')
  @HttpCode(200)
  async verificarPassword(
    @Body() dto: VerificarPasswordDto,
    @Request() req: { user: { cod_usu: string } },
    @CodEmp() cod_emp: string,
  ) {
    await this.usuariosService.verificarFirma(req.user.cod_usu, dto.password, cod_emp, null);
    return { ok: true };
  }

  @Get('search')
  search(@Query() dto: SearchUsuarioDto, @CodEmp() cod_emp: string) {
    return this.usuariosService.search(dto, cod_emp);
  }
}