import path from 'node:path';
import { APP_TIMEZONE } from './timezone';

const isProduction = process.env.NODE_ENV === 'production';

let cachedSecret: string | null = null;

/**
 * Segredo de assinatura dos cookies de sessao.
 *
 * Avaliado sob demanda, e nao na importacao do modulo: o `next build` executa
 * os modulos em modo producao para coletar as rotas, e o segredo so precisa
 * existir quando o servidor realmente atende uma requisicao.
 */
export function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) {
    cachedSecret = secret;
    return cachedSecret;
  }
  if (isProduction) {
    throw new Error(
      'SESSION_SECRET ausente ou muito curto. Defina uma chave com pelo menos 32 caracteres em producao.',
    );
  }
  // Fallback exclusivo de desenvolvimento/teste. Nunca usado em producao.
  cachedSecret = 'dev-only-insecure-session-secret-em-conta-os';
  return cachedSecret;
}

export const env = {
  isProduction,
  timezone: APP_TIMEZONE,
  docxTemplatePath: path.resolve(
    process.cwd(),
    process.env.OS_DOCX_TEMPLATE?.trim() || 'EM CONTA_O&M_papel timbrado.docx',
  ),
  sofficePath: process.env.SOFFICE_PATH?.trim() || '',
} as const;
