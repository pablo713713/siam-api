import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateRolDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  descripcion?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}