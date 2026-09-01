import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { createOsSchema, osFiltersSchema } from '@/lib/validation/os';
import { createServiceOrder, listServiceOrders } from '@/lib/os/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Listagem paginada com busca e filtros. */
export const GET = withErrorHandling(async (request: Request) => {
  await requireUser();
  const url = new URL(request.url);
  const filters = parseOrThrow(osFiltersSchema, Object.fromEntries(url.searchParams));
  return NextResponse.json(await listServiceOrders(filters));
});

/** Abertura de OS. Numero, data de abertura e custos sao definidos no servidor. */
export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  assertSameOrigin(request);
  const input = parseOrThrow(createOsSchema, await readJson(request));
  const created = await createServiceOrder(input, actor);
  return NextResponse.json(created, { status: 201 });
});
