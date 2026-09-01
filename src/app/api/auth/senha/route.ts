import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  createSession,
  destroyAllSessions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { clientKey, rateLimit } from '@/lib/auth/rate-limit';
import { assertSameOrigin, badRequest, tooManyRequests, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { changePasswordSchema } from '@/lib/validation/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Troca de senha do proprio usuario. Atende tambem a troca obrigatoria do
 * primeiro acesso, por isso usa requireSession (e nao requireUser, que bloqueia
 * enquanto mustChangePassword estiver ativo).
 *
 * Ao concluir, todas as sessoes do usuario sao encerradas e uma nova e emitida:
 * a credencial de provisionamento deixa de valer em qualquer dispositivo.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireSession();
  assertSameOrigin(request);

  const limit = rateLimit(`senha:${actor.id}:${clientKey(request)}`, 5, 10 * 60_000);
  if (!limit.allowed) {
    throw tooManyRequests('Muitas tentativas de troca de senha. Aguarde alguns minutos.');
  }

  const input = parseOrThrow(changePasswordSchema, await readJson(request));

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, active: true },
  });
  if (!user || !user.active) throw badRequest('Usuário indisponível.');

  const matches = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw badRequest('Senha atual incorreta.', { currentPassword: 'Senha atual incorreta.' });
  }

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
    },
  });

  await destroyAllSessions(actor.id);
  const { token, expiresAt } = await createSession(actor.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true });
});
