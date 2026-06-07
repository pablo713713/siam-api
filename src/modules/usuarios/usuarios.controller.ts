import { Controller, Get, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { SearchUsuarioDto } from './dto/search-usuario.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get('search')
  search(@Query() dto: SearchUsuarioDto) {
    return this.usuariosService.search(dto);
  }
}