import { prisma } from '@/lib/prisma';
import { buildOsWhere } from '@/lib/os/service';
import { buildTicketWhere, isTicketOverdue } from '@/lib/tickets/service';
import { isTerminal, type OsStatus } from '@/lib/os/status';
import { formatDateOnlyBR, formatDateTimeBR, isOverdue } from '@/lib/datetime';
import { formatCenti } from '@/lib/money';
import type { OsFilters, RecordKind } from '@/lib/validation/os';

/**
 * Quadro unico do painel: Ordens de Serviço e chamados da concessionaria lado a
 * lado, nas mesmas colunas de status.
 *
 * Sao duas tabelas distintas de proposito - um chamado nao tem custo, nao gera
 * documento e nao usa a numeracao das OS. O que elas compartilham e o fluxo de
 * status, e e so isso que o quadro precisa.
 */

/** Teto de cards carregados por tipo, para nao trazer a base inteira. */
export const KANBAN_LIMIT = 400;

export type BoardCard = {
  kind: RecordKind;
  id: string;
  number: string;
  title: string;
  status: OsStatus;
  institution: string;
  plant: string;
  responsible: string;
  /** OS: previsao de execucao. Chamado: prazo de solucao. */
  deadlineLabel: string;
  /** Rotulo do prazo, que muda de sentido entre os dois tipos. */
  deadlineTerm: string;
  /** Informacao propria do tipo (ex.: protocolo da concessionaria). */
  extra?: string;
  overdue: boolean;
  href: string;
};

export type Board = {
  cards: BoardCard[];
  /** Total por status, somando os tipos incluidos no filtro. */
  totals: Record<string, number>;
  /** Total por tipo, para os indicadores. */
  byKind: Record<RecordKind, number>;
  truncated: boolean;
};

function emptyTotals(): Record<string, number> {
  return {};
}

function addTotals(target: Record<string, number>, rows: Array<{ status: string; count: number }>) {
  for (const row of rows) target[row.status] = (target[row.status] ?? 0) + row.count;
}

/**
 * Carrega o quadro. `filters.tipo` decide o que entra: ausente traz os dois.
 * Cada tipo e consultado na sua propria tabela; a uniao acontece em memoria,
 * sobre listagens ja limitadas e projetadas.
 */
export async function loadBoard(filters: OsFilters, now: Date = new Date()): Promise<Board> {
  const wantsOs = filters.tipo !== 'CHAMADO';
  const wantsTickets = filters.tipo !== 'OS';

  const osWhere = buildOsWhere(filters);
  const ticketWhere = buildTicketWhere(filters);

  const [orders, orderCounts, tickets, ticketCounts] = await Promise.all([
    wantsOs
      ? prisma.serviceOrder.findMany({
          where: osWhere,
          orderBy: [{ expectedDate: 'asc' }, { number: 'asc' }],
          take: KANBAN_LIMIT,
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            expectedDate: true,
            plant: { select: { name: true } },
            institution: { select: { name: true } },
            responsible: { select: { name: true } },
          },
        })
      : [],
    wantsOs
      ? prisma.serviceOrder.groupBy({
          by: ['status'],
          where: osWhere,
          orderBy: { status: 'asc' },
          _count: { status: true },
        })
      : [],
    wantsTickets
      ? prisma.utilityTicket.findMany({
          where: ticketWhere,
          orderBy: [{ dueAt: 'asc' }, { number: 'asc' }],
          take: KANBAN_LIMIT,
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            dueAt: true,
            protocol: true,
            plant: { select: { name: true } },
            institution: { select: { name: true } },
            responsible: { select: { name: true } },
          },
        })
      : [],
    wantsTickets
      ? prisma.utilityTicket.groupBy({
          by: ['status'],
          where: ticketWhere,
          orderBy: { status: 'asc' },
          _count: { status: true },
        })
      : [],
  ]);

  const osCards: BoardCard[] = orders.map((order) => {
    const status = order.status as OsStatus;
    return {
      kind: 'OS',
      id: order.id,
      number: order.number,
      title: order.title,
      status,
      institution: order.institution.name,
      plant: order.plant.name,
      responsible: order.responsible.name,
      deadlineTerm: 'Previsão',
      deadlineLabel: formatDateOnlyBR(order.expectedDate),
      overdue: !isTerminal(status) && isOverdue(order.expectedDate, now),
      href: `/os/${order.id}`,
    };
  });

  const ticketCards: BoardCard[] = tickets.map((ticket) => ({
    kind: 'CHAMADO',
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    status: ticket.status as OsStatus,
    institution: ticket.institution.name,
    plant: ticket.plant.name,
    responsible: ticket.responsible.name,
    deadlineTerm: 'Prazo',
    deadlineLabel: formatDateTimeBR(ticket.dueAt),
    extra: `Protocolo ${ticket.protocol}`,
    overdue: isTicketOverdue(ticket, now),
    href: `/chamados/${ticket.id}`,
  }));

  const totals = emptyTotals();
  addTotals(
    totals,
    orderCounts.map((row) => ({ status: row.status, count: row._count.status })),
  );
  addTotals(
    totals,
    ticketCounts.map((row) => ({ status: row.status, count: row._count.status })),
  );

  return {
    cards: [...osCards, ...ticketCards],
    totals,
    byKind: {
      OS: orderCounts.reduce((sum, row) => sum + row._count.status, 0),
      CHAMADO: ticketCounts.reduce((sum, row) => sum + row._count.status, 0),
    },
    truncated: orders.length >= KANBAN_LIMIT || tickets.length >= KANBAN_LIMIT,
  };
}

/** Previsao em horas formatada para leitura ("3,5 h"). */
export function formatExpectedHours(expectedHoursCenti: number): string {
  return `${formatCenti(expectedHoursCenti)} h`;
}
