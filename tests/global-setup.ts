import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { testDatabaseEnv } from './test-database';

/**
 * Prepara o schema de teste no PostgreSQL aplicando as MESMAS migrations de
 * producao. O schema `public`, onde vivem os dados reais, nunca e tocado.
 *
 * Roda no processo principal do Vitest, onde `test.env` ainda nao vale: por
 * isso resolve as URLs pelo mesmo helper usado no vitest.config.ts.
 */
export default async function setup() {
  const { DATABASE_URL, DIRECT_URL, TEST_SCHEMA } = testDatabaseEnv();

  // Salvaguarda: jamais recriar o schema de producao.
  if (TEST_SCHEMA === 'public' || !/^os_test[a-z0-9_]*$/.test(TEST_SCHEMA)) {
    throw new Error(
      `Schema de teste inseguro: "${TEST_SCHEMA}". Use um schema dedicado com prefixo os_test.`,
    );
  }
  if (new URL(DATABASE_URL).searchParams.get('schema') !== TEST_SCHEMA) {
    throw new Error('DATABASE_URL dos testes nao aponta para o schema de teste.');
  }

  // Recria o schema de teste do zero para que reflita exatamente as migrations.
  // DDL vai pela conexao direta.
  const admin = new PrismaClient({ datasources: { db: { url: DIRECT_URL } } });
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${TEST_SCHEMA}"`);
  } finally {
    await admin.$disconnect();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL, DIRECT_URL },
  });
}
