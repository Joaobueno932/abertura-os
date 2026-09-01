import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, SESSION_COOKIE } from '@/lib/auth/session';
import { assertSameOrigin, withErrorHandling } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Encerra a sessao atual e remove o cookie. */
export const POST = withErrorHandling(async (request: Request) => {
  assertSameOrigin(request);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
});
