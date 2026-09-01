import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/auth/guard';
import { assertSameOrigin, notFound, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { updateOsSchema } from '@/lib/validation/os';
import {
  deleteServiceOrder,
  getServiceOrderDetail,
  getServiceOrderEvents,
  updateServiceOrder,
} from '@/lib/os/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, context: Context) => {
  await requireUser();
  const { id } = await context.params;
  const order = await getServiceOrderDetail(id);
  if (!order) throw notFound('Ordem de Serviço não encontrada.');
  const events = await getServiceOrderEvents(id);
  return NextResponse.json({ order, events });
});

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireUser();
  assertSameOrigin(request);
  const { id } = await context.params;
  const input = parseOrThrow(updateOsSchema, await readJson(request));
  return NextResponse.json(await updateServiceOrder(id, input, actor));
});

/** Exclusao definitiva da OS e do historico dela. Restrita a administradores. */
export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;
  const removed = await deleteServiceOrder(id, actor);
  return NextResponse.json({ ok: true, deleted: true, number: removed.number });
});
