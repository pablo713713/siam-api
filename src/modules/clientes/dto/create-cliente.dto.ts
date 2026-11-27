import { Transform } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Alta de cliente (CLIENTE legacy + perfil extendido). Solo Administrador. */
export class CreateClienteDto {
  @Transform(recortar) @IsString() @IsNotEmpty({ message: 'El nombre es obligatorio' }) @MaxLength(30)
  nom_cli: string;

  @Transform(recortar) @IsString() @IsNotEmpty({ message: 'El apellido es obligatorio' }) @MaxLength(50)
  ape_cli: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(150)
  razon_social?: string;

  @IsOptional() @IsIn(['CI', 'NIT', 'NIN'], { message: 'Tipo de documento: CI, NIT o NIN (ninguno)' })
  tipo_doc?: 'CI' | 'NIT' | 'NIN';

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(20)
  num_ci_nit?: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(15)
  telefono?: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(20)
  celular?: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(255)
  domicilio?: string;

  @Transform(recortar) @IsOptional() @IsEmail({}, { message: 'El correo no es válido' }) @MaxLength(50)
  email?: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(50)
  ciudad?: string;

  // Calificación del cliente (CLIENTE_CONSIGNACION.codigo)
  @IsOptional() @IsString() @MaxLength(10)
  codigo?: string;

  @IsOptional() @IsNumber({}, { message: 'El límite de crédito debe ser un número' }) @Min(0)
  limite_credito?: number;

  @IsOptional() @IsBoolean()
  acepta_devoluciones?: boolean;
}
