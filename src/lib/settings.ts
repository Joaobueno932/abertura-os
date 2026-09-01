import { prisma } from '@/lib/prisma';
import { DEFAULT_RATES, parseCents, SETTING_KEYS, type Rates } from '@/lib/rates';

export { DEFAULT_RATES, SETTING_KEYS };
export type { Rates };

/** Le os valores vigentes em uma unica query, sem N+1. */
export async function getRates(): Promise<Rates> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [SETTING_KEYS.technicalHourlyRateCents, SETTING_KEYS.kmRateCents] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    technicalHourlyRateCents: parseCents(
      map.get(SETTING_KEYS.technicalHourlyRateCents),
      DEFAULT_RATES.technicalHourlyRateCents,
    ),
    kmRateCents: parseCents(map.get(SETTING_KEYS.kmRateCents), DEFAULT_RATES.kmRateCents),
  };
}

/** Atualiza os valores vigentes. OS ja gravadas nao sao afetadas. */
export async function updateRates(rates: Rates, updatedById: string): Promise<Rates> {
  const entries: Array<[string, number]> = [
    [SETTING_KEYS.technicalHourlyRateCents, rates.technicalHourlyRateCents],
    [SETTING_KEYS.kmRateCents, rates.kmRateCents],
  ];
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value), updatedById },
        update: { value: String(value), updatedById },
      }),
    ),
  );
  return rates;
}
