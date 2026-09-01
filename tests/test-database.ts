/**
 * Resolucao do banco de teste, compartilhada pelo vitest.config.ts e pelo
 * globalSetup (que roda no processo principal, sem o `test.env`).
 *
 * Os testes de integracao usam o MESMO PostgreSQL da aplicacao em um schema
 * dedicado. O schema `public`, com os dados reais, nunca e tocado.
 */

export const TEST_SCHEMA = 'os_test';

function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Em CI as variaveis costumam vir do proprio ambiente.
  }
}

/** Devolve a URL informada apontando para o schema de teste. */
function withTestSchema(raw: string | undefined, name: string): string {
  if (!raw) {
    throw new Error(
      `${name} nao definida: os testes de integracao precisam do PostgreSQL configurado.`,
    );
  }
  const url = new URL(raw);
  url.searchParams.set('schema', TEST_SCHEMA);
  return url.toString();
}

export type TestDatabaseEnv = {
  DATABASE_URL: string;
  DIRECT_URL: string;
  TEST_SCHEMA: string;
};

export function testDatabaseEnv(): TestDatabaseEnv {
  loadDotEnv();
  return {
    DATABASE_URL: withTestSchema(process.env.DATABASE_URL, 'DATABASE_URL'),
    DIRECT_URL: withTestSchema(
      process.env.DIRECT_URL ?? process.env.DATABASE_URL,
      'DIRECT_URL/DATABASE_URL',
    ),
    TEST_SCHEMA,
  };
}
