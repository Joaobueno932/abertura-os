import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { changeStatusSchema } from '@/lib/validation/os';
import { changeUtilityTicketStatus } from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Movimentacao de status do chamado (Kanban ou tela de detalhes). Mesmas regras
 * das OS: motivo cadastrado ao cancelar, administrador mais justificativa para
 * retroceder um chamado encerrado. Tudo validado no servidor.
 */
export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  assertSameOrigin(request);
  const { id } = await context.params;
  const { status, ...options } = parseOrThrow(changeStatusSchema, await readJson(request));
  return NextResponse.json(await changeUtilityTicketStatus(id, status, actor, options));
});
