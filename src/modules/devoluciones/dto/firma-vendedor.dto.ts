import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Firma digital del vendedor en una devolución: elige su usuario e ingresa su
 * contraseña. La contraseña solo se verifica; no se guarda.
 */
export class FirmaVendedorDto {
  @IsString()
  @IsNotEmpty({ message: 'Seleccione el vendedor que firma la devolución' })
  @MaxLength(7)
  cod_usu_vendedor: string;

  @IsString()
  @IsNotEmpty({ message: 'El vendedor debe ingresar su contraseña para firmar la devolución' })
  @MaxLength(100)
  password_vendedor: string;
}
