import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, Max } from 'class-validator';

// Tipo de cambio oficial o paralelo (Bs por 1 USD). BUG-F13.3: antes se
// aceptaban 0, negativos y texto (este último daba 500).
export class RegistrarTipoCambioDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'El tipo de cambio debe ser un número' })
  @IsPositive({ message: 'El tipo de cambio debe ser mayor a 0' })
  @Max(100, { message: 'El tipo de cambio no puede ser mayor a 100 Bs por dólar' })
  tipo_cambio: number;

  // Se ignora: se registra a nombre del usuario del token
  @IsOptional()
  @IsString()
  cod_usu?: string;
}
