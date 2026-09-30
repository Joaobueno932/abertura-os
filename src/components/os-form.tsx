'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { calculateCosts, CostValidationError } from '@/lib/os/costs';
import { businessDayKey } from '@/lib/datetime';
import { formatBRL, formatCenti, parseToCenti } from '@/lib/money';
import type { Options } from '@/lib/os/options';

export type TechnicianValue = {
  /** Vazio = tecnico digitado manualmente. */
  responsibleId: string;
  name: string;
};

export type OsFormValues = {
  title: string;
  plantId: string;
  institutionId: string;
  responsibleId: string;
  expectedDate: string;
  location: string;
  description: string;
  technicianCount: string;
  technicians: TechnicianValue[];
  hoursPerTechnician: string;
  outboundKm: string;
  returnKm: string;
  /** Apenas na abertura. Vazio = hoje. */
  openedDate: string;
};

export type Rates = { technicalHourlyRateCents: number; kmRateCents: number };

type Props = {
  options: Options;
  rates: Rates;
  /** Preenchido apenas na edicao. */
  osId?: string;
  initial?: Partial<OsFormValues>;
};

const EMPTY: OsFormValues = {
  title: '',
  plantId: '',
  institutionId: '',
  responsibleId: '',
  expectedDate: '',
  location: '',
  description: '',
  technicianCount: '1',
  technicians: [{ responsibleId: '', name: '' }],
  hoursPerTechnician: '',
  outboundKm: '0',
  returnKm: '0',
  openedDate: '',
};

/** Hoje no formato do input type=date (AAAA-MM-DD), no fuso de negocio. */
function todayInput(): string {
  const key = businessDayKey();
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}`;
}

/** Teto de campos abertos de uma vez, para nao travar a tela por um digito errado. */
const MAX_TECHNICIAN_FIELDS = 20;

function optionLabel(option: { name: string; active?: boolean }): string {
  return option.active === false ? `${option.name} (inativo)` : option.name;
}

/** Ajusta a lista de tecnicos ao total informado, preservando o que ja foi digitado. */
function resizeTechnicians(current: TechnicianValue[], size: number): TechnicianValue[] {
  if (current.length === size) return current;
  if (current.length > size) return current.slice(0, size);
  return [
    ...current,
    ...Array.from({ length: size - current.length }, () => ({ responsibleId: '', name: '' })),
  ];
}

export function OsForm({ options, rates, osId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<OsFormValues>(() => {
    const merged = { ...EMPTY, ...initial };
    const count = Number(merged.technicianCount);
    const size = Number.isInteger(count) && count > 0 ? Math.min(count, MAX_TECHNICIAN_FIELDS) : 1;
    return { ...merged, technicians: resizeTechnicians(merged.technicians ?? [], size) };
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearFieldError = (key: string) =>
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const set = (key: keyof OsFormValues) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    clearFieldError(key);
  };

  /**
   * A quantidade de tecnicos governa duas coisas ao mesmo tempo: o calculo do
   * valor e quantos campos de tecnico ficam abertos. Manter as duas em um unico
   * estado evita cobrar por um tecnico que ninguem identificou.
   */
  function setTechnicianCount(raw: string) {
    const parsed = Number(raw);
    setValues((current) => {
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return { ...current, technicianCount: raw };
      }
      return {
        ...current,
        technicianCount: raw,
        technicians: resizeTechnicians(current.technicians, Math.min(parsed, MAX_TECHNICIAN_FIELDS)),
      };
    });
    clearFieldError('technicianCount');
    clearFieldError('technicians');
  }

  function setTechnician(index: number, patch: Partial<TechnicianValue>) {
    setValues((current) => ({
      ...current,
      technicians: current.technicians.map((technician, position) =>
        position === index ? { ...technician, ...patch } : technician,
      ),
    }));
    clearFieldError(`technicians.${index}.name`);
    clearFieldError(`technicians.${index}.responsibleId`);
    clearFieldError('technicians');
  }

  /**
   * Previa dos custos calculada com a MESMA funcao usada no backend. O valor
   * exibido aqui e apenas informativo: ao salvar, o servidor recalcula tudo a
   * partir dos dados basicos e ignora qualquer total enviado pelo cliente.
   */
  const preview = useMemo(() => {
    const technicianCount = Number(values.technicianCount);
    const hours = parseToCenti(values.hoursPerTechnician);
    const outbound = parseToCenti(values.outboundKm || '0');
    const returnKm = parseToCenti(values.returnKm || '0');

    if (
      !Number.isInteger(technicianCount) ||
      technicianCount <= 0 ||
      hours === null ||
      hours <= 0 ||
      outbound === null ||
      outbound < 0 ||
      returnKm === null ||
      returnKm < 0
    ) {
      return null;
    }

    try {
      return calculateCosts({
        technicianCount,
        hoursPerTechnicianCenti: hours,
        outboundKmCenti: outbound,
        returnKmCenti: returnKm,
        technicalHourlyRateCents: rates.technicalHourlyRateCents,
        kmRateCents: rates.kmRateCents,
      });
    } catch (caught) {
      if (caught instanceof CostValidationError) return null;
      throw caught;
    }
  }, [values, rates]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});

    const payload = {
      title: values.title,
      plantId: values.plantId,
      institutionId: values.institutionId,
      responsibleId: values.responsibleId,
      expectedDate: values.expectedDate,
      location: values.location,
      description: values.description,
      technicianCount: values.technicianCount,
      technicians: values.technicians.map((technician) => ({
        responsibleId: technician.responsibleId || null,
        name: technician.name,
      })),
      hoursPerTechnician: values.hoursPerTechnician,
      outboundKm: values.outboundKm || '0',
      returnKm: values.returnKm || '0',
      ...(osId ? {} : { openedDate: values.openedDate }),
    };

    try {
      const saved = osId
        ? await api.patch<{ id: string }>(`/api/os/${osId}`, payload)
        : await api.post<{ id: string }>('/api/os', payload);
      router.replace(`/os/${saved.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Não foi possível salvar a Ordem de Serviço.');
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
          cadastrados para abrir uma OS.
        </p>
      ) : null}

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Informações da OS</h2>
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
              placeholder="manutenção preventiva"
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
              Responsável pela OS <span aria-hidden className="text-red-500">*</span>
            </label>
            <select
              id="responsibleId"
              className="field-input"
              required
              value={values.responsibleId}
              onChange={set('responsibleId')}
              aria-describedby="responsible-hint"
              aria-invalid={Boolean(fields.responsibleId)}
            >
              <option value="">Selecione…</option>
              {options.responsibles.map((option) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
            <p id="responsible-hint" className="mt-1 text-xs text-ink-500">
              Preenchido com quem está abrindo a OS. Responde pela ordem — não é necessariamente o
              técnico que vai até o local.
            </p>
            {fieldError('responsibleId')}
          </div>

          <div>
            <label htmlFor="expectedDate" className="field-label">
              Previsão de execução <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="expectedDate"
              type="date"
              className="field-input"
              required
              value={values.expectedDate}
              onChange={set('expectedDate')}
              aria-invalid={Boolean(fields.expectedDate)}
            />
            {fieldError('expectedDate')}
          </div>

          {osId ? null : (
            <div>
              <label htmlFor="openedDate" className="field-label">
                Data de abertura
              </label>
              <input
                id="openedDate"
                type="date"
                className="field-input"
                max={todayInput()}
                value={values.openedDate}
                onChange={set('openedDate')}
                aria-describedby="opened-date-hint"
                aria-invalid={Boolean(fields.openedDate)}
              />
              <p id="opened-date-hint" className="mt-1 text-xs text-ink-500">
                Deixe em branco para hoje. Use uma data anterior para lançar OS retroativas.
              </p>
              {fieldError('openedDate')}
            </div>
          )}

          <div className="md:col-span-2">
            <label htmlFor="location" className="field-label">
              Local de atendimento <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="location"
              className="field-input"
              required
              maxLength={200}
              value={values.location}
              onChange={set('location')}
              aria-invalid={Boolean(fields.location)}
            />
            {fieldError('location')}
          </div>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Técnicos do atendimento</h2>
        <p className="mt-1 text-xs text-ink-500">
          Informe quem vai até o local. Cada técnico pode ser vinculado a um cadastro ou digitado.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="technicianCount" className="field-label">
              Quantidade de técnicos <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="technicianCount"
              type="number"
              min={1}
              max={MAX_TECHNICIAN_FIELDS}
              step={1}
              className="field-input"
              required
              value={values.technicianCount}
              onChange={(event) => setTechnicianCount(event.target.value)}
              aria-invalid={Boolean(fields.technicianCount)}
            />
            {fieldError('technicianCount')}
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          {values.technicians.map((technician, index) => {
            const selectId = `technician-${index}-responsibleId`;
            const nameId = `technician-${index}-name`;
            const manual = technician.responsibleId === '';
            return (
              <div
                key={index}
                className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-2"
              >
                <div>
                  <label htmlFor={selectId} className="field-label">
                    Técnico {index + 1}
                  </label>
                  <select
                    id={selectId}
                    className="field-input"
                    value={technician.responsibleId}
                    onChange={(event) =>
                      setTechnician(index, {
                        responsibleId: event.target.value,
                        // Vinculo escolhido: o nome vem do cadastro, no servidor.
                        name: event.target.value ? '' : technician.name,
                      })
                    }
                    aria-invalid={Boolean(fields[`technicians.${index}.responsibleId`])}
                  >
                    <option value="">Digitar nome…</option>
                    {options.responsibles.map((option) => (
                      <option key={option.id} value={option.id}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </select>
                  {fieldError(`technicians.${index}.responsibleId`)}
                </div>

                {manual ? (
                  <div>
                    <label htmlFor={nameId} className="field-label">
                      Nome do técnico <span aria-hidden className="text-red-500">*</span>
                    </label>
                    <input
                      id={nameId}
                      className="field-input"
                      maxLength={120}
                      value={technician.name}
                      onChange={(event) => setTechnician(index, { name: event.target.value })}
                      aria-invalid={Boolean(fields[`technicians.${index}.name`])}
                      placeholder="Nome completo"
                    />
                    {fieldError(`technicians.${index}.name`)}
                  </div>
                ) : (
                  <p className="self-end pb-2 text-sm text-ink-500">
                    Vinculado ao cadastro selecionado.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {fieldError('technicians')}
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Descrição</h2>
        <div className="mt-4">
          <label htmlFor="description" className="field-label">
            Descrição do serviço <span aria-hidden className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            className="field-input min-h-32 resize-y"
            required
            maxLength={4000}
            value={values.description}
            onChange={set('description')}
            aria-describedby="description-hint"
            aria-invalid={Boolean(fields.description)}
            placeholder="Realizar manutenção preventiva e inspeção dos equipamentos."
          />
          <p id="description-hint" className="mt-1 text-xs text-ink-500">
            A descrição é gravada e apresentada em CAIXA ALTA no sistema e no documento oficial.
          </p>
          {fieldError('description')}
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Valor do atendimento</h2>
        <p className="mt-1 text-xs text-ink-500">
          Valores vigentes: {formatBRL(rates.technicalHourlyRateCents)} por hora técnica ·{' '}
          {formatBRL(rates.kmRateCents)} por quilômetro.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label htmlFor="hoursPerTechnician" className="field-label">
              Horas por técnico <span aria-hidden className="text-red-500">*</span>
            </label>
            <input
              id="hoursPerTechnician"
              inputMode="decimal"
              className="field-input"
              required
              value={values.hoursPerTechnician}
              onChange={set('hoursPerTechnician')}
              aria-invalid={Boolean(fields.hoursPerTechnician)}
              placeholder="3"
            />
            {fieldError('hoursPerTechnician')}
          </div>

          <div>
            <label htmlFor="outboundKm" className="field-label">
              Quilometragem de ida
            </label>
            <input
              id="outboundKm"
              inputMode="decimal"
              className="field-input"
              value={values.outboundKm}
              onChange={set('outboundKm')}
              aria-invalid={Boolean(fields.outboundKm)}
              placeholder="200"
            />
            {fieldError('outboundKm')}
          </div>

          <div>
            <label htmlFor="returnKm" className="field-label">
              Quilometragem de volta
            </label>
            <input
              id="returnKm"
              inputMode="decimal"
              className="field-input"
              value={values.returnKm}
              onChange={set('returnKm')}
              aria-invalid={Boolean(fields.returnKm)}
              placeholder="200"
            />
            {fieldError('returnKm')}
          </div>
        </div>

        <div className="mt-5 rounded-md bg-brand-50 p-4" aria-live="polite">
          <h3 className="text-xs font-bold tracking-wide text-brand-600 uppercase">Resumo</h3>
          {preview ? (
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-700">
                  Horas técnicas
                  <span className="block text-xs text-ink-500">
                    {preview.technicianCount} × {formatBRL(preview.technicalHourlyRateCents)} ×{' '}
                    {formatCenti(preview.hoursPerTechnicianCenti)}
                  </span>
                </dt>
                <dd className="font-semibold text-ink-900">
                  {formatBRL(preview.technicalSubtotalCents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-700">
                  Deslocamento
                  <span className="block text-xs text-ink-500">
                    {formatCenti(preview.totalKmCenti)} km × {formatBRL(preview.kmRateCents)}
                  </span>
                </dt>
                <dd className="font-semibold text-ink-900">
                  {formatBRL(preview.travelSubtotalCents)}
                </dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-brand-200 pt-2">
                <dt className="text-sm font-bold tracking-wide text-brand-600 uppercase">
                  Total do atendimento
                </dt>
                <dd className="text-lg font-bold text-brand-600">{formatBRL(preview.totalCents)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink-500">
              Informe a quantidade de técnicos e as horas para ver o cálculo.
            </p>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Prévia informativa. Os valores são recalculados e validados no servidor ao salvar.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={saving || noOptions}>
          {saving ? 'Salvando…' : osId ? 'Salvar alterações' : 'Abrir Ordem de Serviço'}
        </button>
        <Link href={osId ? `/os/${osId}` : '/painel'} className="btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
