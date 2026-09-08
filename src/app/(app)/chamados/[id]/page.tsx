import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getUtilityTicketDetail,
  getUtilityTicketEvents,
  isTicketOverdue,
} from '@/lib/tickets/service';
import { loadCancellationReasons } from '@/lib/os/cancellation';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { formatDateOnlyBR, formatDateTimeBR } from '@/lib/datetime';
import { formatCenti } from '@/lib/money';
import type { OsStatus } from '@/lib/os/status';
import { EVENT_LABEL, parseChanges, type EventType } from '@/lib/os/history';
import { StatusBadge } from '@/components/status-badge';
import { RecordActions } from '@/components/record-actions';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const ticket = await getUtilityTicketDetail(id);
  return { title: ticket ? `Chamado ${ticket.number}` : 'Chamado da concessionária' };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="text-sm text-ink-900">{value || '—'}</dd>
    </div>
  );
}

export default async function ChamadoDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const [ticket, user] = await Promise.all([getUtilityTicketDetail(id), getSessionUser()]);
  if (!ticket || !user) notFound();

  const [events, reasons] = await Promise.all([
    getUtilityTicketEvents(id),
    loadCancellationReasons(ticket.cancellationReason?.id),
  ]);

  const status = ticket.status as OsStatus;
  const overdue = isTicketOverdue(ticket);
  const admin = isAdmin(user.role);
  const canEdit = status !== 'CANCELADA' || admin;

  return (
    <div className="grid gap-5">
      <nav aria-label="Trilha" className="no-print text-xs text-ink-500">
        <Link href="/painel" className="hover:underline">
          Painel
        </Link>{' '}
        /{' '}
        <Link href="/chamados" className="hover:underline">
          Chamados da concessionária
        </Link>{' '}
        / <span className="text-ink-700">Nº {ticket.number}</span>
      </nav>

      <header className="card flex flex-wrap items-start justify-between gap-4 border-l-4 border-l-sky-400 p-4 sm:p-5">
        <div>
          <p className="font-mono text-xs font-bold tracking-wide text-sky-800">
            Nº {ticket.number}
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink-900">{ticket.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Aberto em {formatDateTimeBR(ticket.openedAt)} por {ticket.createdBy.name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="badge bg-sky-100 text-sky-800 ring-sky-300">Concessionária</span>
          <StatusBadge status={status} />
          {overdue ? (
            <span className="badge bg-red-50 text-red-700 ring-red-200">Prazo estourado</span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Identificação</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Número do chamado" value={ticket.number} />
              <div>
                <dt className="field-label">Status</dt>
                <dd>
                  <StatusBadge status={status} />
                </dd>
              </div>
              <Field label="Data de abertura" value={formatDateOnlyBR(ticket.openedAt)} />
              <Field label="Protocolo da concessionária" value={ticket.protocol} />
              {ticket.cancellationReason ? (
                <Field label="Motivo do cancelamento" value={ticket.cancellationReason.label} />
              ) : null}
            </dl>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Acompanhamento</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Título" value={ticket.title} />
              <Field label="Usina" value={ticket.plant.name} />
              <Field label="Cliente/Instituição" value={ticket.institution.name} />
              <Field label="Responsável" value={ticket.responsible.name} />
              <Field
                label="Previsão para solução"
                value={`${formatCenti(ticket.expectedHoursCenti)} h`}
              />
              <div>
                <dt className="field-label">Prazo</dt>
                <dd className={`text-sm ${overdue ? 'font-semibold text-red-600' : 'text-ink-900'}`}>
                  {formatDateTimeBR(ticket.dueAt)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Descrição</h2>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-900">
              {ticket.description}
            </p>
          </section>
        </div>

        <div className="grid content-start gap-5">
          <section className="card p-4 sm:p-5">
            <h2 className="section-title">Ações</h2>
            <div className="mt-3">
              <RecordActions
                kind="CHAMADO"
                id={ticket.id}
                number={ticket.number}
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
                      className="absolute top-1.5 -left-[5px] h-2 w-2 rounded-full bg-sky-500"
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
                            <span className="line-through opacity-60">{change.from || '—'}</span> →{' '}
                            <span>{change.to || '—'}</span>
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
