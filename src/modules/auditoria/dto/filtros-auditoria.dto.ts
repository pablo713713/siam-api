import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MODULOS_AUDITORIA = [
  'VENTA', 'CREDITO', 'PAGO', 'DEVOLUCION', 'TIPO_CAMBIO', 'ROL', 'ALMACEN', 'CLIENTE', 'USUARIO',
] as const;

export class FiltrosAuditoriaDto {
  @IsOptional() @IsDateString({}, { message: 'fecha_ini debe ser una fecha (AAAA-MM-DD)' })
  fecha_ini?: string;

  @IsOptional() @IsDateString({}, { message: 'fecha_fin debe ser una fecha (AAAA-MM-DD)' })
  fecha_fin?: string;

  @IsOptional() @IsIn(MODULOS_AUDITORIA as unknown as string[])
  modulo?: string;

  @IsOptional() @IsString() @MaxLength(20)
  accion?: string;

  @IsOptional() @IsString() @MaxLength(7)
  cod_usu?: string;

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;
}
