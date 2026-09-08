import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Usinas' };
export const dynamic = 'force-dynamic';

/**
 * Cadastro de usinas. Mesma regra dos clientes/instituicoes: qualquer usuario
 * cadastra, so administrador altera, desativa ou exclui - verificado tambem na
 * API.
 */
export default async function UsinasPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const admin = isAdmin(user.role);

  const items = await prisma.plant.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      location: true,
      active: true,
      _count: { select: { serviceOrders: true, utilityTickets: true } },
    },
  });

  const config: CrudConfig = {
    endpoint: '/api/cadastros/usinas',
    singular: 'Usina',
    plural: 'Usinas',
    newLabel: 'Nova usina',
    editLabel: 'Editar usina',
    allowDelete: admin,
    allowEdit: admin,
    allowToggle: admin,
    emptyMessage:
      'Cadastre as usinas atendidas para que possam ser selecionadas na abertura de uma OS ou de um chamado.',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'location', label: 'Localização' },
      { key: 'active', label: 'Situação', type: 'active' },
      { key: '_count.serviceOrders', label: 'OS vinculadas', type: 'count', align: 'right' },
      { key: '_count.utilityTickets', label: 'Chamados', type: 'count', align: 'right' },
    ],
    fields: [
      {
        name: 'name',
        label: 'Nome',
        type: 'text',
        required: true,
        placeholder: 'Usina Solar Campo Grande I',
      },
      { name: 'location', label: 'Localização', type: 'text', placeholder: 'Campo Grande / MS' },
      { name: 'active', label: 'Ativa para novos registros', type: 'checkbox', defaultValue: true },
    ],
  };

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Usinas</h1>
        <p className="text-sm text-ink-500">
          Usinas inativas não aparecem para seleção em novos registros, mas permanecem nas OS e
          chamados anteriores.
          {admin
            ? ''
            : ' Seu perfil pode cadastrar novas usinas; alterar e excluir são ações de administrador.'}
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
