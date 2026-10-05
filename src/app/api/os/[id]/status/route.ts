import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { changeStatusSchema } from '@/lib/validation/os';
import { changeServiceOrderStatus } from '@/lib/os/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Movimentacao de status (Kanban ou menu de acoes). A transicao e validada no
 * servidor, registra data/hora e o usuario responsavel pela alteracao.
 *
 * O motivo do cancelamento, a observacao de finalizacao e a justificativa de
 * reabertura chegam aqui, mas quem decide se sao obrigatorios e o servico, que
 * conhece o status atual.
 */
export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  assertSameOrigin(request);
  const { id } = await context.params;
  const { status, ...options } = parseOrThrow(changeStatusSchema, await readJson(request));
  return NextResponse.json(await changeServiceOrderStatus(id, status, actor, options));
});
