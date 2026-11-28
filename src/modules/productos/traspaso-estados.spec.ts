import { TraspasoEstadosService } from './traspaso-estados.service';

const qr = (total: number, devuelta: number) => {
  const updates: unknown[][] = [];
  return {
    updates,
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('SUM(CANTIDAD)')) return [{ total, devuelta }];
      updates.push(params ?? []);
      return [];
    },
  };
};

describe('TraspasoEstadosService.recalcularEstado (salidas)', () => {
  const svc = new TraspasoEstadosService({} as never);
  it('sin devoluciones queda COMPLETADO', async () => {
    expect(await svc.recalcularEstado(qr(6, 0) as never, 1)).toBe('COMPLETADO');
  });
  it('devolvió una parte: PARCIAL', async () => {
    expect(await svc.recalcularEstado(qr(6, 2) as never, 1)).toBe('PARCIAL');
  });
  it('devolvió todo: DEVUELTO', async () => {
    const q = qr(6, 6);
    expect(await svc.recalcularEstado(q as never, 7)).toBe('DEVUELTO');
    expect(q.updates[0]).toEqual([7, 'DEVUELTO']);
  });
});
