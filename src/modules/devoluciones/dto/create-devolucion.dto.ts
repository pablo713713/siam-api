import { IsString, IsArray, ValidateNested, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DevolucionItemDto {
  @IsInt()
  id_fab: number;

  @IsString()
  cod_fab: string;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CreateDevolucionDto {
  @IsString()
  cod_venta: string;

  // Se ignora: la devolución se registra a nombre del usuario del token
  @IsOptional()
  @IsString()
  cod_usu: string;

  @IsOptional()
  @IsString()
  cod_suc?: string;

  @IsOptional()
  @IsString()
  obs?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DevolucionItemDto)
  items: DevolucionItemDto[];
}
