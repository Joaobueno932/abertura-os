import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Motivos de cancelamento' };
export const dynamic = 'force-dynamic';

const config: CrudConfig = {
  endpoint: '/api/admin/motivos-cancelamento',
  singular: 'Motivo',
  plural: 'Motivos de cancelamento',
  newLabel: 'Novo motivo',
  editLabel: 'Editar motivo',
  allowDelete: true,
  emptyMessage: 'Cadastre os motivos que poderão ser escolhidos ao cancelar uma OS ou um chamado.',
  columns: [
    { key: 'label', label: 'Motivo' },
    { key: 'active', label: 'Situação', type: 'active' },
    { key: '_count.serviceOrders', label: 'OS canceladas', type: 'count', align: 'right' },
    { key: '_count.utilityTickets', label: 'Chamados', type: 'count', align: 'right' },
  ],
  fields: [
    {
      name: 'label',
      label: 'Motivo',
      type: 'text',
      required: true,
      placeholder: 'Problema resolvido remotamente',
    },
    { name: 'active', label: 'Disponível para novos cancelamentos', type: 'checkbox', defaultValue: true },
  ],
};

export default async function MotivosCancelamentoPage() {
  const items = await prisma.cancellationReason.findMany({
    orderBy: [{ active: 'desc' }, { label: 'asc' }],
    select: {
      id: true,
      label: true,
      active: true,
      _count: { select: { serviceOrders: true, utilityTickets: true } },
    },
  });

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Motivos de cancelamento</h1>
        <p className="text-sm text-ink-500">
          Cancelar uma OS ou um chamado exige escolher um destes motivos. Acrescente novas opções
          quando precisar: motivos já usados não são excluídos, apenas desativados, para que o
          histórico continue legível.
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
