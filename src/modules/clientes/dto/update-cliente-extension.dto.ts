import { IsBoolean, IsOptional, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class UpdateClienteExtensionDto {
  @IsBoolean()
  @IsOptional()
  acepta_devoluciones?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  limite_credito?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  nivel_fidelidad?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observaciones?: string;
}