import { Type } from 'class-transformer';
import { FirmaVendedorDto } from '../../devoluciones/dto/firma-vendedor.dto';
import {
  IsString, IsNotEmpty, IsOptional, IsBoolean,
  IsArray, ArrayMinSize, ValidateNested, IsInt, IsPositive, IsNumber, Min,
} from 'class-validator';

export class ItemDevolucionCreditoDto {
  @IsInt()
  @IsPositive()
  id_fab: number;

  @IsString()
  @IsNotEmpty()
  cod_fab: string;

  @IsInt()
  @IsPositive()
  cantidad: number;

  // Se ignora: el total se calcula con el precio del crédito
  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;
}

export class CreateDevolucionCreditoDto extends FirmaVendedorDto {
  @IsString()
  @IsNotEmpty()
  cod_suc: string;

  @IsBoolean()
  @IsOptional()
  esTotal?: boolean;

  @IsString()
  @IsOptional()
  obs?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos un producto para devolver' })
  @ValidateNested({ each: true })
  @Type(() => ItemDevolucionCreditoDto)
  items: ItemDevolucionCreditoDto[];
}