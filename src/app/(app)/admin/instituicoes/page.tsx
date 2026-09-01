import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Instituições' };
export const dynamic = 'force-dynamic';

const config: CrudConfig = {
  endpoint: '/api/admin/instituicoes',
  singular: 'Instituição',
  plural: 'Instituições',
  newLabel: 'Nova instituição',
  editLabel: 'Editar instituição',
  allowDelete: true,
  emptyMessage: 'Cadastre as instituições que poderão ser selecionadas na abertura de uma OS.',
  columns: [
    { key: 'name', label: 'Nome' },
    { key: 'active', label: 'Situação', type: 'active' },
    { key: '_count.serviceOrders', label: 'OS vinculadas', type: 'count', align: 'right' },
  ],
  fields: [
    { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'FIEMS' },
    { name: 'active', label: 'Ativa para novas OS', type: 'checkbox', defaultValue: true },
  ],
};

export default async function InstituicoesPage() {
  const items = await prisma.institution.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { serviceOrders: true } },
    },
  });

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Instituições</h1>
        <p className="text-sm text-ink-500">
          Instituições inativas não aparecem para seleção em novas OS, mas continuam visíveis nas OS
          que já as utilizavam.
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
