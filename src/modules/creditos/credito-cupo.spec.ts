import { calcularCupo } from './credito-cupo';

const db = (limiteExt: number | null, maximo: number | null, deuda: number) => ({
  query: async (sql: string) =>
    sql.includes('CREDITO_MAXIMO') ? [{ limiteExt, maximo }] : [{ deuda }],
});

describe('calcularCupo', () => {
  it('ejemplo del stakeholder: límite 1000, debía 800 y pagó 200', async () => {
    const cupo = await calcularCupo(db(1000, 0, 600), 1);
    expect(cupo).toMatchObject({ limite: 1000, deuda: 600, disponible: 400, fuente: 'PERFIL', habilitado: true });
  });
  it('sin límite en el perfil usa CREDITO_MAXIMO legacy', async () => {
    const cupo = await calcularCupo(db(null, 500, 100), 1);
    expect(cupo).toMatchObject({ limite: 500, disponible: 400, fuente: 'LEGACY' });
  });
  it('límite 0 en el perfil también cae al legacy', async () => {
    expect((await calcularCupo(db(0, 300, 0), 1))?.limite).toBe(300);
  });
  it('sin ningún límite no está habilitado y el disponible nunca es negativo', async () => {
    expect(await calcularCupo(db(null, 0, 50), 1)).toMatchObject({ habilitado: false, disponible: 0 });
  });
});
