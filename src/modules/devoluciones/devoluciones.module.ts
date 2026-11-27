import { Module } from '@nestjs/common';
import { DevolucionesController } from './devoluciones.controller';
import { DevolucionesService } from './devoluciones.service';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { VentasModule } from '../ventas/ventas.module';

@Module({
  imports: [UsuariosModule, VentasModule],
  controllers: [DevolucionesController],
  providers: [DevolucionesService]
})
export class DevolucionesModule {}
