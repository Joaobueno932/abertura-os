import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { findResponsibleForUser, loadFormOptions } from '@/lib/os/options';
import { getRates } from '@/lib/settings';
import { getSessionUser } from '@/lib/auth/session';
import { OsForm } from '@/components/os-form';

export const metadata: Metadata = { title: 'Nova Ordem de Serviço' };
export const dynamic = 'force-dynamic';

export default async function NovaOsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  // O responsavel ja vem preenchido com quem esta abrindo a OS; continua
  // editavel, porque quem abre nem sempre e quem responde pelo atendimento.
  const [options, rates, responsibleId] = await Promise.all([
    loadFormOptions(),
    getRates(),
    findResponsibleForUser(user),
  ]);

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Abrir Ordem de Serviço</h1>
        <p className="text-sm text-ink-500">
          O número da OS e a data de abertura são gerados automaticamente ao salvar.
        </p>
      </header>
      <OsForm options={options} rates={rates} initial={{ responsibleId: responsibleId ?? '' }} />
    </div>
  );
}
