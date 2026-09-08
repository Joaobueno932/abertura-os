import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, conflict, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { plantSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cadastro de usinas.
 *
 * Consultar e CADASTRAR sao liberados a qualquer usuario autenticado; alterar,
 * desativar e excluir continuam restritos a administradores (rotas de [id]).
 */
export const GET = withErrorHandling(async () => {
  await requireUser();
  const items = await prisma.plant.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      location: true,
      active: true,
      createdAt: true,
      _count: { select: { serviceOrders: true } },
    },
  });
  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (request: Request) => {
  await requireUser();
  assertSameOrigin(request);
  const input = parseOrThrow(plantSchema, await readJson(request));
  try {
    const created = await prisma.plant.create({
      data: {
        name: normalizeText(input.name),
        location: input.location ? normalizeText(input.location) : null,
        active: input.active,
      },
      select: { id: true, name: true, location: true, active: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'name')) throw conflict('Já existe uma usina com esse nome.');
    throw error;
  }
});
