import { patronLike, terminoFullText } from './productos.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegistrarTipoCambioDto } from '../ventas/dto/registrar-tipo-cambio.dto';

describe('terminoFullText (BUG-F2.3)', () => {
  it('quita las comillas dobles', () => {
    expect(terminoFullText('amort"iguador')).toBe('"amort iguador*"');
    expect(terminoFullText('"; DROP TABLE x; --')).toBe('"; DROP TABLE x; --*"');
  });
  it('sin letras ni números no usa full-text', () => {
    expect(terminoFullText('"')).toBeNull();
    expect(terminoFullText('%%')).toBeNull();
  });
  it('mantiene tildes y mayúsculas', () => {
    expect(terminoFullText('AMORTÍGUADOR')).toBe('"AMORTÍGUADOR*"');
  });
});

describe('patronLike', () => {
  it('trata %, _ y [ como texto literal', () => {
    expect(patronLike('100%')).toBe('%100[%]%');
    expect(patronLike('a_b[')).toBe('%a[_]b[[]%');
    expect(patronLike('340106/welmet')).toBe('%340106/welmet%');
  });
});

describe('RegistrarTipoCambioDto (BUG-F13.3)', () => {
  const errores = (tipo_cambio: unknown) =>
    validateSync(plainToInstance(RegistrarTipoCambioDto, { tipo_cambio })).length;
  it('rechaza 0, negativos, texto y valores absurdos', () => {
    expect(errores(0)).toBeGreaterThan(0);
    expect(errores(-5)).toBeGreaterThan(0);
    expect(errores('abc')).toBeGreaterThan(0);
    expect(errores(1000)).toBeGreaterThan(0);
  });
  it('acepta un valor válido, también como texto numérico', () => {
    expect(errores(9.96)).toBe(0);
    expect(errores('6.96')).toBe(0);
  });
});

import { calcularTipoTraspaso } from './productos.service';

describe('calcularTipoTraspaso', () => {
  it('de cualquier almacén a MOTOR ZONE es salida a venta (doble firma)', () => {
    expect(calcularTipoTraspaso('00005', '00011')).toBe('SALIDA_VENTA');
    expect(calcularTipoTraspaso('00007', '00011')).toBe('SALIDA_VENTA');
  });
  it('a MOTOR ZONE marcado como reposición es ingreso a tienda', () => {
    expect(calcularTipoTraspaso('00007', '00011', true)).toBe('INGRESO_TIENDA');
  });
  it('de un almacén externo a otro de la tienda es ingreso a tienda', () => {
    expect(calcularTipoTraspaso('00007', '00005')).toBe('INGRESO_TIENDA');
  });
  it('el resto es entre almacenes', () => {
    expect(calcularTipoTraspaso('00005', '00006')).toBe('ENTRE_ALMACENES');
    expect(calcularTipoTraspaso('00011', '00005')).toBe('ENTRE_ALMACENES');
  });
});
