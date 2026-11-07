import { IsNotEmpty, IsString } from 'class-validator';

export class VerificarCajeroDto {
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña del cajero es obligatoria' })
  password: string;
}
