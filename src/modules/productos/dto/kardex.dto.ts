import { StockSucursalDto } from './stock.dto';

export class KardexMovimientoDto {
  fecha: Date;
  tipoOperacion: 'INGRESO' | 'SALIDA';
  origen: string;
  cantidad: number;
  referencia: string;
  saldoAcumulado: number;
}

export class KardexDto {
  stockPorSucursal: StockSucursalDto[];
  totalStockFisico: number;
  totalInventarioVirtual: number;
  movimientos: KardexMovimientoDto[];
}
