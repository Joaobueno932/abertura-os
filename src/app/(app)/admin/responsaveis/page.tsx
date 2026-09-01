import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Responsáveis' };
export const dynamic = 'force-dynamic';

export default async function ResponsaveisPage() {
  const [items, users] = await prisma.$transaction([
    prisma.responsible.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        active: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { serviceOrders: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const config: CrudConfig = {
    endpoint: '/api/admin/responsaveis',
    singular: 'Responsável',
    plural: 'Responsáveis',
    newLabel: 'Novo responsável',
    editLabel: 'Editar responsável',
    allowDelete: true,
    emptyMessage: 'Cadastre os responsáveis que poderão ser selecionados na abertura de uma OS.',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'user.name', label: 'Usuário vinculado' },
      { key: 'active', label: 'Situação', type: 'active' },
      { key: '_count.serviceOrders', label: 'OS vinculadas', type: 'count', align: 'right' },
    ],
    fields: [
      { name: 'name', label: 'Nome', type: 'text', required: true },
      {
        name: 'userId',
        label: 'Usuário do sistema',
        type: 'select',
        help: 'Vínculo opcional. Cada usuário pode estar ligado a um único responsável.',
        options: users.map((user) => ({ value: user.id, label: `${user.name} (${user.email})` })),
      },
      { name: 'active', label: 'Ativo para novas OS', type: 'checkbox', defaultValue: true },
    ],
  };

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Responsáveis</h1>
        <p className="text-sm text-ink-500">
          Responsáveis inativos não aparecem para seleção em novas OS, mas permanecem registrados nas
          OS anteriores.
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
