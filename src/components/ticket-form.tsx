'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { Options } from '@/lib/os/options';

/**
 * Abertura/edicao de um chamado junto a concessionaria de energia.
 *
 * Nao ha custo aqui: o chamado registra um problema na rede da distribuidora
 * (ex.: queda de energia) e serve para acompanhar a solucao pelo protocolo.
 */

export type TicketFormValues = {
  title: string;
  plantId: string;
  institutionId: string;
  responsibleId: string;
  expectedHours: string;
  protocol: string;
  description: string;
};

type Props = {
  options: Options;
  /** Preenchido apenas na edicao. */
  ticketId?: string;
  initial?: Partial<TicketFormValues>;
};

const EMPTY: TicketFormValues = {
  title: '',
  plantId: '',
  institutionId: '',
  responsibleId: '',
  expectedHours: '',
  protocol: '',
  description: '',
};

function optionLabel(option: { name: string; active?: boolean }): string {
  return option.active === false ? `${option.name} (inativo)` : option.name;
}

export function TicketForm({ options, ticketId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<TicketFormValues>({ ...EMPTY, ...initial });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof TicketFormValues) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});

    try {
      const saved = ticketId
        ? await api.patch<{ id: string }>(`/api/chamados/${ticketId}`, values)
        : await api.post<{ id: string }>('/api/chamados', values);
      router.replace(`/chamados/${saved.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Não foi possível salvar o chamado.');
      }
      setSaving(false);
    }
  }

  const fieldError = (key: string) =>
    fields[key] ? <span className="field-error">{fields[key]}</span> : null;

  const noOptions =
    options.plants.length === 0 ||
    options.institutions.length === 0 ||
    options.responsibles.length === 0;

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {noOptions ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          É necessário ter ao menos uma usina, um cliente/instituição e um responsável ativos
          cadastrados para abrir um chamado.
        </p>
      ) : null}

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Chamado da concessionária</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="title" className="field-label">
              Título <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="title"
              className="field-input"
              required
              maxLength={160}
              value={values.title}
              onChange={set('title')}
              aria-invalid={Boolean(fields.title)}
              placeholder="queda de energia na rede da concessionária"
            />
            {fieldError('title')}
          </div>

          <div>
            <label htmlFor="plantId" className="field-label">
              Usina <span aria-hidden className="text-red-500">*</span>
            </label>
            <select
              id="plantId"
              className="field-input"
              required
              value={values.plantId}
              onChange={set('plantId')}
              aria-invalid={Boolean(fields.plantId)}
            >
              <option value="">Selecione…</option>
              {options.plants.map((option) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
            {fieldError('plantId')}
          </div>

          <div>
            <label htmlFor="institutionId" className="field-label">
              Cliente/Instituição <span aria-hidden className="text-red-500">*</span>
            </label>
            <select
              id="institutionId"
              className="field-input"
              required
              value={values.institutionId}
              onChange={set('institutionId')}
              aria-invalid={Boolean(fields.institutionId)}
            >
              <option value="">Selecione…</option>
              {options.institutions.map((option) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
            {fieldError('institutionId')}
          </div>

          <div>
            <label htmlFor="responsibleId" className="field-label">
              Responsável <span aria-hidden className="text-red-500">*</span>
            </label>
            <select
              id="responsibleId"
              className="field-input"
              required
              value={values.responsibleId}
              onChange={set('responsibleId')}
              aria-describedby="ticket-responsible-hint"
              aria-invalid={Boolean(fields.responsibleId)}
            >
              <option value="">Selecione…</option>
              {options.responsibles.map((option) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
            <p id="ticket-responsible-hint" className="mt-1 text-xs text-ink-500">
              Preenchido com quem está abrindo o chamado.
            </p>
            {fieldError('responsibleId')}
          </div>

          <div>
            <label htmlFor="expectedHours" className="field-label">
              Previsão em horas para solução <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="expectedHours"
              inputMode="decimal"
              className="field-input"
              required
              value={values.expectedHours}
              onChange={set('expectedHours')}
              aria-describedby="expected-hours-hint"
              aria-invalid={Boolean(fields.expectedHours)}
              placeholder="4"
            />
            <p id="expected-hours-hint" className="mt-1 text-xs text-ink-500">
              Prazo informado pela concessionária, contado a partir da abertura.
            </p>
            {fieldError('expectedHours')}
          </div>

          <div>
            <label htmlFor="protocol" className="field-label">
              Protocolo <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="protocol"
              className="field-input"
              required
              maxLength={60}
              value={values.protocol}
              onChange={set('protocol')}
              aria-invalid={Boolean(fields.protocol)}
              placeholder="Número informado pela concessionária"
            />
            {fieldError('protocol')}
          </div>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Descrição</h2>
        <div className="mt-4">
          <label htmlFor="description" className="field-label">
            Descrição da ocorrência <span aria-hidden className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            className="field-input min-h-32 resize-y"
            required
            maxLength={4000}
            value={values.description}
            onChange={set('description')}
            aria-describedby="ticket-description-hint"
            aria-invalid={Boolean(fields.description)}
            placeholder="Queda de energia na rede da concessionária afetando a usina."
          />
          <p id="ticket-description-hint" className="mt-1 text-xs text-ink-500">
            A descrição é gravada e apresentada em CAIXA ALTA no sistema.
          </p>
          {fieldError('description')}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={saving || noOptions}>
          {saving ? 'Salvando…' : ticketId ? 'Salvar alterações' : 'Abrir chamado'}
        </button>
        <Link href={ticketId ? `/chamados/${ticketId}` : '/painel'} className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
