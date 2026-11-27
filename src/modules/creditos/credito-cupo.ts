/**
 * Límite de crédito de un cliente:
 *   - el del perfil extendido (CLIENTE_EXTENSION.limite_credito) cuando está cargado (> 0)
 *   - si no, el legacy CLIENTE.CREDITO_MAXIMO
 * Deuda = suma del SALDO de sus créditos activos. Disponible = límite − deuda.
 *
 * Ejemplo: límite 1000, debía 800 y pagó 200 → deuda 600, disponible 400.
 */
export interface CupoCredito {
  limite: number;
  fuente: 'PERFIL' | 'LEGACY';
  deuda: number;
  disponible: number;
  habilitado: boolean;
}

interface Consultable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

/** Expresión SQL del límite efectivo (requiere alias cl = CLIENTE y ce = CLIENTE_EXTENSION). */
export const SQL_LIMITE_EFECTIVO =
  'ISNULL(NULLIF(ce.limite_credito, 0), ISNULL(cl.CREDITO_MAXIMO, 0))';

/**
 * Calcula el cupo. Con `bloquear`, dentro de una transacción, bloquea los
 * créditos activos del cliente para que dos créditos simultáneos no superen
 * juntos el límite.
 */
export async function calcularCupo(
  db: Consultable,
  cod_cli: number,
  bloquear = false,
): Promise<CupoCredito | null> {
  const filas: { limiteExt: number | null; maximo: number | null }[] = await db.query(`
    SELECT ce.limite_credito as limiteExt, cl.CREDITO_MAXIMO as maximo
    FROM CLIENTE cl
    LEFT JOIN CLIENTE_EXTENSION ce ON ce.cod_cli = cl.cod_cli
    WHERE cl.cod_cli = @0
  `, [cod_cli]);
  if (!filas.length) return null;

  const limiteExt = Number(filas[0].limiteExt ?? 0);
  const limite = limiteExt > 0 ? limiteExt : Number(filas[0].maximo ?? 0);

  const deudaFila: { deuda: number }[] = await db.query(`
    SELECT ISNULL(SUM(SALDO), 0) as deuda
    FROM CREDITO ${bloquear ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}
    WHERE COD_CLI = @0 AND ESTADO = 'A'
  `, [cod_cli]);
  const deuda = Number(deudaFila[0]?.deuda ?? 0);
  const redondear = (n: number) => Math.round(n * 100) / 100;

  return {
    limite: redondear(limite),
    fuente: limiteExt > 0 ? 'PERFIL' : 'LEGACY',
    deuda: redondear(deuda),
    disponible: redondear(Math.max(0, limite - deuda)),
    habilitado: limite > 0,
  };
}
