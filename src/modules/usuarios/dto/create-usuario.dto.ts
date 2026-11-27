import { Transform } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Alta de usuario (USUARIO legacy) con sus roles y almacenes. Solo Administrador. */
export class CreateUsuarioDto {
  @Transform(recortar) @IsString() @IsNotEmpty({ message: 'El nombre es obligatorio' }) @MaxLength(30)
  nom_usu: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(50)
  ap_usu?: string;

  @Transform(recortar) @IsString() @IsNotEmpty({ message: 'El alias es obligatorio' }) @MaxLength(30)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'El alias solo puede tener letras, números, punto, guion y guion bajo (sin espacios)' })
  alias: string;

  // El sistema legacy guarda la contraseña en texto plano (USUARIO.CONTRASEÑA)
  @IsString() @MinLength(3, { message: 'La contraseña debe tener al menos 3 caracteres' }) @MaxLength(100)
  contrasena: string;

  // CARGO.COD_CAR
  @IsString() @IsNotEmpty({ message: 'Seleccione el cargo' }) @MaxLength(3)
  cod_car: string;

  // Sucursal del usuario: define su empresa
  @IsString() @IsNotEmpty({ message: 'Seleccione la sucursal' }) @MaxLength(5)
  cod_suc: string;

  @Transform(recortar) @IsOptional() @IsEmail({}, { message: 'El correo no es válido' }) @MaxLength(50)
  email?: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(10)
  telefono?: string;

  @Transform(recortar) @IsOptional() @IsString() @MaxLength(10)
  celular?: string;

  // Roles iniciales (SISTEMA_ROLES.id, solo activos)
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true })
  roles?: number[];

  // Almacenes asignados (para encargados)
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) @MaxLength(5, { each: true })
  almacenes?: string[];
}
