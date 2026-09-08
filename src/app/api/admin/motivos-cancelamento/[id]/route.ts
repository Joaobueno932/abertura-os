import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, conflict, notFound, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { cancellationReasonSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;
  const input = parseOrThrow(cancellationReasonSchema.partial(), await readJson(request));

  const existing = await prisma.cancellationReason.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Motivo de cancelamento não encontrado.');

  try {
    const updated = await prisma.cancellationReason.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      select: { id: true, label: true, active: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'label')) throw conflict('Já existe um motivo com esse texto.');
    throw error;
  }
});

/**
 * Exclusao fisica apenas quando o motivo nunca foi usado. Se algum registro ja
 * foi cancelado por ele, e apenas inativado: o historico continua legivel.
 */
export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;

  const existing = await prisma.cancellationReason.findUnique({
    where: { id },
    select: { id: true, _count: { select: { serviceOrders: true, utilityTickets: true } } },
  });
  if (!existing) throw notFound('Motivo de cancelamento não encontrado.');

  if (existing._count.serviceOrders > 0 || existing._count.utilityTickets > 0) {
    const deactivated = await prisma.cancellationReason.update({
      where: { id },
      data: { active: false },
      select: { id: true, label: true, active: true },
    });
    return NextResponse.json({ ...deactivated, deactivatedInsteadOfDeleted: true });
  }

  await prisma.cancellationReason.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
});
