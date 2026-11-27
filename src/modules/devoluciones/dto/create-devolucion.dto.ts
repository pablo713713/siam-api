import { IsString, IsArray, ArrayMinSize, ValidateNested, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FirmaVendedorDto } from './firma-vendedor.dto';

export class DevolucionItemDto {
  @IsInt()
  id_fab: number;

  @IsString()
  cod_fab: string;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CreateDevolucionDto extends FirmaVendedorDto {
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
  @ArrayMinSize(1, { message: 'Seleccione al menos un producto para devolver' })
  @ValidateNested({ each: true })
  @Type(() => DevolucionItemDto)
  items: DevolucionItemDto[];
}
