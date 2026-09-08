import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, conflict, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { cancellationReasonSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Motivos de cancelamento.
 *
 * A leitura e liberada a qualquer usuario autenticado - todo mundo precisa da
 * lista para cancelar uma OS. Acrescentar, alterar e remover sao acoes de
 * administrador.
 */
export const GET = withErrorHandling(async () => {
  await requireUser();
  const items = await prisma.cancellationReason.findMany({
    orderBy: [{ active: 'desc' }, { label: 'asc' }],
    select: {
      id: true,
      label: true,
      active: true,
      _count: { select: { serviceOrders: true, utilityTickets: true } },
    },
  });
  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  assertSameOrigin(request);
  const input = parseOrThrow(cancellationReasonSchema, await readJson(request));
  try {
    const created = await prisma.cancellationReason.create({
      data: { label: input.label, active: input.active },
      select: { id: true, label: true, active: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'label')) throw conflict('Já existe um motivo com esse texto.');
    throw error;
  }
});
