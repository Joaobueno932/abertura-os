import type { Prisma } from '@prisma/client';
import { prisma, isUniqueViolation, TX_OPTIONS } from '@/lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '@/lib/http';
import { normalizeDescription, normalizeText } from '@/lib/text';
import { formatDateTimeBR } from '@/lib/datetime';
import { formatCenti } from '@/lib/money';
import {
  canTransition,
  isOsStatus,
  requiresAdminToTransition,
  requiresCancellationReason,
  requiresReopenReason,
  STATUS_LABEL,
  type OsStatus,
} from '@/lib/os/status';
import { serializeChanges, type FieldChange } from '@/lib/os/history';
import { normalizeReopenReason, resolveCancellationReason } from '@/lib/os/service';
import { reserveTicketNumber } from './numbering';
import type { ChangeStatusInput, OsFilters } from '@/lib/validation/os';
import type { CreateTicketInput, UpdateTicketInput } from '@/lib/validation/ticket';
import type { SessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';

/**
 * Chamados abertos junto a CONCESSIONARIA de energia.
 *
 * Seguem o mesmo fluxo de status das OS e aparecem no mesmo quadro, mas sao
 * outra entidade: nao tem custo, nao geram documento oficial e o prazo vem da
 * previsao em horas informada pela concessionaria, nao de uma data escolhida.
 */

const MAX_NUMBER_ATTEMPTS = 5;

const listSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  openedAt: true,
  dueAt: true,
  expectedHoursCenti: true,
  protocol: true,
  plant: { select: { id: true, name: true } },
  institution: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
} satisfies Prisma.UtilityTicketSelect;

const detailSelect = {
  ...listSelect,
  description: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  cancellationReason: { select: { id: true, label: true } },
} satisfies Prisma.UtilityTicketSelect;

export type UtilityTicketListItem = Prisma.UtilityTicketGetPayload<{ select: typeof listSelect }>;
export type UtilityTicketDetail = Prisma.UtilityTicketGetPayload<{ select: typeof detailSelect }>;

type Client = Prisma.TransactionClient | typeof prisma;

/** 1 centesimo de hora = 36 segundos. */
const MS_PER_CENTI_HOUR = 36_000;

/** Prazo de solucao = abertura + previsao em horas informada pela concessionaria. */
export function computeDueAt(openedAt: Date, expectedHoursCenti: number): Date {
  return new Date(openedAt.getTime() + expectedHoursCenti * MS_PER_CENTI_HOUR);
}

/** O prazo estourou? Chamado encerrado nunca conta como atrasado. */
export function isTicketOverdue(
  ticket: { status: string; dueAt: Date },
  now: Date = new Date(),
): boolean {
  if (ticket.status === 'CONCLUIDA' || ticket.status === 'CANCELADA') return false;
  return ticket.dueAt.getTime() < now.getTime();
}

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

export async function createUtilityTicket(
  input: CreateTicketInput,
  actor: SessionUser,
): Promise<UtilityTicketDetail> {
  const title = normalizeText(input.title);
  const protocol = input.protocol.trim();
  const description = normalizeDescription(input.description);

  // Leituras puras ficam fora da transacao: ela segura uma conexao do pool e o
  // lock da linha de TicketSequence enquanto durar.
  await resolveReferences(prisma, input);

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { number } = await reserveTicketNumber(tx);
        const openedAt = new Date();

        const created = await tx.utilityTicket.create({
          data: {
            number,
            title,
            protocol,
            description,
            plantId: input.plantId,
            institutionId: input.institutionId,
            responsibleId: input.responsibleId,
            expectedHoursCenti: input.expectedHours,
            openedAt,
            dueAt: computeDueAt(openedAt, input.expectedHours),
            status: 'ABERTA',
            createdById: actor.id,
            updatedById: actor.id,
          },
          select: detailSelect,
        });

        await tx.utilityTicketEvent.create({
          data: {
            utilityTicketId: created.id,
            type: 'CRIADO',
            message: 'Chamado ' + number + ' aberto com status ' + STATUS_LABEL.ABERTA + '.',
            userId: actor.id,
          },
        });

        return created;
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueViolation(error, 'number') && attempt < MAX_NUMBER_ATTEMPTS) continue;
      throw error;
    }
  }

  throw conflict('Não foi possível gerar um número único para o chamado. Tente novamente.');
}

const INFO_FIELDS = ['title', 'protocol', 'description', 'plant', 'institution'];

export async function updateUtilityTicket(
  id: string,
  input: UpdateTicketInput,
  actor: SessionUser,
): Promise<UtilityTicketDetail> {
  const title = normalizeText(input.title);
  const protocol = input.protocol.trim();
  const description = normalizeDescription(input.description);

  return prisma.$transaction(async (tx) => {
    const before = await tx.utilityTicket.findUnique({ where: { id }, select: detailSelect });
    if (!before) throw notFound('Chamado não encontrado.');

    if (before.status === 'CANCELADA' && !isAdmin(actor.role)) {
      throw forbidden('Chamado cancelado. Somente um administrador pode alterá-lo.');
    }

    const refs = await resolveReferences(tx, input, {
      plantId: before.plant.id,
      institutionId: before.institution.id,
      responsibleId: before.responsible.id,
    });

    const dueAt = computeDueAt(before.openedAt, input.expectedHours);
    const changes: FieldChange[] = [];
    const types = new Set<string>();
    const push = (field: string, label: string, from: string, to: string, type: string) => {
      if (from !== to) {
        changes.push({ field, label, from, to });
        types.add(type);
      }
    };

    push('title', 'Título', before.title, title, 'INFORMACOES_EDITADAS');
    push('protocol', 'Protocolo', before.protocol, protocol, 'INFORMACOES_EDITADAS');
    push('description', 'Descrição', before.description, description, 'INFORMACOES_EDITADAS');
    push('plant', 'Usina', before.plant.name, refs.plant.name, 'INFORMACOES_EDITADAS');
    push(
      'institution',
      'Cliente/Instituição',
      before.institution.name,
      refs.institution.name,
      'INFORMACOES_EDITADAS',
    );
    push(
      'responsible',
      'Responsável',
      before.responsible.name,
      refs.responsible.name,
      'RESPONSAVEL_ALTERADO',
    );
    push(
      'expectedHours',
      'Previsão de solução (h)',
      formatCenti(before.expectedHoursCenti),
      formatCenti(input.expectedHours),
      'PREVISAO_ALTERADA',
    );
    if (before.expectedHoursCenti !== input.expectedHours) {
      changes.push({
        field: 'dueAt',
        label: 'Prazo de solução',
        from: formatDateTimeBR(before.dueAt),
        to: formatDateTimeBR(dueAt),
      });
    }

    if (changes.length === 0) return before;

    const updated = await tx.utilityTicket.update({
      where: { id },
      data: {
        title,
        protocol,
        description,
        plantId: input.plantId,
        institutionId: input.institutionId,
        responsibleId: input.responsibleId,
        expectedHoursCenti: input.expectedHours,
        dueAt,
        updatedById: actor.id,
      },
      select: detailSelect,
    });

    const ordered = ['RESPONSAVEL_ALTERADO', 'PREVISAO_ALTERADA', 'INFORMACOES_EDITADAS'];
    for (const type of ordered.filter((candidate) => types.has(candidate))) {
      const scoped = changes.filter((change) => {
        if (type === 'RESPONSAVEL_ALTERADO') return change.field === 'responsible';
        if (type === 'PREVISAO_ALTERADA') {
          return change.field === 'expectedHours' || change.field === 'dueAt';
        }
        return INFO_FIELDS.includes(change.field);
      });
      if (scoped.length === 0) continue;
      await tx.utilityTicketEvent.create({
        data: {
          utilityTicketId: id,
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
 * Mesmas regras de status das OS: motivo cadastrado ao cancelar, e perfil de
 * administrador mais justificativa escrita para retroceder um chamado encerrado.
 */
export async function changeUtilityTicketStatus(
  id: string,
  nextStatus: string,
  actor: SessionUser,
  options: Omit<ChangeStatusInput, 'status'> = {},
): Promise<UtilityTicketDetail> {
  if (!isOsStatus(nextStatus)) throw badRequest('Status inválido.', { status: 'Status inválido.' });

  return prisma.$transaction(async (tx) => {
    const current = await tx.utilityTicket.findUnique({
      where: { id },
      select: { id: true, status: true, cancellationReasonId: true },
    });
    if (!current) throw notFound('Chamado não encontrado.');

    const from = current.status as OsStatus;
    if (from === nextStatus) {
      return tx.utilityTicket.findUniqueOrThrow({ where: { id }, select: detailSelect });
    }
    if (!canTransition(from, nextStatus)) {
      throw badRequest(
        'Não é possível mover de "' +
          STATUS_LABEL[from] +
          '" para "' +
          STATUS_LABEL[nextStatus] +
          '".',
      );
    }
    if (requiresAdminToTransition(from) && !isAdmin(actor.role)) {
      throw forbidden(
        'Chamado ' +
          STATUS_LABEL[from].toLocaleLowerCase('pt-BR') +
          '. Somente um administrador pode retrocedê-lo.',
      );
    }

    const cancellation = requiresCancellationReason(nextStatus)
      ? await resolveCancellationReason(
          tx,
          options.cancellationReasonId,
          current.cancellationReasonId,
        )
      : null;
    const reopenReason = requiresReopenReason(from) ? normalizeReopenReason(options.reason) : null;

    const updated = await tx.utilityTicket.update({
      where: { id },
      data: {
        status: nextStatus,
        updatedById: actor.id,
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

    await tx.utilityTicketEvent.create({
      data: {
        utilityTicketId: id,
        type: 'STATUS_ALTERADO',
        message: STATUS_LABEL[from] + ' -> ' + STATUS_LABEL[nextStatus],
        details: serializeChanges(changes),
        userId: actor.id,
      },
    });

    return updated;
  }, TX_OPTIONS);
}

/** Exclusao definitiva do chamado e do historico dele. Restrita a administradores. */
export async function deleteUtilityTicket(
  id: string,
  actor: SessionUser,
): Promise<{ id: string; number: string }> {
  if (!isAdmin(actor.role)) {
    throw forbidden('Somente um administrador pode excluir um chamado.');
  }
  const existing = await prisma.utilityTicket.findUnique({
    where: { id },
    select: { id: true, number: true },
  });
  if (!existing) throw notFound('Chamado não encontrado.');

  await prisma.utilityTicket.delete({ where: { id } });
  return existing;
}

export async function getUtilityTicketDetail(id: string): Promise<UtilityTicketDetail | null> {
  return prisma.utilityTicket.findUnique({ where: { id }, select: detailSelect });
}

export async function getUtilityTicketEvents(utilityTicketId: string) {
  return prisma.utilityTicketEvent.findMany({
    where: { utilityTicketId },
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

/**
 * WHERE das listagens de chamados. Reaproveita os filtros das OS: os campos de
 * "previsao" passam a valer para o prazo de solucao (dueAt).
 */
export function buildTicketWhere(filters: OsFilters): Prisma.UtilityTicketWhereInput {
  const and: Prisma.UtilityTicketWhereInput[] = [];

  if (filters.q) {
    const like = { contains: filters.q, mode: 'insensitive' } as const;
    and.push({
      OR: [
        { number: like },
        { protocol: like },
        { title: like },
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
      openedAt: {
        ...(openedFrom ? { gte: openedFrom } : {}),
        ...(openedTo ? { lte: openedTo } : {}),
      },
    });
  }

  const dueFrom = dayBound(filters.expectedFrom, false);
  const dueTo = dayBound(filters.expectedTo, true);
  if (dueFrom || dueTo) {
    and.push({ dueAt: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function listUtilityTickets(filters: OsFilters) {
  const where = buildTicketWhere(filters);
  const [items, total] = await prisma.$transaction([
    prisma.utilityTicket.findMany({
      where,
      select: listSelect,
      orderBy: [{ openedAt: 'desc' }, { number: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.utilityTicket.count({ where }),
  ]);

  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}
