import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerificarPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Ingrese su contraseña' })
  @MaxLength(100)
  password: string;
}
