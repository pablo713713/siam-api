import { IsString, IsOptional, IsNumber, IsPositive } from 'class-validator';

export class RegistrarPagoDto {
  @IsNumber()
  @IsPositive()
  monto: number;

  @IsString()
  @IsOptional()
  tipoPago?: string;

  @IsString()
  @IsOptional()
  obs?: string;
}