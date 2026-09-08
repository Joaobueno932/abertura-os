import Link from 'next/link';
import type { Metadata } from 'next';
import { listUtilityTickets, isTicketOverdue } from '@/lib/tickets/service';
import { loadFilterOptions } from '@/lib/os/options';
import { osFiltersSchema } from '@/lib/validation/os';
import { formatDateBR, formatDateTimeBR } from '@/lib/datetime';
import { formatCenti } from '@/lib/money';
import type { OsStatus } from '@/lib/os/status';
import { StatusBadge } from '@/components/status-badge';
import { OsFilters } from '@/components/os-filters';

export const metadata: Metadata = { title: 'Chamados da concessionária' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function buildPageHref(raw: Record<string, string | string[] | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'page') continue;
    const text = Array.isArray(value) ? value[0] : value;
    if (text) params.set(key, text);
  }
  params.set('page', String(page));
  return `/chamados?${params.toString()}`;
}

export default async function ChamadosPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = osFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : osFiltersSchema.parse({});

  const [result, options] = await Promise.all([listUtilityTickets(filters), loadFilterOptions()]);
  const { items, total, page, totalPages } = result;

  const pageHours = items.reduce((sum, ticket) => sum + ticket.expectedHoursCenti, 0);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Chamados da concessionária</h1>
          <p className="text-sm text-ink-500">
            {total === 0
              ? 'Nenhum registro encontrado.'
              : `${total} ${total === 1 ? 'registro' : 'registros'} · página ${page} de ${totalPages}`}
          </p>
        </div>
        <Link href="/chamados/novo" className="btn-primary no-print">
          Abrir chamado
        </Link>
      </header>

      <OsFilters options={options} />

      {items.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
          <h2 className="text-base font-semibold text-ink-900">Nenhum chamado encontrado</h2>
          <p className="max-w-md text-sm text-ink-500">
            Ajuste os filtros ou registre um chamado junto à concessionária.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">Lista de chamados da concessionária</caption>
              <thead>
                <tr className="border-b border-line bg-sky-50 text-left">
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Nº</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Título</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Protocolo</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Cliente/Instituição</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Usina</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Responsável</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Abertura</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">
                    Previsão (h)
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Prazo</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => {
                  const overdue = isTicketOverdue(ticket);
                  return (
                    <tr key={ticket.id} className="border-b border-line last:border-0 hover:bg-sky-50/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/chamados/${ticket.id}`}
                          className="font-mono text-xs font-bold text-sky-800 hover:underline"
                        >
                          {ticket.number}
                        </Link>
                      </td>
                      <td className="max-w-64 px-4 py-3">
                        <Link
                          href={`/chamados/${ticket.id}`}
                          className="font-medium text-ink-900 hover:underline"
                        >
                          {ticket.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-700">{ticket.protocol}</td>
                      <td className="px-4 py-3 text-ink-700">{ticket.institution.name}</td>
                      <td className="px-4 py-3 text-ink-700">{ticket.plant.name}</td>
                      <td className="px-4 py-3 text-ink-700">{ticket.responsible.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-700">
                        {formatDateBR(ticket.openedAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-ink-700">
                        {formatCenti(ticket.expectedHoursCenti)}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap ${
                          overdue ? 'font-semibold text-red-600' : 'text-ink-700'
                        }`}
                      >
                        {formatDateTimeBR(ticket.dueAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={ticket.status as OsStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-sky-50 text-ink-900">
                  <th scope="row" colSpan={7} className="px-4 py-3 text-left font-semibold">
                    Somatório desta página ({items.length}{' '}
                    {items.length === 1 ? 'registro' : 'registros'})
                  </th>
                  <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                    {formatCenti(pageHours)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {totalPages > 1 ? (
            <nav
              aria-label="Paginação"
              className="flex items-center justify-between gap-3 border-t border-line px-4 py-3"
            >
              {page > 1 ? (
                <Link href={buildPageHref(raw, page - 1)} className="btn-secondary">
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-ink-500">
                Página {page} de {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={buildPageHref(raw, page + 1)} className="btn-secondary">
                  Próxima
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}
