import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getServiceOrderDetail, getServiceOrderEvents } from '@/lib/os/service';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { formatDateOnlyBR, formatDateTimeBR, isOverdue } from '@/lib/datetime';
import { formatBRL, formatCenti } from '@/lib/money';
import { isTerminal, type OsStatus } from '@/lib/os/status';
import { EVENT_LABEL, parseChanges, type EventType } from '@/lib/os/history';
import { StatusBadge } from '@/components/status-badge';
import { RecordActions } from '@/components/record-actions';
import { loadCancellationReasons } from '@/lib/os/cancellation';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const order = await getServiceOrderDetail(id);
  return { title: order ? `OS ${order.number}` : 'Ordem de Serviço' };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="text-sm text-ink-900">{value || '—'}</dd>
    </div>
  );
}

export default async function OsDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const [order, user] = await Promise.all([getServiceOrderDetail(id), getSessionUser()]);
  if (!order || !user) notFound();

  const [events, reasons] = await Promise.all([
    getServiceOrderEvents(id),
    loadCancellationReasons(order.cancellationReason?.id),
  ]);
  const status = order.status as OsStatus;
  const overdue = !isTerminal(status) && isOverdue(order.expectedDate);
  const admin = isAdmin(user.role);
  const canEdit = status !== 'CANCELADA' || admin;

  const totalKmCenti = order.outboundKmCenti + order.returnKmCenti;

  return (
    <div className="grid gap-5">
      <nav aria-label="Trilha" className="no-print text-xs text-ink-500">
        <Link href="/painel" className="hover:underline">
          Painel
        </Link>{' '}
        /{' '}
        <Link href="/os" className="hover:underline">
          Ordens de Serviço
        </Link>{' '}
        / <span className="text-ink-700">Nº {order.number}</span>
      </nav>

      <header className="card flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="font-mono text-xs font-bold tracking-wide text-brand-600">
            Nº {order.number}
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink-900">{order.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Aberta em {formatDateTimeBR(order.openedAt)} por {order.createdBy.name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={status} />
          {overdue ? (
            <span className="badge bg-red-50 text-red-700 ring-red-200">Previsão atrasada</span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Identificação</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Número da OS" value={order.number} />
              <div>
                <dt className="field-label">Status</dt>
                <dd>
                  <StatusBadge status={status} />
                </dd>
              </div>
              <Field label="Data de abertura" value={formatDateOnlyBR(order.openedAt)} />
              {order.cancellationReason ? (
                <Field
                  label="Motivo do cancelamento"
                  value={order.cancellationReason.label}
                />
              ) : null}
            </dl>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Atendimento</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Título" value={order.title} />
              <Field label="Usina" value={order.plant.name} />
              <Field label="Cliente/Instituição" value={order.institution.name} />
              <Field label="Responsável pela OS" value={order.responsible.name} />
              <Field label="Previsão de execução" value={formatDateOnlyBR(order.expectedDate)} />
              <Field label="Local de atendimento" value={order.location} />
              <div className="sm:col-span-2">
                <dt className="field-label">
                  Técnicos do atendimento ({order.technicians.length})
                </dt>
                <dd className="text-sm text-ink-900">
                  {order.technicians.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="grid gap-0.5">
                      {order.technicians.map((technician) => (
                        <li key={technician.id}>
                          {technician.position}. {technician.name}
                          {technician.responsibleId ? (
                            <span className="ml-1 text-xs text-ink-500">(cadastro vinculado)</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Descrição</h2>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-900">
              {order.description}
            </p>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Valor do atendimento</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-line p-4">
                <h3 className="text-xs font-bold tracking-wide text-brand-600 uppercase">
                  Serviço técnico
                </h3>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-700">Quantidade de técnicos</dt>
                    <dd className="font-medium text-ink-900">{order.technicianCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-700">Horas por técnico</dt>
                    <dd className="font-medium text-ink-900">
                      {formatCenti(order.hoursPerTechnicianCenti)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-700">Valor da hora técnica</dt>
                    <dd className="font-medium text-ink-900">
                      {formatBRL(order.technicalHourlyRateCents)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 rounded bg-brand-50 px-3 py-2 text-xs text-accent-600 italic">
                  {order.technicianCount} × {formatBRL(order.technicalHourlyRateCents)} ×{' '}
                  {formatCenti(order.hoursPerTechnicianCenti)}
                </p>
                <p className="mt-2 flex justify-between text-sm font-bold text-ink-900">
                  <span>Subtotal</span>
                  <span>{formatBRL(order.technicalSubtotalCents)}</span>
                </p>
              </div>

              <div className="rounded-md border border-line p-4">
                <h3 className="text-xs font-bold tracking-wide text-brand-600 uppercase">
                  Deslocamento
                </h3>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-700">Quilometragem de ida</dt>
                    <dd className="font-medium text-ink-900">
                      {formatCenti(order.outboundKmCenti)} km
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-700">Quilometragem de volta</dt>
                    <dd className="font-medium text-ink-900">
                      {formatCenti(order.returnKmCenti)} km
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-700">Valor por quilômetro</dt>
                    <dd className="font-medium text-ink-900">{formatBRL(order.kmRateCents)}</dd>
                  </div>
                </dl>
                <p className="mt-3 rounded bg-brand-50 px-3 py-2 text-xs text-accent-600 italic">
                  {formatCenti(order.outboundKmCenti)} km ida + {formatCenti(order.returnKmCenti)} km
                  volta = {formatCenti(totalKmCenti)} km × {formatBRL(order.kmRateCents)}
                </p>
                <p className="mt-2 flex justify-between text-sm font-bold text-ink-900">
                  <span>Subtotal</span>
                  <span>{formatBRL(order.travelSubtotalCents)}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-brand-600 px-4 py-3 text-white">
              <span className="text-sm font-bold tracking-wide uppercase">
                Total do atendimento
              </span>
              <span className="text-xl font-bold">{formatBRL(order.totalCents)}</span>
            </div>
          </section>
        </div>

        <div className="grid content-start gap-5">
          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Ações</h2>
            <div className="mt-3">
              <RecordActions
                kind="OS"
                id={order.id}
                number={order.number}
                status={status}
                canEdit={canEdit}
                isAdmin={admin}
                reasons={reasons}
              />
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Histórico</h2>
            <ol className="mt-4 grid gap-4">
              {events.map((event) => {
                const changes = parseChanges(event.details);
                return (
                  <li key={event.id} className="relative border-l-2 border-line pl-4">
                    <span
                      aria-hidden
                      className="absolute top-1.5 -left-[5px] h-2 w-2 rounded-full bg-brand-600"
                    />
                    <p className="text-sm font-semibold text-ink-900">
                      {EVENT_LABEL[event.type as EventType] ?? event.type}
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatDateTimeBR(event.createdAt)} · {event.user?.name ?? 'Sistema'}
                    </p>
                    {changes.length > 0 ? (
                      <ul className="mt-1.5 grid gap-0.5 text-xs text-ink-700">
                        {changes.map((change) => (
                          <li key={change.field}>
                            <span className="font-medium">{change.label}:</span>{' '}
                            <span className="line-through opacity-60">{change.from || '—'}</span>{' '}
                            → <span>{change.to || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-ink-700">{event.message}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
