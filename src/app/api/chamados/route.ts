import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { createTicketSchema } from '@/lib/validation/ticket';
import { osFiltersSchema } from '@/lib/validation/os';
import { createUtilityTicket, listUtilityTickets } from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Listagem paginada dos chamados da concessionaria. */
export const GET = withErrorHandling(async (request: Request) => {
  await requireUser();
  const url = new URL(request.url);
  const filters = parseOrThrow(osFiltersSchema, Object.fromEntries(url.searchParams));
  return NextResponse.json(await listUtilityTickets(filters));
});

/**
 * Abertura de chamado junto a concessionaria. O numero e a data de abertura sao
 * definidos no servidor; o prazo vem da previsao em horas informada.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  assertSameOrigin(request);
  const input = parseOrThrow(createTicketSchema, await readJson(request));
  const created = await createUtilityTicket(input, actor);
  return NextResponse.json(created, { status: 201 });
});
