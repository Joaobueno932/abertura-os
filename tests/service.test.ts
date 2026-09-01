import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  changeServiceOrderStatus,
  createServiceOrder,
  deleteServiceOrder,
  getServiceOrderEvents,
  listServiceOrders,
  loadKanban,
  updateServiceOrder,
} from '@/lib/os/service';
import { createOsSchema, osFiltersSchema, updateOsSchema } from '@/lib/validation/os';
import { loadFormOptions } from '@/lib/os/options';
import { updateRates } from '@/lib/settings';
import { AppError } from '@/lib/http';
import { createUser, osPayload, resetDatabase, seedCatalog, seedRates } from './helpers';

async function setup() {
  await resetDatabase();
  await seedRates();
  const catalog = await seedCatalog();
  const actor = await createUser({ role: 'USER' });
  const admin = await createUser({ role: 'ADMIN' });
  return { catalog, actor, admin };
}

describe('abertura de OS', () => {
  it('grava o cenario obrigatorio de validacao corretamente', async () => {
    const { catalog, actor } = await setup();
    const input = createOsSchema.parse(osPayload(catalog));
    const order = await createServiceOrder(input, actor);

    expect(order.number).toMatch(/^\d{11}$/);
    expect(order.number.endsWith('001')).toBe(true);
    expect(order.status).toBe('ABERTA');

    // Descricao persistida em CAIXA ALTA; titulo com a capitalizacao original.
    expect(order.description).toBe('REALIZAR MANUTENÇÃO PREVENTIVA E INSPEÇÃO DOS EQUIPAMENTOS.');
    expect(order.title).toBe('manutenção preventiva');

    // Custos recalculados no servidor.
    expect(order.technicalSubtotalCents).toBe(90_000);
    expect(order.travelSubtotalCents).toBe(60_000);
    expect(order.totalCents).toBe(150_000);

    // Valores unitarios do momento gravados na propria OS.
    expect(order.technicalHourlyRateCents).toBe(15_000);
    expect(order.kmRateCents).toBe(150);

    // Auditoria.
    expect(order.createdBy.id).toBe(actor.id);
    expect(order.openedAt).toBeInstanceOf(Date);
  });

  it('ignora subtotais e total enviados pelo cliente', async () => {
    const { catalog, actor } = await setup();
    const input = createOsSchema.parse(
      osPayload(catalog, { totalCents: 1, technicalSubtotalCents: 1, travelSubtotalCents: 1 }),
    );
    const order = await createServiceOrder(input, actor);
    expect(order.totalCents).toBe(150_000);
  });

  it('registra o evento de criacao no historico', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    const events = await getServiceOrderEvents(order.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CRIADA');
    expect(events[0]!.user?.id).toBe(actor.id);
  });

  it('recusa cadastro inexistente', async () => {
    const { catalog, actor } = await setup();
    const input = createOsSchema.parse(osPayload(catalog, { institutionId: 'inexistente' }));
    await expect(createServiceOrder(input, actor)).rejects.toBeInstanceOf(AppError);
  });
});

describe('cadastros inativos', () => {
  it('nao permite abrir OS com instituicao inativa', async () => {
    const { catalog, actor } = await setup();
    await prisma.institution.update({ where: { id: catalog.institution.id }, data: { active: false } });
    const input = createOsSchema.parse(osPayload(catalog));
    await expect(createServiceOrder(input, actor)).rejects.toThrow(/inativa/i);
  });

  it('nao permite abrir OS com responsavel inativo', async () => {
    const { catalog, actor } = await setup();
    await prisma.responsible.update({ where: { id: catalog.responsible.id }, data: { active: false } });
    const input = createOsSchema.parse(osPayload(catalog));
    await expect(createServiceOrder(input, actor)).rejects.toThrow(/inativo/i);
  });

  it('nao permite abrir OS com usina inativa', async () => {
    const { catalog, actor } = await setup();
    await prisma.plant.update({ where: { id: catalog.plant.id }, data: { active: false } });
    const input = createOsSchema.parse(osPayload(catalog));
    await expect(createServiceOrder(input, actor)).rejects.toThrow(/inativa/i);
  });

  it('inativos somem do formulario mas permanecem nas OS antigas', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);

    await prisma.institution.update({ where: { id: catalog.institution.id }, data: { active: false } });

    // Formulario de nova OS: a instituicao inativa nao aparece.
    const fresh = await loadFormOptions();
    expect(fresh.institutions.map((item) => item.id)).not.toContain(catalog.institution.id);

    // Edicao da OS que ja a usava: continua disponivel.
    const editing = await loadFormOptions({ institutionId: catalog.institution.id });
    expect(editing.institutions.map((item) => item.id)).toContain(catalog.institution.id);

    // A OS antiga segue exibindo a instituicao normalmente.
    const stored = await prisma.serviceOrder.findUniqueOrThrow({
      where: { id: order.id },
      select: { institution: { select: { name: true, active: true } } },
    });
    expect(stored.institution.name).toBe('FIEMS');
    expect(stored.institution.active).toBe(false);
  });

  it('permite salvar edicao mantendo o cadastro inativo ja vinculado', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await prisma.institution.update({ where: { id: catalog.institution.id }, data: { active: false } });

    const input = updateOsSchema.parse(osPayload(catalog, { title: 'manutenção corretiva' }));
    const updated = await updateServiceOrder(order.id, input, actor);
    expect(updated.title).toBe('manutenção corretiva');
  });
});

describe('edicao e historico', () => {
  it('registra as alteracoes com tipo, autor e valores', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);

    const other = await prisma.responsible.create({ data: { name: 'Maria Souza' } });
    const input = updateOsSchema.parse(
      osPayload(catalog, {
        title: 'manutenção corretiva',
        responsibleId: other.id,
        expectedDate: '2026-10-01',
        hoursPerTechnician: '4',
      }),
    );
    const updated = await updateServiceOrder(order.id, input, actor);

    expect(updated.technicalSubtotalCents).toBe(120_000);
    expect(updated.totalCents).toBe(180_000);
    expect(updated.updatedBy?.id).toBe(actor.id);

    const events = await getServiceOrderEvents(order.id);
    const types = events.map((event) => event.type);
    expect(types).toContain('RESPONSAVEL_ALTERADO');
    expect(types).toContain('PREVISAO_ALTERADA');
    expect(types).toContain('CUSTOS_ALTERADOS');
    expect(types).toContain('INFORMACOES_EDITADAS');

    const responsibleEvent = events.find((event) => event.type === 'RESPONSAVEL_ALTERADO');
    expect(responsibleEvent?.details).toContain('Maria Souza');
  });

  it('nao gera evento quando nada muda', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await updateServiceOrder(order.id, updateOsSchema.parse(osPayload(catalog)), actor);
    const events = await getServiceOrderEvents(order.id);
    expect(events).toHaveLength(1);
  });
});

describe('integridade historica dos valores', () => {
  it('alterar as configuracoes nao muda OS ja gravadas', async () => {
    const { catalog, actor, admin } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    expect(order.totalCents).toBe(150_000);

    await updateRates({ technicalHourlyRateCents: 17_000, kmRateCents: 170 }, admin.id);

    const stored = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.technicalHourlyRateCents).toBe(15_000);
    expect(stored.kmRateCents).toBe(150);
    expect(stored.totalCents).toBe(150_000);

    // Uma OS nova ja usa os valores atualizados.
    const next = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    expect(next.technicalHourlyRateCents).toBe(17_000);
    expect(next.kmRateCents).toBe(170);
    // 2 x 170,00 x 3 = 1020,00 ; 400 x 1,70 = 680,00
    expect(next.totalCents).toBe(102_000 + 68_000);
  });
});

describe('movimentacao de status', () => {
  it('percorre o fluxo e registra cada mudanca', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);

    const running = await changeServiceOrderStatus(order.id, 'EM_ANDAMENTO', actor);
    expect(running.status).toBe('EM_ANDAMENTO');

    const waiting = await changeServiceOrderStatus(order.id, 'AGUARDANDO', actor);
    expect(waiting.status).toBe('AGUARDANDO');

    const done = await changeServiceOrderStatus(order.id, 'CONCLUIDA', actor);
    expect(done.status).toBe('CONCLUIDA');
    expect(done.updatedBy?.id).toBe(actor.id);

    const events = await getServiceOrderEvents(order.id);
    const statusEvents = events.filter((event) => event.type === 'STATUS_ALTERADO');
    expect(statusEvents).toHaveLength(3);
    expect(statusEvents.at(-1)?.message).toContain('Aberta');
  });

  it('a alteracao persiste no banco', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await changeServiceOrderStatus(order.id, 'EM_ANDAMENTO', actor);

    const stored = await prisma.serviceOrder.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, updatedById: true },
    });
    expect(stored.status).toBe('EM_ANDAMENTO');
    expect(stored.updatedById).toBe(actor.id);
  });

  it('rejeita status invalido', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await expect(changeServiceOrderStatus(order.id, 'ARQUIVADA', actor)).rejects.toThrow(/inválido/i);
  });

  it('somente administrador reabre uma OS encerrada', async () => {
    const { catalog, actor, admin } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await changeServiceOrderStatus(order.id, 'CONCLUIDA', actor);

    await expect(changeServiceOrderStatus(order.id, 'ABERTA', actor)).rejects.toThrow(
      /administrador/i,
    );

    const reopened = await changeServiceOrderStatus(order.id, 'ABERTA', admin);
    expect(reopened.status).toBe('ABERTA');
  });

  it('usuario comum nao edita OS cancelada', async () => {
    const { catalog, actor, admin } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await changeServiceOrderStatus(order.id, 'CANCELADA', actor);

    const input = updateOsSchema.parse(osPayload(catalog, { title: 'outro título' }));
    await expect(updateServiceOrder(order.id, input, actor)).rejects.toThrow(/administrador/i);

    const byAdmin = await updateServiceOrder(order.id, input, admin);
    expect(byAdmin.title).toBe('outro título');
  });
});

describe('busca, filtros e paginacao', () => {
  it('filtra por texto, status e cadastros', async () => {
    const { catalog, actor } = await setup();
    const other = await prisma.institution.create({ data: { name: 'SESI' } });

    const first = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await createServiceOrder(
      createOsSchema.parse(
        osPayload(catalog, { title: 'inspeção termográfica', institutionId: other.id }),
      ),
      actor,
    );
    await changeServiceOrderStatus(first.id, 'EM_ANDAMENTO', actor);

    const byNumber = await listServiceOrders(osFiltersSchema.parse({ q: first.number }));
    expect(byNumber.total).toBe(1);
    expect(byNumber.items[0]!.id).toBe(first.id);

    const byTitle = await listServiceOrders(osFiltersSchema.parse({ q: 'termográfica' }));
    expect(byTitle.total).toBe(1);

    const byInstitutionName = await listServiceOrders(osFiltersSchema.parse({ q: 'SESI' }));
    expect(byInstitutionName.total).toBe(1);

    const byStatus = await listServiceOrders(osFiltersSchema.parse({ status: 'EM_ANDAMENTO' }));
    expect(byStatus.total).toBe(1);
    expect(byStatus.items[0]!.id).toBe(first.id);

    const byInstitution = await listServiceOrders(
      osFiltersSchema.parse({ institutionId: other.id }),
    );
    expect(byInstitution.total).toBe(1);

    const byResponsible = await listServiceOrders(
      osFiltersSchema.parse({ responsibleId: catalog.responsible.id }),
    );
    expect(byResponsible.total).toBe(2);

    const byPlant = await listServiceOrders(osFiltersSchema.parse({ plantId: catalog.plant.id }));
    expect(byPlant.total).toBe(2);
  });

  it('filtra por intervalo de previsao', async () => {
    const { catalog, actor } = await setup();
    await createServiceOrder(
      createOsSchema.parse(osPayload(catalog, { expectedDate: '2026-09-15' })),
      actor,
    );
    await createServiceOrder(
      createOsSchema.parse(osPayload(catalog, { expectedDate: '2026-11-20' })),
      actor,
    );

    const inRange = await listServiceOrders(
      osFiltersSchema.parse({ expectedFrom: '2026-09-01', expectedTo: '2026-09-30' }),
    );
    expect(inRange.total).toBe(1);
  });

  it('pagina os resultados', async () => {
    const { catalog, actor } = await setup();
    for (let index = 0; index < 5; index += 1) {
      await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    }

    const page1 = await listServiceOrders(osFiltersSchema.parse({ page: '1', pageSize: '2' }));
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);

    const page3 = await listServiceOrders(osFiltersSchema.parse({ page: '3', pageSize: '2' }));
    expect(page3.items).toHaveLength(1);
  });

  it('o Kanban devolve os totais por status', async () => {
    const { catalog, actor } = await setup();
    const first = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await changeServiceOrderStatus(first.id, 'EM_ANDAMENTO', actor);

    const board = await loadKanban(osFiltersSchema.parse({}));
    expect(board.items).toHaveLength(2);
    expect(board.totals.ABERTA).toBe(1);
    expect(board.totals.EM_ANDAMENTO).toBe(1);
  });
});

describe('exclusao de OS', () => {
  it('o administrador exclui a OS junto com o historico dela', async () => {
    const { catalog, actor, admin } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await changeServiceOrderStatus(order.id, 'EM_ANDAMENTO', actor);
    expect(await getServiceOrderEvents(order.id)).not.toHaveLength(0);

    const removed = await deleteServiceOrder(order.id, admin);
    expect(removed.number).toBe(order.number);

    expect(await prisma.serviceOrder.findUnique({ where: { id: order.id } })).toBeNull();
    // Os eventos saem por cascade: nao pode sobrar historico orfao.
    expect(await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id } })).toBe(0);
  });

  it('usuario comum nao exclui, mesmo chamando o servico direto', async () => {
    const { catalog, actor } = await setup();
    const order = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);

    await expect(deleteServiceOrder(order.id, actor)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.serviceOrder.findUnique({ where: { id: order.id } })).not.toBeNull();
  });

  it('OS inexistente devolve 404', async () => {
    const { admin } = await setup();
    await expect(deleteServiceOrder('id-que-nao-existe', admin)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('o numero da OS excluida nunca e reaproveitado', async () => {
    const { catalog, actor, admin } = await setup();
    const first = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    await deleteServiceOrder(first.id, admin);

    const second = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    expect(second.number).not.toBe(first.number);
    expect(second.number.endsWith('002')).toBe(true);
  });

  it('excluir uma OS nao afeta as demais', async () => {
    const { catalog, actor, admin } = await setup();
    const keep = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
    const drop = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);

    await deleteServiceOrder(drop.id, admin);

    const list = await listServiceOrders(osFiltersSchema.parse({}));
    expect(list.total).toBe(1);
    expect(list.items[0]?.id).toBe(keep.id);
    expect(await getServiceOrderEvents(keep.id)).not.toHaveLength(0);
  });
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
