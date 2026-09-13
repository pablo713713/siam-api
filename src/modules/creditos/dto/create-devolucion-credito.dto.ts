import { Type } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional, IsBoolean,
  IsArray, ValidateNested, IsInt, IsPositive, IsNumber, Min,
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

  @IsNumber()
  @Min(0)
  total: number;
}

export class CreateDevolucionCreditoDto {
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
  @ValidateNested({ each: true })
  @Type(() => ItemDevolucionCreditoDto)
  items: ItemDevolucionCreditoDto[];
}