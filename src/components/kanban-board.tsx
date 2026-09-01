'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { OS_STATUSES, STATUS_LABEL, type OsStatus } from '@/lib/os/status';

export type KanbanCard = {
  id: string;
  number: string;
  title: string;
  status: OsStatus;
  institution: string;
  plant: string;
  responsible: string;
  expectedDate: string;
  overdue: boolean;
};

type Props = {
  cards: KanbanCard[];
  /** Total por status considerando todos os registros filtrados. */
  totals: Record<string, number>;
  /** Indica que a listagem foi truncada por limite de carga. */
  truncated: boolean;
};

const COLUMN_ACCENT: Record<OsStatus, string> = {
  ABERTA: 'bg-blue-500',
  EM_ANDAMENTO: 'bg-amber-500',
  AGUARDANDO: 'bg-violet-500',
  CONCLUIDA: 'bg-emerald-500',
  CANCELADA: 'bg-gray-400',
};

export function KanbanBoard({ cards, totals, truncated }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(cards);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hovered, setHovered] = useState<OsStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Mantem o quadro sincronizado quando o servidor devolve novos dados.
  useEffect(() => setItems(cards), [cards]);

  async function move(id: string, status: OsStatus) {
    const card = items.find((item) => item.id === id);
    if (!card || card.status === status) return;

    const previous = items;
    setError(null);
    setBusy(id);
    // Atualizacao otimista: o card muda de coluna imediatamente.
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );

    try {
      await api.patch(`/api/os/${id}/status`, { status });
      startTransition(() => router.refresh());
    } catch (caught) {
      setItems(previous);
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Não foi possível mover a Ordem de Serviço.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Quadro de acompanhamento">
      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {truncated ? (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Exibindo as Ordens de Serviço mais próximas da previsão. Use os filtros ou a listagem
          completa para ver as demais.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        {OS_STATUSES.map((status) => {
          const columnCards = items.filter((item) => item.status === status);
          const isTarget = hovered === status;

          return (
            <div
              key={status}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setHovered(status);
              }}
              onDragLeave={() => setHovered((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setHovered(null);
                const id = event.dataTransfer.getData('text/plain') || dragging;
                setDragging(null);
                if (id) void move(id, status);
              }}
              className={`flex min-h-[7rem] flex-col rounded-lg border bg-white/60 transition-colors ${
                isTarget ? 'border-accent-600 bg-brand-50' : 'border-line'
              }`}
            >
              <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <span aria-hidden className={`h-2 w-2 rounded-full ${COLUMN_ACCENT[status]}`} />
                <h3 className="text-sm font-semibold text-ink-900">{STATUS_LABEL[status]}</h3>
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-ink-700">
                  {totals[status] ?? 0}
                </span>
              </header>

              <ul className="flex flex-1 flex-col gap-2 p-2">
                {columnCards.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-ink-500">Nenhuma OS</li>
                ) : null}

                {columnCards.map((card) => (
                  <li
                    key={card.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', card.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(card.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setHovered(null);
                    }}
                    className={`card cursor-grab p-3 active:cursor-grabbing ${
                      busy === card.id ? 'opacity-60' : ''
                    } ${card.overdue ? 'border-l-4 border-l-red-500' : ''}`}
                  >
                    <Link href={`/os/${card.id}`} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-brand-600">
                          Nº {card.number}
                        </span>
                        {card.overdue ? (
                          <span className="badge bg-red-50 text-red-700 ring-red-200">Atrasada</span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink-900">
                        {card.title}
                      </p>
                      {/* min-w-0 em cada nivel: sem isso os itens de grid/flex
                          crescem alem do card em vez de truncar. */}
                      <dl className="mt-2 grid min-w-0 gap-0.5 text-xs text-ink-500">
                        <div className="flex min-w-0 gap-1">
                          <dt className="sr-only">Instituição</dt>
                          <dd className="shrink-0 font-medium text-ink-700">{card.institution}</dd>
                          <span aria-hidden>·</span>
                          <dt className="sr-only">Usina</dt>
                          <dd className="min-w-0 truncate">{card.plant}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="sr-only">Responsável</dt>
                          <dd className="truncate">{card.responsible}</dd>
                        </div>
                        <div className={card.overdue ? 'font-semibold text-red-600' : ''}>
                          <dt className="sr-only">Previsão de execução</dt>
                          <dd>Previsão: {card.expectedDate}</dd>
                        </div>
                      </dl>
                    </Link>

                    {/* Alternativa acessivel ao arrastar: funciona em toque e teclado. */}
                    <label className="mt-2 block">
                      <span className="sr-only">Mover OS {card.number} para</span>
                      <select
                        value={card.status}
                        disabled={busy === card.id}
                        onChange={(event) => void move(card.id, event.target.value as OsStatus)}
                        className="w-full rounded border border-line bg-white px-2 py-1 text-xs text-ink-700"
                      >
                        {OS_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {STATUS_LABEL[option]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
