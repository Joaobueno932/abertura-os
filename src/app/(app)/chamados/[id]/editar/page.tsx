import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUtilityTicketDetail } from '@/lib/tickets/service';
import { loadFormOptions } from '@/lib/os/options';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { formatCenti } from '@/lib/money';
import { TicketForm } from '@/components/ticket-form';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const ticket = await getUtilityTicketDetail(id);
  return { title: ticket ? `Editar chamado ${ticket.number}` : 'Editar chamado' };
}

export default async function EditarChamadoPage({ params }: { params: Params }) {
  const { id } = await params;
  const [ticket, user] = await Promise.all([getUtilityTicketDetail(id), getSessionUser()]);
  if (!ticket || !user) notFound();

  // Chamado cancelado so pode ser editado por administrador (regra repetida no backend).
  if (ticket.status === 'CANCELADA' && !isAdmin(user.role)) redirect(`/chamados/${ticket.id}`);

  const options = await loadFormOptions({
    institutionId: ticket.institution.id,
    responsibleId: ticket.responsible.id,
    plantId: ticket.plant.id,
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <header>
        <p className="font-mono text-xs font-bold text-sky-800">Nº {ticket.number}</p>
        <h1 className="text-xl font-bold text-ink-900">Editar chamado da concessionária</h1>
        <p className="text-sm text-ink-500">
          Alterações ficam registradas no histórico com data, hora e autor. Alterar a previsão
          recalcula o prazo a partir da abertura.
        </p>
      </header>

      <TicketForm
        ticketId={ticket.id}
        options={options}
        initial={{
          title: ticket.title,
          plantId: ticket.plant.id,
          institutionId: ticket.institution.id,
          responsibleId: ticket.responsible.id,
          expectedHours: formatCenti(ticket.expectedHoursCenti),
          protocol: ticket.protocol,
          description: ticket.description,
        }}
      />
    </div>
  );
}
