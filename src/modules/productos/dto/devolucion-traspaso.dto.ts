import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DevolucionTraspasoItemDto {
  @IsInt()
  @Min(1)
  id_fab: number;

  @IsInt({ message: 'cantidad debe ser un número entero' })
  @Min(1, { message: 'cantidad debe ser al menos 1' })
  cantidad: number;
}

// Devolución al almacén de origen de lo que no se vendió de una salida a venta
export class DevolucionTraspasoDto {
  // Firma del encargado que recibe la mercadería de vuelta (su propia contraseña)
  @IsString()
  @IsNotEmpty({ message: 'Debe ingresar su contraseña para firmar la devolución' })
  @MaxLength(100)
  password_firma: string;

  // Si no se envía, se devuelve todo lo pendiente del traspaso
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DevolucionTraspasoItemDto)
  items?: DevolucionTraspasoItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(250)
  obs?: string;
}
