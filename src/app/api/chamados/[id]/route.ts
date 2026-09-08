import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, notFound, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { updateTicketSchema } from '@/lib/validation/ticket';
import {
  deleteUtilityTicket,
  getUtilityTicketDetail,
  getUtilityTicketEvents,
  updateUtilityTicket,
} from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  await requireUser();
  const { id } = await context.params;
  const ticket = await getUtilityTicketDetail(id);
  if (!ticket) throw notFound('Chamado não encontrado.');
  const events = await getUtilityTicketEvents(id);
  return NextResponse.json({ ticket, events });
});

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  assertSameOrigin(request);
  const { id } = await context.params;
  const input = parseOrThrow(updateTicketSchema, await readJson(request));
  return NextResponse.json(await updateUtilityTicket(id, input, actor));
});

/** Exclusao definitiva do chamado e do historico dele. Restrita a administradores. */
export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;
  const removed = await deleteUtilityTicket(id, actor);
  return NextResponse.json({ ok: true, deleted: true, number: removed.number });
});
