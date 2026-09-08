'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { OS_STATUSES, STATUS_LABEL } from '@/lib/os/status';
import { RECORD_KINDS } from '@/lib/validation/os';

export type FilterOption = { id: string; name: string };

export type FilterOptions = {
  institutions: FilterOption[];
  responsibles: FilterOption[];
  plants: FilterOption[];
};

type Props = {
  options: FilterOptions;
  /** O painel usa a versao compacta; a listagem completa mostra os filtros de data. */
  variant?: 'compact' | 'full';
  /**
   * Onde OS e chamados dividem a tela (o painel), o filtro de tipo aparece.
   * Nas listagens de um tipo so ele nao faz sentido.
   */
  showKind?: boolean;
};

const KIND_LABEL: Record<(typeof RECORD_KINDS)[number], string> = {
  OS: 'Ordens de Serviço',
  CHAMADO: 'Chamados da concessionária',
};

const DATE_FILTERS = [
  { name: 'openedFrom', label: 'Aberta de' },
  { name: 'openedTo', label: 'Aberta até' },
  { name: 'expectedFrom', label: 'Previsão de' },
  { name: 'expectedTo', label: 'Previsão até' },
] as const;

export function OsFilters({ options, variant = 'full', showKind = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const current = (key: string) => params.get(key) ?? '';
  const activeCount = [
    'q',
    'status',
    'tipo',
    'institutionId',
    'responsibleId',
    'plantId',
    ...DATE_FILTERS.map((filter) => filter.name),
  ].filter((key) => current(key)).length;

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const text = String(value).trim();
      if (text) next.set(key, text);
    }
    // Qualquer mudanca de filtro volta para a primeira pagina.
    next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function clear() {
    startTransition(() => router.replace(pathname));
  }

  const showDates = variant === 'full' && expanded;

  return (
    <form onSubmit={apply} className="card p-3 sm:p-4">
      <div className={`grid gap-3 md:grid-cols-2 ${showKind ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
        <div className="md:col-span-2 xl:col-span-1">
          <label htmlFor="q" className="field-label">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={current('q')}
            placeholder="Nº, título, cliente…"
            className="field-input"
          />
        </div>

        {showKind ? (
          <div>
            <label htmlFor="tipo" className="field-label">
              Tipo
            </label>
            <select id="tipo" name="tipo" defaultValue={current('tipo')} className="field-input">
              <option value="">OS e chamados</option>
              {RECORD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={current('status')} className="field-input">
            <option value="">Todos</option>
            {OS_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="institutionId" className="field-label">
            Cliente/Instituição
          </label>
          <select
            id="institutionId"
            name="institutionId"
            defaultValue={current('institutionId')}
            className="field-input"
          >
            <option value="">Todas</option>
            {options.institutions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="responsibleId" className="field-label">
            Responsável
          </label>
          <select
            id="responsibleId"
            name="responsibleId"
            defaultValue={current('responsibleId')}
            className="field-input"
          >
            <option value="">Todos</option>
            {options.responsibles.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="plantId" className="field-label">
            Usina
          </label>
          <select
            id="plantId"
            name="plantId"
            defaultValue={current('plantId')}
            className="field-input"
          >
            <option value="">Todas</option>
            {options.plants.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showDates ? (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2 xl:grid-cols-4">
          {DATE_FILTERS.map((filter) => (
            <div key={filter.name}>
              <label htmlFor={filter.name} className="field-label">
                {filter.label}
              </label>
              <input
                id={filter.name}
                name={filter.name}
                type="date"
                defaultValue={current(filter.name)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Aplicando…' : 'Aplicar filtros'}
        </button>
        {activeCount > 0 ? (
          <button type="button" onClick={clear} className="btn-secondary" disabled={pending}>
            Limpar ({activeCount})
          </button>
        ) : null}
        {variant === 'full' ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="btn-ghost ml-auto"
            aria-expanded={expanded}
          >
            {expanded ? 'Ocultar filtros de data' : 'Filtros de data'}
          </button>
        ) : null}
      </div>
    </form>
  );
}
