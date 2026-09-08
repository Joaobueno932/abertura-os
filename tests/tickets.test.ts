import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  changeUtilityTicketStatus,
  computeDueAt,
  createUtilityTicket,
  getUtilityTicketEvents,
  isTicketOverdue,
  listUtilityTickets,
  updateUtilityTicket,
} from '@/lib/tickets/service';
import { createServiceOrder } from '@/lib/os/service';
import { loadBoard } from '@/lib/board';
import { createTicketSchema, updateTicketSchema } from '@/lib/validation/ticket';
import { createOsSchema, osFiltersSchema } from '@/lib/validation/os';
import {
  createUser,
  osPayload,
  resetDatabase,
  seedCancellationReason,
  seedCatalog,
  seedRates,
} from './helpers';

async function setup() {
  await resetDatabase();
  await seedRates();
  const catalog = await seedCatalog();
  const reason = await seedCancellationReason();
  const actor = await createUser({ role: 'USER' });
  const admin = await createUser({ role: 'ADMIN' });
  return { catalog, reason, actor, admin };
}

type Catalog = Awaited<ReturnType<typeof seedCatalog>>;

function ticketPayload(catalog: Catalog, overrides: Record<string, unknown> = {}) {
  return {
    title: 'queda de energia na rede da concessionária',
    plantId: catalog.plant.id,
    institutionId: catalog.institution.id,
    responsibleId: catalog.responsible.id,
    expectedHours: '4',
    protocol: 'ENERGISA-2026-9081',
    description: 'Queda de energia na rede da concessionária afetando a usina.',
    ...overrides,
  };
}

describe('abertura de chamado da concessionaria', () => {
  it('grava numero proprio, prazo e descricao padronizada', async () => {
    const { catalog, actor } = await setup();
    const ticket = await createUtilityTicket(
      createTicketSchema.parse(ticketPayload(catalog)),
      actor,
    );

    expect(ticket.number).toMatch(/^CH\d{11}$/);
    expect(ticket.number.endsWith('001')).toBe(true);
    expect(ticket.status).toBe('ABERTA');
    expect(ticket.protocol).toBe('ENERGISA-2026-9081');
    expect(ticket.description).toBe(
      'QUEDA DE ENERGIA NA REDE DA CONCESSIONÁRIA AFETANDO A USINA.',
    );
    // Prazo = abertura + 4 h.
    expect(ticket.dueAt.getTime() - ticket.openedAt.getTime()).toBe(4 * 60 * 60 * 1000);

    const events = await getUtilityTicketEvents(ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('CRIADO');
  });

  it('a numeracao dos chamados nao consome a das OS', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    const ticket = await createUtilityTicket(
      createTicketSchema.parse(ticketPayload(catalog)),
      actor,
    );
    const second = await createUtilityTicket(
      createTicketSchema.parse(ticketPayload(catalog)),
      actor,
    );

    expect(order.number.endsWith('001')).toBe(true);
    expect(ticket.number.endsWith('001')).toBe(true);
    expect(second.number.endsWith('002')).toBe(true);
  });

  it('recusa previsao em horas invalida', async () => {
    const { catalog } = await setup();
    expect(() => createTicketSchema.parse(ticketPayload(catalog, { expectedHours: '0' }))).toThrow();
    expect(() => createTicketSchema.parse(ticketPayload(catalog, { protocol: '' }))).toThrow();
  });

  it('marca como atrasado apenas enquanto nao esta encerrado', () => {
    const openedAt = new Date('2026-09-08T12:00:00.000Z');
    const dueAt = computeDueAt(openedAt, 400); // 4 h
    const later = new Date('2026-09-08T17:00:00.000Z');

    expect(isTicketOverdue({ status: 'ABERTA', dueAt }, later)).toBe(true);
    expect(isTicketOverdue({ status: 'CONCLUIDA', dueAt }, later)).toBe(false);
    expect(isTicketOverdue({ status: 'ABERTA', dueAt }, openedAt)).toBe(false);
  });
});

describe('movimentacao de status do chamado', () => {
  it('cancelar exige motivo cadastrado', async () => {
    const { catalog, reason, actor } = await setup();
    const ticket = await createUtilityTicket(
      createTicketSchema.parse(ticketPayload(catalog)),
      actor,
    );

    await expect(changeUtilityTicketStatus(ticket.id, 'CANCELADA', actor)).rejects.toMatchObject({
      status: 400,
    });

    const cancelled = await changeUtilityTicketStatus(ticket.id, 'CANCELADA', actor, {
      cancellationReasonId: reason.id,
    });
    expect(cancelled.status).toBe('CANCELADA');
    expect(cancelled.cancellationReason?.label).toBe(reason.label);
  });

  it('somente administrador retrocede, e com justificativa', async () => {
    const { catalog, actor, admin } = await setup();
    const ticket = await createUtilityTicket(
      createTicketSchema.parse(ticketPayload(catalog)),
      actor,
    );
    await changeUtilityTicketStatus(ticket.id, 'CONCLUIDA', actor);

    await expect(changeUtilityTicketStatus(ticket.id, 'ABERTA', actor)).rejects.toThrow(
      /administrador/i,
    );
    await expect(changeUtilityTicketStatus(ticket.id, 'ABERTA', admin)).rejects.toMatchObject({
      status: 400,
    });

    const reopened = await changeUtilityTicketStatus(ticket.id, 'ABERTA', admin, {
      reason: 'Concessionária reabriu o protocolo.',
    });
    expect(reopened.status).toBe('ABERTA');
  });
});

describe('edicao do chamado', () => {
  it('alterar a previsao recalcula o prazo a partir da abertura', async () => {
    const { catalog, actor } = await setup();
    const ticket = await createUtilityTicket(
      createTicketSchema.parse(ticketPayload(catalog)),
      actor,
    );

    const updated = await updateUtilityTicket(
      ticket.id,
      updateTicketSchema.parse(ticketPayload(catalog, { expectedHours: '8' })),
      actor,
    );

    expect(updated.expectedHoursCenti).toBe(800);
    expect(updated.dueAt.getTime() - ticket.openedAt.getTime()).toBe(8 * 60 * 60 * 1000);
  });
});

describe('quadro e listagem', () => {
  it('o quadro traz OS e chamados juntos, e o filtro de tipo separa', async () => {
    const { catalog, actor } = await setup();
    await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await createUtilityTicket(createTicketSchema.parse(ticketPayload(catalog)), actor);

    const board = await loadBoard(osFiltersSchema.parse({}));
    expect(board.cards).toHaveLength(2);
    expect(board.byKind).toEqual({ OS: 1, CHAMADO: 1 });
    expect(board.totals.ABERTA).toBe(2);

    const onlyTickets = await loadBoard(osFiltersSchema.parse({ tipo: 'CHAMADO' }));
    expect(onlyTickets.cards).toHaveLength(1);
    expect(onlyTickets.cards[0]?.kind).toBe('CHAMADO');
    expect(onlyTickets.cards[0]?.extra).toContain('ENERGISA-2026-9081');

    const onlyOrders = await loadBoard(osFiltersSchema.parse({ tipo: 'OS' }));
    expect(onlyOrders.cards).toHaveLength(1);
    expect(onlyOrders.cards[0]?.kind).toBe('OS');
  });

  it('a busca encontra o chamado pelo protocolo', async () => {
    const { catalog, actor } = await setup();
    await createUtilityTicket(createTicketSchema.parse(ticketPayload(catalog)), actor);

    const found = await listUtilityTickets(osFiltersSchema.parse({ q: 'ENERGISA-2026' }));
    expect(found.total).toBe(1);

    const missing = await listUtilityTickets(osFiltersSchema.parse({ q: 'outro-protocolo' }));
    expect(missing.total).toBe(0);
  });
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
