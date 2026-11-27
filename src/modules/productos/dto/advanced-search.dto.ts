import { IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdvancedSearchProductoDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  codigo?: string;

  // Si se envía, cada producto trae su stock en ese almacén (stockAlmacen)
  @IsOptional()
  @IsString()
  @MaxLength(5)
  cod_suc?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
