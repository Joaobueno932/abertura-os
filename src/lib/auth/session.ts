import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { env, getSessionSecret } from '@/lib/env';
import type { Role } from './roles';

export const SESSION_COOKIE = 'emconta_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Credencial de provisionamento: precisa definir nova senha antes de usar o sistema. */
  mustChangePassword: boolean;
};

/** Token opaco assinado: <random>.<hmac>. Apenas o hash e persistido. */
function signToken(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update(raw).digest('base64url');
}

function createToken(): string {
  const raw = randomBytes(32).toString('base64url');
  return `${raw}.${signToken(raw)}`;
}

function verifyTokenSignature(token: string): boolean {
  const index = token.lastIndexOf('.');
  if (index <= 0) return false;
  const raw = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = signToken(raw);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  // Limpeza oportunista de sessoes expiradas.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Resolve a sessao a partir do cookie. Retorna null se ausente/invalida/expirada. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || !verifyTokenSignature(token)) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          mustChangePassword: true,
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role as Role,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProduction,
    path: '/',
    expires: expiresAt,
  };
}
