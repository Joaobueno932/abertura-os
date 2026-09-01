import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { clientKey, rateLimit } from '@/lib/auth/rate-limit';
import { assertSameOrigin, unauthorized, tooManyRequests, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { loginSchema } from '@/lib/validation/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Login por credenciais. Protegido por rate limit e verificacao de origem. */
export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);

  const body = await readJson(request);
  const { email, password } = parseOrThrow(loginSchema, body);

  // Limita tentativas por IP e por conta, dificultando forca bruta e enumeracao.
  const byIp = rateLimit(`login:ip:${clientKey(request)}`, 10, 5 * 60_000);
  const byAccount = rateLimit(`login:acc:${email}`, 5, 5 * 60_000);
  if (!byIp.allowed || !byAccount.allowed) {
    throw tooManyRequests('Muitas tentativas de acesso. Aguarde alguns minutos.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, active: true },
  });

  // Mensagem unica para credencial invalida e usuario inexistente/inativo.
  const invalid = unauthorized('E-mail ou senha inválidos.');
  if (!user) {
    // Consome tempo comparavel ao de um hash real para nao vazar existencia da conta.
    await verifyPassword(password, 'scrypt$32768$8$1$AAAA$AAAA');
    throw invalid;
  }
  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches || !user.active) throw invalid;

  const { token, expiresAt } = await createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true });
});
