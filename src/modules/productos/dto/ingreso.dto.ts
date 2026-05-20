export class HistorialIngresoDto {
  fecha: Date;
  tipo: 'IMPORTACION' | 'INVENTARIO';
  cantidad: number;
  referencia: string;
}
