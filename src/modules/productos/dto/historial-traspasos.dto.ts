import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Filtros del historial de traspasos firmados (el "talonario digital")
export class HistorialTraspasosDto {
  // Rango de fechas de la firma, en hora de Bolivia (YYYY-MM-DD)
  @IsOptional()
  @Matches(FECHA_ISO, { message: 'fecha_desde debe tener el formato YYYY-MM-DD' })
  fecha_desde?: string;

  @IsOptional()
  @Matches(FECHA_ISO, { message: 'fecha_hasta debe tener el formato YYYY-MM-DD' })
  fecha_hasta?: string;

  // Nombre, apellido o alias de quien registró o de quien firmó
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nombre?: string;

  // Almacén de salida
  @IsOptional()
  @IsString()
  @MaxLength(5)
  cod_suc_ori?: string;

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
