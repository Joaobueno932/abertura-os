import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Usinas' };
export const dynamic = 'force-dynamic';

const config: CrudConfig = {
  endpoint: '/api/admin/usinas',
  singular: 'Usina',
  plural: 'Usinas',
  newLabel: 'Nova usina',
  editLabel: 'Editar usina',
  allowDelete: true,
  emptyMessage: 'Cadastre as usinas atendidas para que possam ser selecionadas na abertura de uma OS.',
  columns: [
    { key: 'name', label: 'Nome' },
    { key: 'location', label: 'Localização' },
    { key: 'active', label: 'Situação', type: 'active' },
    { key: '_count.serviceOrders', label: 'OS vinculadas', type: 'count', align: 'right' },
  ],
  fields: [
    { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Usina Solar Campo Grande I' },
    { name: 'location', label: 'Localização', type: 'text', placeholder: 'Campo Grande / MS' },
    { name: 'active', label: 'Ativa para novas OS', type: 'checkbox', defaultValue: true },
  ],
};

export default async function UsinasPage() {
  const items = await prisma.plant.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      location: true,
      active: true,
      _count: { select: { serviceOrders: true } },
    },
  });

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Usinas</h1>
        <p className="text-sm text-ink-500">
          Usinas inativas não aparecem para seleção em novas OS, mas permanecem nas OS anteriores.
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
