import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SistemaUsuarioAlmacen } from './entities/sistema-usuario-almacen.entity';
import { AlmacenesService } from './almacenes.service';
import { AlmacenesController } from './almacenes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SistemaUsuarioAlmacen])],
  controllers: [AlmacenesController],
  providers: [AlmacenesService],
  exports: [AlmacenesService],
})
export class AlmacenesModule {}