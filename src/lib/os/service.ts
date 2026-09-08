import type { Prisma } from '@prisma/client';
import { prisma, isUniqueViolation, TX_OPTIONS } from '@/lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { normalizeDescription, normalizeText } from '@/lib/text';
import { formatDateOnlyBR } from '@/lib/datetime';
import { formatBRL, formatCenti } from '@/lib/money';
import { getRates, type Rates } from '@/lib/settings';
import { calculateCosts, CostValidationError } from './costs';
import { reserveOsNumber } from './numbering';
import { serializeChanges, type FieldChange } from './history';
import {
  canTransition,
  isOsStatus,
  MIN_REOPEN_REASON_LENGTH,
  requiresAdminToTransition,
  requiresCancellationReason,
  requiresReopenReason,
  STATUS_LABEL,
  type OsStatus,
} from './status';
import type {
  ChangeStatusInput,
  CreateOsInput,
  OsFilters,
  TechnicianInput,
  UpdateOsInput,
} from '@/lib/validation/os';
import type { SessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';

const MAX_NUMBER_ATTEMPTS = 5;

/** Projecao usada em listagens e no Kanban: apenas o necessario, sem N+1. */
const listSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  openedAt: true,
  expectedDate: true,
  location: true,
  technicianCount: true,
  totalCents: true,
  plant: { select: { id: true, name: true } },
  institution: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
} satisfies Prisma.ServiceOrderSelect;

/** Tecnicos sempre na ordem em que foram informados no formulario. */
const technicianSelect = {
  select: { id: true, position: true, name: true, responsibleId: true },
  orderBy: { position: 'asc' },
} satisfies Prisma.ServiceOrder$techniciansArgs;

/** Projecao completa da tela de detalhes e do documento. */
const detailSelect = {
  ...listSelect,
  description: true,
  hoursPerTechnicianCenti: true,
  outboundKmCenti: true,
  returnKmCenti: true,
  technicalHourlyRateCents: true,
  kmRateCents: true,
  technicalSubtotalCents: true,
  travelSubtotalCents: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  technicians: technicianSelect,
  cancellationReason: { select: { id: true, label: true } },
} satisfies Prisma.ServiceOrderSelect;

export type ServiceOrderListItem = Prisma.ServiceOrderGetPayload<{ select: typeof listSelect }>;
export type ServiceOrderDetail = Prisma.ServiceOrderGetPayload<{ select: typeof detailSelect }>;

/** Aceita tanto o cliente base quanto o de uma transacao. */
type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Confere que instituicao/responsavel/usina existem. Cadastros inativos so sao
 * aceitos quando ja estavam vinculados a OS (preserva o historico).
 */
async function resolveReferences(
  tx: Client,
  input: { plantId: string; institutionId: string; responsibleId: string },
  current?: { plantId: string; institutionId: string; responsibleId: string },
) {
  const [plant, institution, responsible] = await Promise.all([
    tx.plant.findUnique({
      where: { id: input.plantId },
      select: { id: true, name: true, active: true },
    }),
    tx.institution.findUnique({
      where: { id: input.institutionId },
      select: { id: true, name: true, active: true },
    }),
    tx.responsible.findUnique({
      where: { id: input.responsibleId },
      select: { id: true, name: true, active: true },
    }),
  ]);

  if (!plant) throw badRequest('Usina inválida.', { plantId: 'Selecione uma usina válida.' });
  if (!institution) {
    throw badRequest('Cliente/Instituição inválido.', {
      institutionId: 'Selecione um cliente/instituição válido.',
    });
  }
  if (!responsible) {
    throw badRequest('Responsável inválido.', {
      responsibleId: 'Selecione um responsável válido.',
    });
  }

  if (!plant.active && current?.plantId !== plant.id) {
    throw badRequest('Usina inativa.', {
      plantId: 'Esta usina está inativa e não pode ser selecionada.',
    });
  }
  if (!institution.active && current?.institutionId !== institution.id) {
    throw badRequest('Cliente/Instituição inativo.', {
      institutionId: 'Este cliente/instituição está inativo e não pode ser selecionado.',
    });
  }
  if (!responsible.active && current?.responsibleId !== responsible.id) {
    throw badRequest('Responsável inativo.', {
      responsibleId: 'Este responsável está inativo e não pode ser selecionado.',
    });
  }

  return { plant, institution, responsible };
}

/**
 * Resolve os tecnicos do atendimento.
 *
 * Cada tecnico e um cadastro vinculado OU um nome digitado. Quando ha vinculo,
 * o nome vem do cadastro (o cliente nunca dita o nome de um tecnico vinculado);
 * quando e digitado, passa pela mesma padronizacao de texto dos demais campos.
 */
async function resolveTechnicians(
  tx: Client,
  technicians: TechnicianInput[],
): Promise<Array<{ position: number; name: string; responsibleId: string | null }>> {
  const linkedIds = [...new Set(technicians.map((item) => item.responsibleId).filter(Boolean))];
  const rows = linkedIds.length
    ? await tx.responsible.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row.name]));

  return technicians.map((technician, index) => {
    const position = index + 1;
    if (technician.responsibleId) {
      const name = byId.get(technician.responsibleId);
      if (!name) {
        throw badRequest('Técnico inválido.', {
          [`technicians.${index}.responsibleId`]: 'Selecione um técnico válido.',
        });
      }
      return { position, name, responsibleId: technician.responsibleId };
    }
    return { position, name: normalizeText(technician.name), responsibleId: null };
  });
}

/** Texto legivel dos tecnicos, usado no historico, na tela e no documento. */
export function formatTechnicians(technicians: Array<{ name: string }>): string {
  return technicians.map((technician) => technician.name).join(' · ');
}

/** Converte a entrada validada em custos recalculados no servidor. */
function computeCosts(input: CreateOsInput | UpdateOsInput, rates: Rates) {
  try {
    return calculateCosts({
      technicianCount: input.technicianCount,
      hoursPerTechnicianCenti: input.hoursPerTechnician,
      outboundKmCenti: input.outboundKm,
      returnKmCenti: input.returnKm,
      technicalHourlyRateCents: rates.technicalHourlyRateCents,
      kmRateCents: rates.kmRateCents,
    });
  } catch (error) {
    if (error instanceof CostValidationError) {
      throw badRequest(error.message, { [error.field]: error.message });
    }
    throw error;
  }
}

export async function createServiceOrder(
  input: CreateOsInput,
  actor: SessionUser,
): Promise<ServiceOrderDetail> {
  const rates = await getRates();
  const costs = computeCosts(input, rates);

  const title = normalizeText(input.title);
  const location = normalizeText(input.location);
  const description = normalizeDescription(input.description);

  // Validacao das referencias ANTES de abrir a transacao: sao leituras puras que
  // nao precisam do mesmo snapshot da insercao. Manter a transacao curta importa
  // porque ela segura uma conexao do pool e o lock da linha de OrderSequence
  // enquanto durar - sob rajada de aberturas simultaneas, isso e o gargalo.
  // A integridade referencial continua garantida pelas foreign keys.
  await resolveReferences(prisma, input);
  const technicians = await resolveTechnicians(prisma, input.technicians);

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { number } = await reserveOsNumber(tx);

        const created = await tx.serviceOrder.create({
          data: {
            number,
            title,
            location,
            description,
            plantId: input.plantId,
            institutionId: input.institutionId,
            responsibleId: input.responsibleId,
            expectedDate: input.expectedDate,
            status: 'ABERTA',
            technicianCount: costs.technicianCount,
            hoursPerTechnicianCenti: costs.hoursPerTechnicianCenti,
            outboundKmCenti: costs.outboundKmCenti,
            returnKmCenti: costs.returnKmCenti,
            technicalHourlyRateCents: costs.technicalHourlyRateCents,
            kmRateCents: costs.kmRateCents,
            technicalSubtotalCents: costs.technicalSubtotalCents,
            travelSubtotalCents: costs.travelSubtotalCents,
            totalCents: costs.totalCents,
            createdById: actor.id,
            updatedById: actor.id,
            technicians: { create: technicians },
          },
          select: detailSelect,
        });

        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: created.id,
            type: 'CRIADA',
            message: 'OS ' + number + ' criada com status ' + STATUS_LABEL.ABERTA + '.',
            userId: actor.id,
          },
        });

        return created;
      }, TX_OPTIONS);
    } catch (error) {
      // Colisao na constraint UNIQUE do numero: outra transacao venceu a corrida.
      if (isUniqueViolation(error, 'number') && attempt < MAX_NUMBER_ATTEMPTS) continue;
      throw error;
    }
  }

  throw conflict('Não foi possível gerar um número único para a OS. Tente novamente.');
}

const COST_FIELDS = ['technicianCount', 'hoursPerTechnician', 'outboundKm', 'returnKm', 'total'];
const INFO_FIELDS = ['title', 'location', 'description', 'plant', 'institution', 'technicians'];

function diffFields(
  before: ServiceOrderDetail,
  after: {
    title: string;
    location: string;
    description: string;
    expectedDate: Date;
    plantName: string;
    institutionName: string;
    responsibleName: string;
    technicians: string;
  },
  costs: ReturnType<typeof computeCosts>,
): { changes: FieldChange[]; types: Set<string> } {
  const changes: FieldChange[] = [];
  const types = new Set<string>();

  const push = (field: string, label: string, from: string, to: string, type: string) => {
    if (from !== to) {
      changes.push({ field, label, from, to });
      types.add(type);
    }
  };

  push('title', 'Título', before.title, after.title, 'INFORMACOES_EDITADAS');
  push('location', 'Local de atendimento', before.location, after.location, 'INFORMACOES_EDITADAS');
  push('description', 'Descricao', before.description, after.description, 'INFORMACOES_EDITADAS');
  push('plant', 'Usina', before.plant.name, after.plantName, 'INFORMACOES_EDITADAS');
  push(
    'institution',
    'Cliente/Instituição',
    before.institution.name,
    after.institutionName,
    'INFORMACOES_EDITADAS',
  );
  push(
    'technicians',
    'Técnicos',
    formatTechnicians(before.technicians),
    after.technicians,
    'INFORMACOES_EDITADAS',
  );
  push(
    'responsible',
    'Responsável',
    before.responsible.name,
    after.responsibleName,
    'RESPONSAVEL_ALTERADO',
  );
  push(
    'expectedDate',
    'Previsão de execução',
    formatDateOnlyBR(before.expectedDate),
    formatDateOnlyBR(after.expectedDate),
    'PREVISAO_ALTERADA',
  );
  push(
    'technicianCount',
    'Quantidade de técnicos',
    String(before.technicianCount),
    String(costs.technicianCount),
    'CUSTOS_ALTERADOS',
  );
  push(
    'hoursPerTechnician',
    'Horas por técnico',
    formatCenti(before.hoursPerTechnicianCenti),
    formatCenti(costs.hoursPerTechnicianCenti),
    'CUSTOS_ALTERADOS',
  );
  push(
    'outboundKm',
    'Km de ida',
    formatCenti(before.outboundKmCenti),
    formatCenti(costs.outboundKmCenti),
    'CUSTOS_ALTERADOS',
  );
  push(
    'returnKm',
    'Km de volta',
    formatCenti(before.returnKmCenti),
    formatCenti(costs.returnKmCenti),
    'CUSTOS_ALTERADOS',
  );
  push(
    'total',
    'Valor do atendimento',
    formatBRL(before.totalCents),
    formatBRL(costs.totalCents),
    'CUSTOS_ALTERADOS',
  );

  return { changes, types };
}

export async function updateServiceOrder(
  id: string,
  input: UpdateOsInput,
  actor: SessionUser,
): Promise<ServiceOrderDetail> {
  const rates = await getRates();
  const costs = computeCosts(input, rates);

  const title = normalizeText(input.title);
  const location = normalizeText(input.location);
  const description = normalizeDescription(input.description);

  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceOrder.findUnique({ where: { id }, select: detailSelect });
    if (!before) throw notFound('Ordem de Serviço não encontrada.');

    if (before.status === 'CANCELADA' && !isAdmin(actor.role)) {
      throw forbidden('OS cancelada. Somente um administrador pode alterá-la.');
    }

    const refs = await resolveReferences(tx, input, {
      plantId: before.plant.id,
      institutionId: before.institution.id,
      responsibleId: before.responsible.id,
    });
    const technicians = await resolveTechnicians(tx, input.technicians);

    const { changes, types } = diffFields(
      before,
      {
        title,
        location,
        description,
        expectedDate: input.expectedDate,
        plantName: refs.plant.name,
        institutionName: refs.institution.name,
        responsibleName: refs.responsible.name,
        technicians: formatTechnicians(technicians),
      },
      costs,
    );

    if (changes.length === 0) return before;

    const updated = await tx.serviceOrder.update({
      where: { id },
      data: {
        title,
        location,
        description,
        plantId: input.plantId,
        institutionId: input.institutionId,
        responsibleId: input.responsibleId,
        expectedDate: input.expectedDate,
        technicianCount: costs.technicianCount,
        hoursPerTechnicianCenti: costs.hoursPerTechnicianCenti,
        outboundKmCenti: costs.outboundKmCenti,
        returnKmCenti: costs.returnKmCenti,
        technicalHourlyRateCents: costs.technicalHourlyRateCents,
        kmRateCents: costs.kmRateCents,
        technicalSubtotalCents: costs.technicalSubtotalCents,
        travelSubtotalCents: costs.travelSubtotalCents,
        totalCents: costs.totalCents,
        updatedById: actor.id,
        // A lista de tecnicos e substituida por inteiro: as posicoes precisam
        // continuar sequenciais quando a quantidade muda.
        technicians: { deleteMany: {}, create: technicians },
      },
      select: detailSelect,
    });

    // Um evento por natureza de alteracao, com o detalhamento dos campos.
    const ordered = [
      'RESPONSAVEL_ALTERADO',
      'PREVISAO_ALTERADA',
      'CUSTOS_ALTERADOS',
      'INFORMACOES_EDITADAS',
    ];
    for (const type of ordered.filter((candidate) => types.has(candidate))) {
      const scoped = changes.filter((change) => {
        if (type === 'RESPONSAVEL_ALTERADO') return change.field === 'responsible';
        if (type === 'PREVISAO_ALTERADA') return change.field === 'expectedDate';
        if (type === 'CUSTOS_ALTERADOS') return COST_FIELDS.includes(change.field);
        return INFO_FIELDS.includes(change.field);
      });
      if (scoped.length === 0) continue;
      await tx.serviceOrderEvent.create({
        data: {
          serviceOrderId: id,
          type,
          message: scoped.map((change) => change.label).join(', '),
          details: serializeChanges(scoped),
          userId: actor.id,
        },
      });
    }

    return updated;
  }, TX_OPTIONS);
}

/**
 * Resolve o motivo de cancelamento informado.
 *
 * O motivo e obrigatorio ao cancelar e vem de um cadastro (nunca texto livre),
 * o que mantem os relatorios comparaveis. Motivos inativos continuam validos
 * para registros que ja os usavam - a checagem de "ativo" vale para o motivo
 * novo, nao para o historico.
 */
export async function resolveCancellationReason(
  tx: Client,
  reasonId: string | undefined,
  currentReasonId: string | null,
): Promise<{ id: string; label: string }> {
  if (!reasonId) {
    throw badRequest('Informe o motivo do cancelamento.', {
      cancellationReasonId: 'Selecione o motivo do cancelamento.',
    });
  }
  const reason = await tx.cancellationReason.findUnique({
    where: { id: reasonId },
    select: { id: true, label: true, active: true },
  });
  if (!reason) {
    throw badRequest('Motivo de cancelamento inválido.', {
      cancellationReasonId: 'Selecione um motivo válido.',
    });
  }
  if (!reason.active && currentReasonId !== reason.id) {
    throw badRequest('Motivo de cancelamento inativo.', {
      cancellationReasonId: 'Este motivo está inativo e não pode ser selecionado.',
    });
  }
  return { id: reason.id, label: reason.label };
}

/** Justificativa escrita exigida para retroceder um registro encerrado. */
export function normalizeReopenReason(reason: string | undefined): string {
  const text = (reason ?? '').trim();
  if (text.length < MIN_REOPEN_REASON_LENGTH) {
    throw badRequest('Informe o motivo para reabrir o registro.', {
      reason: `Descreva o motivo com pelo menos ${MIN_REOPEN_REASON_LENGTH} caracteres.`,
    });
  }
  return text;
}

/**
 * Movimenta o status da OS.
 *
 * Tres regras de negocio, todas validadas aqui (o frontend apenas as reflete):
 *
 * - cancelar exige um motivo cadastrado;
 * - retroceder uma OS Concluida/Cancelada e exclusivo de administrador...
 * - ...e exige uma justificativa escrita, que fica no historico.
 */
export async function changeServiceOrderStatus(
  id: string,
  nextStatus: string,
  actor: SessionUser,
  options: Omit<ChangeStatusInput, 'status'> = {},
): Promise<ServiceOrderDetail> {
  if (!isOsStatus(nextStatus)) throw badRequest('Status inválido.', { status: 'Status inválido.' });

  return prisma.$transaction(async (tx) => {
    const current = await tx.serviceOrder.findUnique({
      where: { id },
      select: { id: true, status: true, cancellationReasonId: true },
    });
    if (!current) throw notFound('Ordem de Serviço não encontrada.');

    const from = current.status as OsStatus;
    if (from === nextStatus) {
      return tx.serviceOrder.findUniqueOrThrow({ where: { id }, select: detailSelect });
    }
    if (!canTransition(from, nextStatus)) {
      throw badRequest(
        'Não é possível mover de "' + STATUS_LABEL[from] + '" para "' + STATUS_LABEL[nextStatus] + '".',
      );
    }
    if (requiresAdminToTransition(from) && !isAdmin(actor.role)) {
      throw forbidden(
        'OS ' +
          STATUS_LABEL[from].toLocaleLowerCase('pt-BR') +
          '. Somente um administrador pode retrocedê-la.',
      );
    }

    const cancellation = requiresCancellationReason(nextStatus)
      ? await resolveCancellationReason(tx, options.cancellationReasonId, current.cancellationReasonId)
      : null;
    const reopenReason = requiresReopenReason(from) ? normalizeReopenReason(options.reason) : null;

    const updated = await tx.serviceOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        updatedById: actor.id,
        // O motivo acompanha o cancelamento: ao sair de Cancelada ele deixa de
        // valer e e limpo, mas continua registrado no historico.
        cancellationReasonId: cancellation ? cancellation.id : null,
      },
      select: detailSelect,
    });

    const changes: FieldChange[] = [
      { field: 'status', label: 'Status', from: STATUS_LABEL[from], to: STATUS_LABEL[nextStatus] },
    ];
    if (cancellation) {
      changes.push({
        field: 'cancellationReason',
        label: 'Motivo do cancelamento',
        from: '',
        to: cancellation.label,
      });
    }
    if (reopenReason) {
      changes.push({ field: 'reason', label: 'Motivo da reabertura', from: '', to: reopenReason });
    }

    await tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: id,
        type: 'STATUS_ALTERADO',
        message: STATUS_LABEL[from] + ' -> ' + STATUS_LABEL[nextStatus],
        details: serializeChanges(changes),
        userId: actor.id,
      },
    });

    return updated;
  }, TX_OPTIONS);
}

/**
 * Exclui uma OS definitivamente, com o historico dela.
 *
 * E a unica operacao destrutiva do sistema, existe para limpar OS abertas por
 * engano ou em teste, e por isso e restrita a administradores (verificado na
 * rota, com `requireAdmin`). Os eventos saem junto por cascade declarado no
 * schema; nenhum outro registro aponta para ServiceOrder.
 *
 * O contador diario de OrderSequence NAO retrocede: o numero da OS excluida fica
 * vago para sempre, nunca e reaproveitado. Reutiliza-lo faria dois documentos
 * diferentes circularem com a mesma identificacao.
 */
export async function deleteServiceOrder(
  id: string,
  actor: SessionUser,
): Promise<{ id: string; number: string }> {
  if (!isAdmin(actor.role)) {
    throw forbidden('Somente um administrador pode excluir uma Ordem de Serviço.');
  }

  const existing = await prisma.serviceOrder.findUnique({
    where: { id },
    select: { id: true, number: true },
  });
  if (!existing) throw notFound('Ordem de Serviço não encontrada.');

  await prisma.serviceOrder.delete({ where: { id } });
  return existing;
}

export async function recordDocumentGenerated(
  serviceOrderId: string,
  fileName: string,
  actor: SessionUser,
): Promise<void> {
  await prisma.serviceOrderEvent.create({
    data: {
      serviceOrderId,
      type: 'DOCUMENTO_GERADO',
      message: 'Documento gerado: ' + fileName,
      userId: actor.id,
    },
  });
}

export async function getServiceOrderDetail(id: string): Promise<ServiceOrderDetail | null> {
  return prisma.serviceOrder.findUnique({ where: { id }, select: detailSelect });
}

export async function getServiceOrderEvents(serviceOrderId: string) {
  return prisma.serviceOrderEvent.findMany({
    where: { serviceOrderId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      message: true,
      details: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  });
}

function dayBound(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return endOfDay
    ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999))
    : new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0));
}

/** Monta o WHERE das listagens a partir dos filtros de busca. */
export function buildOsWhere(filters: OsFilters): Prisma.ServiceOrderWhereInput {
  const and: Prisma.ServiceOrderWhereInput[] = [];

  if (filters.q) {
    const term = filters.q;
    // No PostgreSQL o LIKE e sensivel a maiusculas/minusculas; `insensitive`
    // (ILIKE) preserva o comportamento de busca esperado pelo operador.
    const like = { contains: term, mode: 'insensitive' } as const;
    and.push({
      OR: [
        // O numero da OS e composto so por digitos: nao precisa de ILIKE.
        { number: { contains: term } },
        { title: like },
        { location: like },
        { institution: { name: like } },
        { responsible: { name: like } },
        { plant: { name: like } },
      ],
    });
  }
  if (filters.status) and.push({ status: filters.status });
  if (filters.institutionId) and.push({ institutionId: filters.institutionId });
  if (filters.responsibleId) and.push({ responsibleId: filters.responsibleId });
  if (filters.plantId) and.push({ plantId: filters.plantId });

  const openedFrom = dayBound(filters.openedFrom, false);
  const openedTo = dayBound(filters.openedTo, true);
  if (openedFrom || openedTo) {
    and.push({
      openedAt: { ...(openedFrom ? { gte: openedFrom } : {}), ...(openedTo ? { lte: openedTo } : {}) },
    });
  }

  const expectedFrom = dayBound(filters.expectedFrom, false);
  const expectedTo = dayBound(filters.expectedTo, true);
  if (expectedFrom || expectedTo) {
    and.push({
      expectedDate: {
        ...(expectedFrom ? { gte: expectedFrom } : {}),
        ...(expectedTo ? { lte: expectedTo } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function listServiceOrders(filters: OsFilters) {
  const where = buildOsWhere(filters);
  const [items, total, sums] = await prisma.$transaction([
    prisma.serviceOrder.findMany({
      where,
      select: listSelect,
      orderBy: [{ openedAt: 'desc' }, { number: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.serviceOrder.count({ where }),
    // Somatorio de TODAS as OS do filtro, nao apenas da pagina exibida: e o
    // numero que interessa para fechar um periodo. O banco soma, nao a aplicacao.
    prisma.serviceOrder.aggregate({
      where,
      _sum: {
        totalCents: true,
        technicalSubtotalCents: true,
        travelSubtotalCents: true,
        technicianCount: true,
      },
    }),
  ]);

  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    sums: {
      totalCents: sums._sum.totalCents ?? 0,
      technicalSubtotalCents: sums._sum.technicalSubtotalCents ?? 0,
      travelSubtotalCents: sums._sum.travelSubtotalCents ?? 0,
      technicianCount: sums._sum.technicianCount ?? 0,
    },
  };
}
