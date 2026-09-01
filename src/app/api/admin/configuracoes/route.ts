import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { ratesSchema } from '@/lib/validation/admin';
import { getRates, updateRates } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  return NextResponse.json(await getRates());
});

/**
 * Altera os valores unitarios vigentes. OS ja gravadas mantem os valores
 * usados no momento do calculo (integridade historica).
 */
export const PUT = withErrorHandling(async (request: Request) => {
  const actor = await requireAdmin();
  assertSameOrigin(request);
  const input = parseOrThrow(ratesSchema, await readJson(request));
  const saved = await updateRates(
    {
      technicalHourlyRateCents: input.technicalHourlyRate,
      kmRateCents: input.kmRate,
    },
    actor.id,
  );
  return NextResponse.json(saved);
});
