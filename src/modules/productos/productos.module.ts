import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { Producto } from './entities/producto.entity';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { TraspasoEstadosService } from './traspaso-estados.service';
import { ProductosGestionService } from './productos-gestion.service';
import { ProductosGestionController } from './productos-gestion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Producto]), UsuariosModule],
  controllers: [ProductosGestionController, ProductosController],
  providers: [ProductosService, TraspasoEstadosService, ProductosGestionService],
  // Ventas y créditos lo usan para marcar como vendido lo que salió de un traspaso
  exports: [TraspasoEstadosService, ProductosService],
})
export class ProductosModule {}
