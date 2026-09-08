import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, conflict, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { institutionSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cadastro de clientes/instituicoes.
 *
 * Consultar e CADASTRAR sao liberados a qualquer usuario autenticado: quem abre
 * uma OS precisa poder incluir um cliente novo sem depender de um administrador.
 * Alterar, desativar e excluir continuam restritos a administradores - as rotas
 * de [id] aplicam requireAdmin.
 */
export const GET = withErrorHandling(async () => {
  await requireUser();
  const items = await prisma.institution.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
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
  const input = parseOrThrow(institutionSchema, await readJson(request));
  try {
    const created = await prisma.institution.create({
      data: { name: normalizeText(input.name), active: input.active },
      select: { id: true, name: true, active: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, 'name')) throw conflict('Já existe um cliente/instituição com esse nome.');
    throw error;
  }
});
