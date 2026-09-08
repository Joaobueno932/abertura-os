import Link from 'next/link';
import type { Metadata } from 'next';
import { loadBoard } from '@/lib/board';
import { loadFilterOptions } from '@/lib/os/options';
import { loadCancellationReasons } from '@/lib/os/cancellation';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { osFiltersSchema } from '@/lib/validation/os';
import { OS_STATUSES, STATUS_LABEL, type OsStatus } from '@/lib/os/status';
import { KanbanBoard } from '@/components/kanban-board';
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

  const [board, options, reasons, user] = await Promise.all([
    loadBoard(filters),
    loadFilterOptions(),
    loadCancellationReasons(),
    getSessionUser(),
  ]);

  const total = OS_STATUSES.reduce((sum, status) => sum + (board.totals[status] ?? 0), 0);
  const overdueCount = board.cards.filter((card) => card.overdue).length;
  const admin = isAdmin(user?.role ?? 'USER');

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Painel de acompanhamento</h1>
          <p className="text-sm text-ink-500">
            {total === 0
              ? 'Nenhum registro no filtro atual.'
              : `${board.byKind.OS} ${board.byKind.OS === 1 ? 'Ordem de Serviço' : 'Ordens de Serviço'} · ` +
                `${board.byKind.CHAMADO} ${
                  board.byKind.CHAMADO === 1 ? 'chamado' : 'chamados'
                } da concessionária.`}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/os/nova" className="btn-primary">
            Abrir nova OS
          </Link>
          <Link href="/chamados/novo" className="btn-secondary">
            Abrir chamado da concessionária
          </Link>
        </div>
      </header>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {KPIS.map((status) => (
          <div key={status} className={`card border-l-4 p-4 ${KPI_STYLE[status]}`}>
            <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
              {STATUS_LABEL[status]}
            </p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{board.totals[status] ?? 0}</p>
          </div>
        ))}
        <div className="card border-l-4 border-l-red-500 p-4">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Atrasados</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{overdueCount}</p>
        </div>
      </section>

      <OsFilters options={options} variant="compact" showKind />

      {total === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
          <h2 className="text-base font-semibold text-ink-900">Nada para acompanhar por aqui</h2>
          <p className="max-w-md text-sm text-ink-500">
            Abra uma Ordem de Serviço ou registre um chamado da concessionária. Os dois aparecem
            neste quadro, com o chamado destacado em azul claro.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/os/nova" className="btn-primary">
              Abrir nova OS
            </Link>
            <Link href="/chamados/novo" className="btn-secondary">
              Abrir chamado
            </Link>
          </div>
        </div>
      ) : (
        <KanbanBoard
          cards={board.cards}
          totals={board.totals}
          truncated={board.truncated}
          isAdmin={admin}
          reasons={reasons}
        />
      )}
    </div>
  );
}
