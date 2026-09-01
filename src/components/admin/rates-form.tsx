'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { formatCenti } from '@/lib/money';

type Props = { technicalHourlyRateCents: number; kmRateCents: number };

export function RatesForm({ technicalHourlyRateCents, kmRateCents }: Props) {
  const router = useRouter();
  const [hourly, setHourly] = useState(formatCenti(technicalHourlyRateCents));
  const [km, setKm] = useState(formatCenti(kmRateCents));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    setFields({});
    try {
      await api.put('/api/admin/configuracoes', {
        technicalHourlyRate: hourly,
        kmRate: km,
      });
      setNotice('Valores atualizados. Ordens de Serviço já registradas não foram alteradas.');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Não foi possível salvar as configurações.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-4 sm:p-5" noValidate>
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      ) : null}

      <h2 className="section-title">Valores do atendimento</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="hourly" className="field-label">
            Valor da hora técnica (R$)
          </label>
          <input
            id="hourly"
            inputMode="decimal"
            className="field-input"
            value={hourly}
            onChange={(event) => setHourly(event.target.value)}
            aria-invalid={Boolean(fields.technicalHourlyRate)}
            placeholder="150,00"
          />
          <p className="mt-1 text-xs text-ink-500">Aplicado por hora e por técnico.</p>
          {fields.technicalHourlyRate ? (
            <span className="field-error">{fields.technicalHourlyRate}</span>
          ) : null}
        </div>

        <div>
          <label htmlFor="km" className="field-label">
            Valor por quilômetro (R$)
          </label>
          <input
            id="km"
            inputMode="decimal"
            className="field-input"
            value={km}
            onChange={(event) => setKm(event.target.value)}
            aria-invalid={Boolean(fields.kmRate)}
            placeholder="1,50"
          />
          <p className="mt-1 text-xs text-ink-500">Aplicado sobre a soma de ida e volta.</p>
          {fields.kmRate ? <span className="field-error">{fields.kmRate}</span> : null}
        </div>
      </div>

      <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-ink-700">
        Cada Ordem de Serviço guarda os valores unitários usados no momento do cálculo. Alterar os
        valores aqui afeta apenas as OS criadas ou recalculadas a partir de agora — documentos de OS
        antigas continuam mostrando os valores originais.
      </p>

      <div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar valores'}
        </button>
      </div>
    </form>
  );
}
