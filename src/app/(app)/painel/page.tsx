import Link from 'next/link';
import type { Metadata } from 'next';
import { loadKanban, KANBAN_LIMIT } from '@/lib/os/service';
import { loadFilterOptions } from '@/lib/os/options';
import { osFiltersSchema } from '@/lib/validation/os';
import { formatDateOnlyBR, isOverdue } from '@/lib/datetime';
import { isTerminal, OS_STATUSES, STATUS_LABEL, type OsStatus } from '@/lib/os/status';
import { KanbanBoard, type KanbanCard } from '@/components/kanban-board';
import { OsFilters } from '@/components/os-filters';

export const metadata: Metadata = { title: 'Painel' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Indicadores exibidos acima do quadro. */
const KPIS: OsStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDA'];

const KPI_STYLE: Record<string, string> = {
  ABERTA: 'border-l-blue-500',
  EM_ANDAMENTO: 'border-l-amber-500',
  AGUARDANDO: 'border-l-violet-500',
  CONCLUIDA: 'border-l-emerald-500',
};

export default async function PainelPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = osFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : osFiltersSchema.parse({});

  const [{ items, totals }, options] = await Promise.all([loadKanban(filters), loadFilterOptions()]);

  const cards: KanbanCard[] = items.map((order) => {
    const status = order.status as OsStatus;
    return {
      id: order.id,
      number: order.number,
      title: order.title,
      status,
      institution: order.institution.name,
      plant: order.plant.name,
      responsible: order.responsible.name,
      expectedDate: formatDateOnlyBR(order.expectedDate),
      // Atraso so faz sentido enquanto a OS nao esta encerrada.
      overdue: !isTerminal(status) && isOverdue(order.expectedDate),
    };
  });

  const total = OS_STATUSES.reduce((sum, status) => sum + (totals[status] ?? 0), 0);
  const overdueCount = cards.filter((card) => card.overdue).length;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Painel de Ordens de Serviço</h1>
          <p className="text-sm text-ink-500">
            {total === 0
              ? 'Nenhuma Ordem de Serviço registrada ainda.'
              : `${total} ${total === 1 ? 'Ordem de Serviço' : 'Ordens de Serviço'} no filtro atual.`}
          </p>
        </div>
        <Link href="/os/nova" className="btn-primary no-print">
          Abrir nova OS
        </Link>
      </header>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {KPIS.map((status) => (
          <div key={status} className={`card border-l-4 p-4 ${KPI_STYLE[status]}`}>
            <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
              {STATUS_LABEL[status]}
            </p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{totals[status] ?? 0}</p>
          </div>
        ))}
        <div className="card border-l-4 border-l-red-500 p-4">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Atrasadas</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{overdueCount}</p>
        </div>
      </section>

      <OsFilters options={options} variant="compact" />

      {total === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
          <h2 className="text-base font-semibold text-ink-900">Comece abrindo a primeira OS</h2>
          <p className="max-w-md text-sm text-ink-500">
            Cadastre usinas e responsáveis na área administrativa e abra a primeira Ordem de
            Serviço. Ela receberá automaticamente o número do dia.
          </p>
          <Link href="/os/nova" className="btn-primary mt-2">
            Abrir nova OS
          </Link>
        </div>
      ) : (
        <KanbanBoard cards={cards} totals={totals} truncated={items.length >= KANBAN_LIMIT} />
      )}
    </div>
  );
}
