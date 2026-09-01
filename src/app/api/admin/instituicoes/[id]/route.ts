import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, conflict, notFound, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { institutionSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;
  const input = parseOrThrow(institutionSchema.partial(), await readJson(request));

  const existing = await prisma.institution.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Instituição não encontrada.');

  try {
    const updated = await prisma.institution.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: normalizeText(input.name) } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'name')) throw conflict('Já existe uma instituição com esse nome.');
    throw error;
  }
});

/**
 * Exclusao fisica apenas quando a instituicao nunca foi usada. Se ja estiver
 * vinculada a alguma OS, e apenas inativada, preservando o historico.
 */
export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;

  const existing = await prisma.institution.findUnique({
    where: { id },
    select: { id: true, _count: { select: { serviceOrders: true } } },
  });
  if (!existing) throw notFound('Instituição não encontrada.');

  if (existing._count.serviceOrders > 0) {
    const deactivated = await prisma.institution.update({
      where: { id },
      data: { active: false },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json({ ...deactivated, deactivatedInsteadOfDeleted: true });
  }

  await prisma.institution.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
});
