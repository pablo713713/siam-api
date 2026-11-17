import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas.controller';
import { ConfigModule } from '@nestjs/config';
import { ProductosModule } from '../productos/productos.module';

@Module({
  imports: [ConfigModule, ProductosModule],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}