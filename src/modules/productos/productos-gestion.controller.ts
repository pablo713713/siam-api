import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { CodEmp } from 'src/modules/auth/decorators/cod-emp.decorator';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { JwtPayload } from 'src/modules/auth/interfaces/jwt-payload.interface';
import {
  AuditoriaProductosDto,
  CrearProductoDto,
  EditarProductoDto,
} from './dto/producto-gestion.dto';
import { ProductosGestionService } from './productos-gestion.service';

// Alta y edición de productos, con rastro de auditoría
@Controller('productos')
export class ProductosGestionController {
  constructor(private readonly gestion: ProductosGestionService) {}

  // Marcas / proveedores, tipos y modelos para los formularios
  @Roles('Administrador', 'Encargado de Almacen')
  @Get('catalogos')
  getCatalogos(@CodEmp() cod_emp: string) {
    return this.gestion.getCatalogos(cod_emp);
  }

  // Historial de cambios de productos
  @Roles('Administrador')
  @Get('auditoria')
  getAuditoria(@Query() filtros: AuditoriaProductosDto, @CodEmp() cod_emp: string) {
    return this.gestion.getAuditoria(filtros, cod_emp);
  }

  // Datos actuales de un producto para el formulario de edición
  @Roles('Administrador')
  @Get('fab/:idFab')
  getProducto(@Param('idFab', ParseIntPipe) idFab: number, @CodEmp() cod_emp: string) {
    return this.gestion.getProducto(idFab, cod_emp);
  }

  // Registrar un producto nuevo (al recibir mercadería que todavía no existe)
  @Roles('Administrador', 'Encargado de Almacen')
  @Post()
  crear(
    @Body() dto: CrearProductoDto,
    @Request() req: { user: JwtPayload },
    @CodEmp() cod_emp: string,
  ) {
    return this.gestion.crear(dto, req.user, cod_emp);
  }

  // Editar un producto: solo Administrador y confirmando con su contraseña
  @Roles('Administrador')
  @Put('fab/:idFab')
  editar(
    @Param('idFab', ParseIntPipe) idFab: number,
    @Body() dto: EditarProductoDto,
    @Request() req: { user: JwtPayload },
    @CodEmp() cod_emp: string,
  ) {
    return this.gestion.editar(idFab, dto, req.user, cod_emp);
  }
}
