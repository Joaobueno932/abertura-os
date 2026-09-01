import type { Metadata } from 'next';
import { getRates } from '@/lib/settings';
import { env } from '@/lib/env';
import { isSofficeConfigured } from '@/lib/docs/soffice';
import { RatesForm } from '@/components/admin/rates-form';

export const metadata: Metadata = { title: 'Configurações' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const rates = await getRates();

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Configurações</h1>
        <p className="text-sm text-ink-500">
          Valores unitários usados no cálculo do atendimento e informações do ambiente.
        </p>
      </header>

      <RatesForm
        technicalHourlyRateCents={rates.technicalHourlyRateCents}
        kmRateCents={rates.kmRateCents}
      />

      <section className="card p-4 sm:p-5">
        <h2 className="section-title">Geração de documentos</h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <div>
            <dt className="field-label">Template do papel timbrado</dt>
            <dd className="font-mono text-xs break-all text-ink-700">{env.docxTemplatePath}</dd>
          </div>
          <div>
            <dt className="field-label">Conversão DOCX para PDF</dt>
            <dd className="text-ink-700">
              {isSofficeConfigured()
                ? 'LibreOffice configurado (SOFFICE_PATH). O PDF é a conversão direta do DOCX.'
                : 'Renderização nativa, sem dependência de sistema operacional. Configure SOFFICE_PATH para converter o DOCX via LibreOffice.'}
            </dd>
          </div>
          <div>
            <dt className="field-label">Fuso horário de negócio</dt>
            <dd className="text-ink-700">{env.timezone}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
