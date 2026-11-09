import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsInt, Min, MaxLength } from 'class-validator';
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

  @IsOptional()
  @IsString({ message: 'cod_suc_des debe ser un texto' })
  cod_suc_des?: string;

  // El encargado que autoriza NO viene en el body: se toma del token JWT.

  // Firma del vendedor que se lleva el producto (combo de usuario + contraseña).
  // Obligatoria cuando el origen es un sub-almacén de Motor Zone.
  @IsOptional()
  @IsString({ message: 'cod_usu_vendedor debe ser un texto' })
  @MaxLength(7)
  cod_usu_vendedor?: string;

  @IsOptional()
  @IsString({ message: 'password_vendedor debe ser un texto' })
  @MaxLength(100)
  password_vendedor?: string;

  @IsOptional()
  @IsString()
  obs?: string;

  @IsArray({ message: 'items debe ser una lista' })
  @IsNotEmpty({ message: 'Debe incluir al menos un ítem a traspasar' })
  @ValidateNested({ each: true })
  @Type(() => TraspasoItemDto)
  items: TraspasoItemDto[];
}
