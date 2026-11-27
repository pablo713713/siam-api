import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosGestionService } from './usuarios-gestion.service';

@Module({
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosGestionService],
  exports: [UsuariosService],
})
export class UsuariosModule {}