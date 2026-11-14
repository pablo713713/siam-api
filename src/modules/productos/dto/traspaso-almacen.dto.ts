import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
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
  // Debe ser un almacén asignado al encargado (SISTEMA_USUARIO_ALMACEN)
  @IsString({ message: 'cod_suc_ori debe ser un texto' })
  @IsNotEmpty({ message: 'El almacén de origen es requerido' })
  cod_suc_ori: string;

  // Por defecto MOTOR ZONE (00011)
  @IsOptional()
  @IsString({ message: 'cod_suc_des debe ser un texto' })
  cod_suc_des?: string;

  // El encargado que registra y autoriza NO viene en el body: se toma del token JWT.

  // Firma (obligatoria en todo traspaso). Contraseña del login de quien firma:
  //  - Salida a venta (almacén de tienda -> MOTOR ZONE): la del vendedor elegido.
  //  - Otros traspasos: la del propio encargado que registra.
  // Solo se usa para verificar; no se guarda.
  @IsString({ message: 'password_firma debe ser un texto' })
  @IsNotEmpty({ message: 'Debe ingresar la contraseña para firmar el traspaso' })
  @MaxLength(100)
  password_firma: string;

  // Vendedor que se lleva el producto (solo en salidas a venta)
  @IsOptional()
  @IsString({ message: 'cod_usu_vendedor debe ser un texto' })
  @MaxLength(7)
  cod_usu_vendedor?: string;

  @IsOptional()
  @IsString()
  obs?: string;

  @IsArray({ message: 'items debe ser una lista' })
  @IsNotEmpty({ message: 'Debe incluir al menos un ítem a traspasar' })
  @ValidateNested({ each: true })
  @Type(() => TraspasoItemDto)
  items: TraspasoItemDto[];
}
