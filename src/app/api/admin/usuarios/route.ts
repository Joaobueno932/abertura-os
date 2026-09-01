import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, conflict, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { userSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O hash de senha nunca sai do servidor. */
const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const items = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: publicFields,
  });
  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  assertSameOrigin(request);
  const input = parseOrThrow(userSchema, await readJson(request));
  try {
    const created = await prisma.user.create({
      data: {
        name: normalizeText(input.name),
        email: input.email,
        role: input.role,
        active: input.active,
        passwordHash: await hashPassword(input.password),
      },
      select: publicFields,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'email')) throw conflict('Já existe um usuário com esse e-mail.');
    throw error;
  }
});
