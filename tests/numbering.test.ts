import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatOsNumber, parseOsNumber, reserveOsNumber } from '@/lib/os/numbering';
import { createServiceOrder } from '@/lib/os/service';
import { businessDayKey } from '@/lib/datetime';
import { createUser, osPayload, resetDatabase, seedCatalog, seedRates } from './helpers';
import { createOsSchema, type CreateOsInput } from '@/lib/validation/os';

describe('formato do numero da OS', () => {
  it('monta AAAAMMDDNNN com sequencia de 3 digitos', () => {
    expect(formatOsNumber('20260831', 1)).toBe('20260831001');
    expect(formatOsNumber('20260831', 2)).toBe('20260831002');
    expect(formatOsNumber('20260831', 42)).toBe('20260831042');
    expect(formatOsNumber('20260901', 1)).toBe('20260901001');
  });

  it('rejeita dia e sequencia invalidos', () => {
    expect(() => formatOsNumber('2026-08-31', 1)).toThrow();
    expect(() => formatOsNumber('20260831', 0)).toThrow();
    expect(() => formatOsNumber('20260831', 1000)).toThrow(/999/);
  });

  it('decompoe o numero de volta', () => {
    expect(parseOsNumber('20260831003')).toEqual({ day: '20260831', sequence: 3 });
    expect(parseOsNumber('2026083100')).toBeNull();
    expect(parseOsNumber('abcdefghijk')).toBeNull();
  });
});

describe('reserva sequencial no PostgreSQL', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('primeira OS do dia recebe a sequencia 001', async () => {
    const day = new Date('2026-08-31T15:00:00.000Z');
    const first = await prisma.$transaction((tx) => reserveOsNumber(tx, day));
    expect(first.number).toBe('20260831001');
    expect(first.sequence).toBe(1);
  });

  it('segunda e terceira OS do mesmo dia incrementam', async () => {
    const day = new Date('2026-08-31T15:00:00.000Z');
    await prisma.$transaction((tx) => reserveOsNumber(tx, day));
    const second = await prisma.$transaction((tx) => reserveOsNumber(tx, day));
    const third = await prisma.$transaction((tx) => reserveOsNumber(tx, day));
    expect(second.number).toBe('20260831002');
    expect(third.number).toBe('20260831003');
  });

  it('a sequencia reinicia no dia seguinte', async () => {
    const first = new Date('2026-08-31T15:00:00.000Z');
    const next = new Date('2026-09-01T15:00:00.000Z');
    await prisma.$transaction((tx) => reserveOsNumber(tx, first));
    await prisma.$transaction((tx) => reserveOsNumber(tx, first));
    const nextDay = await prisma.$transaction((tx) => reserveOsNumber(tx, next));
    expect(nextDay.number).toBe('20260901001');
  });

  it('grava o contador na tabela OrderSequence', async () => {
    const day = new Date('2026-08-31T15:00:00.000Z');
    await prisma.$transaction((tx) => reserveOsNumber(tx, day));
    await prisma.$transaction((tx) => reserveOsNumber(tx, day));

    const row = await prisma.orderSequence.findUnique({ where: { day: '20260831' } });
    expect(row?.lastSeq).toBe(2);
  });
});

describe('virada do dia no fuso de negocio', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  // 31/08/2026 23:59 em America/Campo_Grande (UTC-4) = 01/09/2026 03:59 UTC.
  const lastMinuteOfAugust = new Date('2026-09-01T03:59:00.000Z');
  // 01/09/2026 00:01 em America/Campo_Grande = 01/09/2026 04:01 UTC.
  const firstMinuteOfSeptember = new Date('2026-09-01T04:01:00.000Z');

  it('23:59 de 31/08 ainda usa o prefixo 20260831', () => {
    expect(businessDayKey(lastMinuteOfAugust)).toBe('20260831');
  });

  it('00:01 de 01/09 ja usa o prefixo 20260901', () => {
    expect(businessDayKey(firstMinuteOfSeptember)).toBe('20260901');
  });

  it('a primeira OS depois da virada e a 001 do novo dia', async () => {
    const before = await prisma.$transaction((tx) => reserveOsNumber(tx, lastMinuteOfAugust));
    const after = await prisma.$transaction((tx) => reserveOsNumber(tx, firstMinuteOfSeptember));

    expect(before.number).toBe('20260831001');
    expect(after.number).toBe('20260901001');
  });

  it('nao depende do fuso do sistema operacional', () => {
    // O calculo usa Intl com timeZone explicito; TZ do processo e irrelevante.
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      expect(businessDayKey(lastMinuteOfAugust)).toBe('20260831');
      process.env.TZ = 'Asia/Tokyo';
      expect(businessDayKey(lastMinuteOfAugust)).toBe('20260831');
      process.env.TZ = 'America/Los_Angeles';
      expect(businessDayKey(firstMinuteOfSeptember)).toBe('20260901');
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});

describe('concorrencia e unicidade', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRates();
  });

  async function openConcurrently(count: number) {
    const catalog = await seedCatalog();
    const actor = await createUser();
    const input: CreateOsInput = createOsSchema.parse(osPayload(catalog));

    const created = await Promise.all(
      Array.from({ length: count }, () => createServiceOrder(input, actor)),
    );
    return created.map((order) => order.number);
  }

  it('20 aberturas simultaneas produzem 20 numeros distintos e sequenciais', async () => {
    const numbers = await openConcurrently(20);

    expect(numbers).toHaveLength(20);
    expect(new Set(numbers).size).toBe(20);

    const day = numbers[0]!.slice(0, 8);
    expect(numbers.every((number) => number.startsWith(day))).toBe(true);
    expect(numbers.every((number) => /^\d{11}$/.test(number))).toBe(true);

    const sequences = numbers.map((number) => Number(number.slice(8))).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));

    // Nenhuma transacao ficou parcialmente persistida.
    expect(await prisma.serviceOrder.count()).toBe(20);
    expect(await prisma.serviceOrderEvent.count()).toBe(20);
    const counter = await prisma.orderSequence.findUnique({ where: { day } });
    expect(counter?.lastSeq).toBe(20);
  });

  it('50 aberturas simultaneas continuam sem duplicatas nem buracos', async () => {
    const numbers = await openConcurrently(50);

    expect(new Set(numbers).size).toBe(50);
    const day = numbers[0]!.slice(0, 8);
    expect(numbers.every((number) => number.startsWith(day))).toBe(true);

    const sequences = numbers.map((number) => Number(number.slice(8))).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(await prisma.serviceOrder.count()).toBe(50);
  });

  it('a constraint UNIQUE do PostgreSQL impede gravar dois numeros iguais', async () => {
    const catalog = await seedCatalog();
    const actor = await createUser();
    const input = createOsSchema.parse(osPayload(catalog));
    const existing = await createServiceOrder(input, actor);

    await expect(
      prisma.serviceOrder.create({
        data: {
          number: existing.number,
          title: 'duplicada',
          location: 'local',
          description: 'DESCRICAO',
          plantId: catalog.plant.id,
          institutionId: catalog.institution.id,
          responsibleId: catalog.responsible.id,
          expectedDate: new Date(Date.UTC(2026, 8, 15, 12)),
          technicianCount: 1,
          hoursPerTechnicianCenti: 100,
          outboundKmCenti: 0,
          returnKmCenti: 0,
          technicalHourlyRateCents: 15_000,
          kmRateCents: 150,
          technicalSubtotalCents: 15_000,
          travelSubtotalCents: 0,
          totalCents: 15_000,
          createdById: actor.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await prisma.serviceOrder.count()).toBe(1);
  });
});

describe('independencia do processo (restart)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRates();
  });

  it('a sequencia continua apos reiniciar o cliente/processo', async () => {
    const catalog = await seedCatalog();
    const actor = await createUser();
    const input = createOsSchema.parse(osPayload(catalog));

    const first = await createServiceOrder(input, actor);
    const second = await createServiceOrder(input, actor);
    const day = first.number.slice(0, 8);
    expect(first.number).toBe(`${day}001`);
    expect(second.number).toBe(`${day}002`);

    // Um cliente novo equivale a um processo Node recem-iniciado: nenhum estado
    // de numeracao vive em memoria.
    const restarted = new PrismaClient();
    try {
      const third = await restarted.$transaction((tx) => reserveOsNumber(tx));
      expect(third.number).toBe(`${day}003`);
    } finally {
      await restarted.$disconnect();
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
