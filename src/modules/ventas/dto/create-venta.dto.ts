import { Type } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsBoolean, IsOptional,
  IsArray, ValidateNested, IsInt, IsPositive, IsNumber, Min,
} from 'class-validator';

export class ItemVentaDto {
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
  precio_venta: number;

  @IsNumber()
  @Min(0)
  prec_lista: number;

  @IsInt()
  existencia: number;
}

export class CreateVentaDto {
  @IsInt()
  @IsPositive()
  cod_cli: number;

  @IsString()
  @IsNotEmpty()
  cod_suc: string;

  @IsBoolean()
  factura: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  descuento?: number;

  @IsString()
  @IsOptional()
  obs?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  items: ItemVentaDto[];

  @IsString()
  @IsNotEmpty()
  cod_usu: string;
}