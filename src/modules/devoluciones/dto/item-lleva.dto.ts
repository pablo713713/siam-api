import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Min } from 'class-validator';

/**
 * Producto que el cliente se lleva en un cambio (p. ej. devuelve el
 * amortiguador derecho y se lleva el izquierdo). Sale de MOTOR ZONE como en
 * una venta normal. Precio unitario en Bs, igual que en la venta.
 */
export class ItemLlevaDto {
  @IsInt()
  @IsPositive()
  id_fab: number;

  @IsString()
  @IsNotEmpty()
  cod_fab: string;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @IsPositive({ message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0.01, { message: 'El precio debe ser mayor a 0' })
  precio: number;

  // Precio de lista de referencia (opcional)
  @IsNumber()
  @Min(0)
  prec_lista: number = 0;
}
