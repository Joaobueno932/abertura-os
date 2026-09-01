import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, badRequest, conflict, notFound, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { responsibleSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;
  const input = parseOrThrow(responsibleSchema.partial(), await readJson(request));

  const existing = await prisma.responsible.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Responsável não encontrado.');

  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, responsible: { select: { id: true } } },
    });
    if (!user) throw badRequest('Usuário inválido.', { userId: 'Selecione um usuário válido.' });
    if (user.responsible && user.responsible.id !== id) {
      throw conflict('Este usuário já está vinculado a outro responsável.');
    }
  }

  try {
    const updated = await prisma.responsible.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: normalizeText(input.name) } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.userId !== undefined ? { userId: input.userId || null } : {}),
      },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'name')) throw conflict('Já existe um responsável com esse nome.');
    throw error;
  }
});

/** Remove fisicamente apenas se nunca usado; caso contrario, inativa. */
export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;

  const existing = await prisma.responsible.findUnique({
    where: { id },
    select: { id: true, _count: { select: { serviceOrders: true } } },
  });
  if (!existing) throw notFound('Responsável não encontrado.');

  if (existing._count.serviceOrders > 0) {
    const deactivated = await prisma.responsible.update({
      where: { id },
      data: { active: false },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json({ ...deactivated, deactivatedInsteadOfDeleted: true });
  }

  await prisma.responsible.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
});
