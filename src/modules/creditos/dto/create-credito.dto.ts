import { Type } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional,
  IsArray, ValidateNested, IsInt, IsPositive, IsNumber, Min,
} from 'class-validator';
import { DistribucionAlmacenDto } from '../../ventas/dto/create-venta.dto';

export class ItemCreditoDto {
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
  precio_cre: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistribucionAlmacenDto)
  @IsOptional()
  distribucion?: DistribucionAlmacenDto[];
}

export class CreateCreditoDto {
  @IsInt()
  @IsPositive()
  cod_cli: number;

  @IsString()
  @IsNotEmpty()
  cod_suc: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  semanasPlazo?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  dolar?: number;

  @IsString()
  @IsOptional()
  obs?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCreditoDto)
  items: ItemCreditoDto[];

  @IsString()
  @IsNotEmpty()
  cod_usu: string;
}