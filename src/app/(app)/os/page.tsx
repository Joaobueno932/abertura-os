import Link from 'next/link';
import type { Metadata } from 'next';
import { listServiceOrders } from '@/lib/os/service';
import { loadFilterOptions } from '@/lib/os/options';
import { osFiltersSchema } from '@/lib/validation/os';
import { formatDateOnlyBR, formatDateBR, isOverdue } from '@/lib/datetime';
import { formatBRL } from '@/lib/money';
import { isTerminal, type OsStatus } from '@/lib/os/status';
import { StatusBadge } from '@/components/status-badge';
import { OsFilters } from '@/components/os-filters';

export const metadata: Metadata = { title: 'Ordens de Serviço' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function buildPageHref(
  raw: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'page') continue;
    const text = Array.isArray(value) ? value[0] : value;
    if (text) params.set(key, text);
  }
  params.set('page', String(page));
  return `/os?${params.toString()}`;
}

export default async function OsListPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = osFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : osFiltersSchema.parse({});

  const [result, options] = await Promise.all([listServiceOrders(filters), loadFilterOptions()]);
  const { items, total, page, totalPages } = result;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Ordens de Serviço</h1>
          <p className="text-sm text-ink-500">
            {total === 0
              ? 'Nenhum registro encontrado.'
              : `${total} ${total === 1 ? 'registro' : 'registros'} · página ${page} de ${totalPages}`}
          </p>
        </div>
        <Link href="/os/nova" className="btn-primary no-print">
          Abrir nova OS
        </Link>
      </header>

      <OsFilters options={options} />

      {items.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
          <h2 className="text-base font-semibold text-ink-900">Nenhuma OS encontrada</h2>
          <p className="max-w-md text-sm text-ink-500">
            Ajuste os filtros ou abra uma nova Ordem de Serviço.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">Lista de Ordens de Serviço</caption>
              <thead>
                <tr className="border-b border-line bg-brand-50/60 text-left">
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Nº</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Título</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Instituição</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Usina</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Responsável</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Abertura</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Previsão</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">Total</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => {
                  const status = order.status as OsStatus;
                  const overdue = !isTerminal(status) && isOverdue(order.expectedDate);
                  return (
                    <tr key={order.id} className="border-b border-line last:border-0 hover:bg-brand-50/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/os/${order.id}`}
                          className="font-mono text-xs font-bold text-brand-600 hover:underline"
                        >
                          {order.number}
                        </Link>
                      </td>
                      <td className="max-w-64 px-4 py-3">
                        <Link href={`/os/${order.id}`} className="font-medium text-ink-900 hover:underline">
                          {order.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-700">{order.institution.name}</td>
                      <td className="px-4 py-3 text-ink-700">{order.plant.name}</td>
                      <td className="px-4 py-3 text-ink-700">{order.responsible.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-700">
                        {formatDateBR(order.openedAt)}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap ${
                          overdue ? 'font-semibold text-red-600' : 'text-ink-700'
                        }`}
                      >
                        {formatDateOnlyBR(order.expectedDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-ink-900">
                        {formatBRL(order.totalCents)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
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
