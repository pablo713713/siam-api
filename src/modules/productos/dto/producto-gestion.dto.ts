import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const PRECIO_MAX = 100_000_000;

// Datos comunes al crear y al editar un producto
class ProductoDatosDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  codMod?: number; // MODELO.COD_MODELO

  @IsOptional()
  @IsString()
  @MaxLength(4)
  codigoTipo?: string; // TIPO_PRODUCTO.CODIGO

  @IsOptional()
  @IsString()
  @MaxLength(3)
  unidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  barra?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codAnt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  comentario?: string;

  // Precios en dólares
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  plisPro?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  pminPro?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  pmayPro?: number;

  // Precios en bolivianos
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  plisBs?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  pminBs?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  pmayBs?: number;

  // Costo CIF
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(PRECIO_MAX)
  cifCbba?: number;
}

// Registro de un producto nuevo (al recibir mercadería que todavía no existe)
export class CrearProductoDto extends ProductoDatosDto {
  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MaxLength(150)
  descPro: string;

  @IsString()
  @IsNotEmpty({ message: 'El código de producto es obligatorio' })
  @MaxLength(50)
  codPro: string;

  @IsString()
  @IsNotEmpty({ message: 'El código de fábrica es obligatorio' })
  @MaxLength(50)
  codFab: string;

  // PROVEEDOR.COD_PROV (la "marca" en las búsquedas)
  @IsString()
  @IsNotEmpty({ message: 'Seleccione la marca / proveedor' })
  @MaxLength(6)
  codProv: string;
}

// Edición (solo Administrador): cambia solo los campos enviados.
// Código de producto y código de fábrica no se editan.
export class EditarProductoDto extends ProductoDatosDto {
  // Contraseña del administrador que edita: confirma su identidad
  @IsString()
  @IsNotEmpty({ message: 'Ingrese su contraseña para confirmar la edición' })
  @MaxLength(100)
  password: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La descripción no puede quedar vacía' })
  @MaxLength(150)
  descPro?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Seleccione la marca / proveedor' })
  @MaxLength(6)
  codProv?: string;
}

// Filtros del historial de cambios de productos
export class AuditoriaProductosDto {
  @IsOptional()
  @Matches(FECHA_ISO, { message: 'fecha_desde debe tener el formato YYYY-MM-DD' })
  fecha_desde?: string;

  @IsOptional()
  @Matches(FECHA_ISO, { message: 'fecha_hasta debe tener el formato YYYY-MM-DD' })
  fecha_hasta?: string;

  // Nombre, apellido o alias de quien hizo el cambio
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nombre?: string;

  // Descripción o código de fábrica del producto
  @IsOptional()
  @IsString()
  @MaxLength(60)
  producto?: string;

  @IsOptional()
  @IsIn(['CREAR', 'EDITAR'])
  accion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
