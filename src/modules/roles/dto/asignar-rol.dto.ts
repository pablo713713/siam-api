import { IsString, IsNotEmpty, IsInt, IsPositive } from 'class-validator';

export class AsignarRolDto {
  @IsString()
  @IsNotEmpty()
  cod_usu: string;

  @IsInt()
  @IsPositive()
  id_rol: number;
}