import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServiceOrderDetail } from '@/lib/os/service';
import { loadFormOptions } from '@/lib/os/options';
import { getRates } from '@/lib/settings';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { toDateInputValue } from '@/lib/datetime';
import { formatCenti } from '@/lib/money';
import { OsForm } from '@/components/os-form';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const order = await getServiceOrderDetail(id);
  return { title: order ? `Editar OS ${order.number}` : 'Editar Ordem de Serviço' };
}

export default async function EditarOsPage({ params }: { params: Params }) {
  const { id } = await params;
  const [order, user] = await Promise.all([getServiceOrderDetail(id), getSessionUser()]);
  if (!order || !user) notFound();

  // OS cancelada so pode ser editada por administrador (regra repetida no backend).
  if (order.status === 'CANCELADA' && !isAdmin(user.role)) redirect(`/os/${order.id}`);

  const [options, rates] = await Promise.all([
    loadFormOptions({
      institutionId: order.institution.id,
      responsibleId: order.responsible.id,
      plantId: order.plant.id,
    }),
    getRates(),
  ]);

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <header>
        <p className="font-mono text-xs font-bold text-brand-600">Nº {order.number}</p>
        <h1 className="text-xl font-bold text-ink-900">Editar Ordem de Serviço</h1>
        <p className="text-sm text-ink-500">
          Alterações ficam registradas no histórico com data, hora e autor.
        </p>
      </header>

      <OsForm
        osId={order.id}
        options={options}
        rates={rates}
        initial={{
          title: order.title,
          plantId: order.plant.id,
          institutionId: order.institution.id,
          responsibleId: order.responsible.id,
          expectedDate: toDateInputValue(order.expectedDate),
          location: order.location,
          description: order.description,
          technicianCount: String(order.technicianCount),
          hoursPerTechnician: formatCenti(order.hoursPerTechnicianCenti),
          outboundKm: formatCenti(order.outboundKmCenti),
          returnKm: formatCenti(order.returnKmCenti),
        }}
      />
    </div>
  );
}
