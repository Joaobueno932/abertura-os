import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, badRequest, conflict, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { responsibleSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const items = await prisma.responsible.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      active: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { serviceOrders: true } },
    },
  });
  return NextResponse.json({ items });
});

/** Vinculo opcional com um usuario do sistema (relacao 1:1). */
async function assertUserAvailable(userId: string | null | undefined, currentId?: string) {
  if (!userId) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, responsible: { select: { id: true } } },
  });
  if (!user) throw badRequest('Usuário inválido.', { userId: 'Selecione um usuário válido.' });
  if (user.responsible && user.responsible.id !== currentId) {
    throw conflict('Este usuário já está vinculado a outro responsável.');
  }
}

export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  assertSameOrigin(request);
  const input = parseOrThrow(responsibleSchema, await readJson(request));
  await assertUserAvailable(input.userId);
  try {
    const created = await prisma.responsible.create({
      data: {
        name: normalizeText(input.name),
        active: input.active,
        userId: input.userId || null,
      },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'name')) throw conflict('Já existe um responsável com esse nome.');
    throw error;
  }
});
