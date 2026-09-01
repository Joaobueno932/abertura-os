import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { testDatabaseEnv } from './tests/test-database';

/**
 * Os testes de integracao rodam contra o MESMO PostgreSQL da aplicacao, porem
 * em um schema dedicado (`os_test`). Isso garante que o que se valida aqui e o
 * comportamento real do Postgres - e nao de outro banco - sem jamais tocar as
 * tabelas de producao, que vivem no schema `public`.
 */
const database = testDatabaseEnv();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // O schema de teste e compartilhado entre os arquivos: execucao sequencial.
    fileParallelism: false,
    env: {
      ...database,
      SESSION_SECRET: 'test-session-secret-com-mais-de-32-caracteres',
      NEXT_PUBLIC_APP_TIMEZONE: 'America/Campo_Grande',
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
