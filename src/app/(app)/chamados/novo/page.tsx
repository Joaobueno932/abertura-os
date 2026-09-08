import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { findResponsibleForUser, loadFormOptions } from '@/lib/os/options';
import { getSessionUser } from '@/lib/auth/session';
import { TicketForm } from '@/components/ticket-form';

export const metadata: Metadata = { title: 'Novo chamado da concessionária' };
export const dynamic = 'force-dynamic';

export default async function NovoChamadoPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const [options, responsibleId] = await Promise.all([
    loadFormOptions(),
    findResponsibleForUser(user),
  ]);

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Abrir chamado da concessionária</h1>
        <p className="text-sm text-ink-500">
          Para ocorrências na rede da distribuidora — queda de energia, por exemplo. O número e a
          data de abertura são gerados automaticamente ao salvar.
        </p>
      </header>
      <TicketForm options={options} initial={{ responsibleId: responsibleId ?? '' }} />
    </div>
  );
}
