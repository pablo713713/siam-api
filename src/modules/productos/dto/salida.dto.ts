export class HistorialSalidaDto {
  fecha: Date;
  tipo: 'VENTA' | 'CREDITO' | 'PEDIDO';
  cantidad: number;
  referencia: string;
}
