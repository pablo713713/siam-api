import { AuditoriaService } from './auditoria.service';

describe('AuditoriaService.registrar', () => {
  it('no hace nada si todavía no existe SISTEMA_AUDITORIA', async () => {
    const consultas: string[] = [];
    const ds = { query: async (sql: string) => { consultas.push(sql); return [{ ok: null }]; } };
    await new AuditoriaService(ds as never).registrar({ cod_usu: '0000001', modulo: 'VENTA', accion: 'CREAR', descripcion: 'x' });
    expect(consultas.some((q) => q.includes('INSERT'))).toBe(false);
  });

  it('inserta con la empresa del usuario y el detalle en JSON', async () => {
    const llamadas: { sql: string; params?: unknown[] }[] = [];
    const ds = {
      query: async (sql: string, params?: unknown[]) => {
        llamadas.push({ sql, params });
        return sql.includes('OBJECT_ID') ? [{ ok: 1 }] : [];
      },
    };
    await new AuditoriaService(ds as never).registrar({
      cod_usu: '0000001', modulo: 'PAGO', accion: 'PAGAR', documento: 'C1',
      descripcion: 'Pago', antes: { saldo: 100 }, despues: { saldo: 60 },
    });
    const ins = llamadas.find((l) => l.sql.includes('INSERT INTO SISTEMA_AUDITORIA'))!;
    expect(ins.sql).toContain('INNER JOIN SUCURSAL');
    expect(ins.params).toEqual(['0000001', 'PAGO', 'PAGAR', 'C1', 'Pago', '{"saldo":100}', '{"saldo":60}']);
  });
});
