import { IsString, IsNotEmpty } from 'class-validator';

export class AsignarAlmacenDto {
  @IsString()
  @IsNotEmpty()
  cod_usu: string;

  @IsString()
  @IsNotEmpty()
  cod_suc: string;
}