import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TraspasoItemDto {
  @IsInt({ message: 'id_fab debe ser un número entero' })
  @Min(1, { message: 'id_fab debe ser mayor a 0' })
  id_fab: number;

  @IsInt({ message: 'cantidad debe ser un número entero' })
  @Min(1, { message: 'cantidad debe ser al menos 1' })
  cantidad: number;

  @IsOptional()
  @IsString()
  obs?: string;
}

export class TraspasoAlmacenDto {
  @IsString({ message: 'cod_suc_ori debe ser un texto' })
  @IsNotEmpty({ message: 'El almacén de origen es requerido' })
  cod_suc_ori: string;

  @IsString({ message: 'cod_suc_des debe ser un texto' })
  @IsNotEmpty({ message: 'El almacén de destino es requerido' })
  cod_suc_des: string;

  @IsString({ message: 'cod_usu debe ser un texto' })
  @IsNotEmpty({ message: 'El código de usuario es requerido' })
  cod_usu: string;

  @IsOptional()
  @IsString()
  obs?: string;

  @IsArray({ message: 'items debe ser una lista' })
  @IsNotEmpty({ message: 'Debe incluir al menos un ítem a traspasar' })
  @ValidateNested({ each: true })
  @Type(() => TraspasoItemDto)
  items: TraspasoItemDto[];
}
