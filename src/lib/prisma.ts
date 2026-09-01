import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Tamanho do pool e espera por conexao.
 *
 * A abertura de OS usa transacao interativa, que segura uma conexao enquanto
 * dura. Sob rajada de aberturas simultaneas as transacoes formam fila no lock
 * da linha de OrderSequence, entao o pool precisa ser maior que o padrao do
 * Prisma (num_cpus * 2 + 1) e a espera, mais generosa - caso contrario a
 * requisicao falha com P2024 antes mesmo de chegar ao banco.
 *
 * Ambos podem ser sobrescritos pela propria DATABASE_URL, que tem precedencia.
 */
const POOL_DEFAULTS = { connection_limit: '25', pool_timeout: '30' } as const;

function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    for (const [key, value] of Object.entries(POOL_DEFAULTS)) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    // URL nao parseavel: deixa o Prisma reportar o erro real.
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Em desenvolvimento o hot-reload recria modulos: reaproveitar a instancia
// evita esgotar o pool de conexoes do PostgreSQL.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Opcoes das transacoes interativas. `maxWait` acomoda a fila formada pelas
 * aberturas concorrentes; `timeout` limita a duracao de uma transacao.
 */
export const TX_OPTIONS = { maxWait: 20_000, timeout: 20_000 } as const;

/** Codigo de violacao de constraint UNIQUE no Prisma. */
export const UNIQUE_VIOLATION = 'P2002';

export function isUniqueViolation(error: unknown, target?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== UNIQUE_VIOLATION) return false;
  if (!target) return true;
  const meta = candidate.meta?.target;
  if (typeof meta === 'string') return meta.includes(target);
  if (Array.isArray(meta)) return meta.some((item) => String(item).includes(target));
  return false;
}
