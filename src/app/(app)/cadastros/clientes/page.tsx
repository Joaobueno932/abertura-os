import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Clientes/Instituições' };
export const dynamic = 'force-dynamic';

/**
 * Cadastro de clientes/instituicoes.
 *
 * Aberto a qualquer usuario autenticado para CADASTRAR - quem abre uma OS
 * precisa poder incluir um cliente novo na hora. Alterar, desativar e excluir
 * continuam sendo acoes de administrador, e as rotas de API repetem a
 * verificacao: esconder o botao nunca e a unica barreira.
 */
export default async function ClientesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const admin = isAdmin(user.role);

  const items = await prisma.institution.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { serviceOrders: true, utilityTickets: true } },
    },
  });

  const config: CrudConfig = {
    endpoint: '/api/cadastros/instituicoes',
    singular: 'Cliente/Instituição',
    plural: 'Clientes/Instituições',
    newLabel: 'Novo cliente/instituição',
    editLabel: 'Editar cliente/instituição',
    allowDelete: admin,
    allowEdit: admin,
    allowToggle: admin,
    emptyMessage:
      'Cadastre os clientes/instituições que poderão ser selecionados na abertura de uma OS ou de um chamado.',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'active', label: 'Situação', type: 'active' },
      { key: '_count.serviceOrders', label: 'OS vinculadas', type: 'count', align: 'right' },
      { key: '_count.utilityTickets', label: 'Chamados', type: 'count', align: 'right' },
    ],
    fields: [
      { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'FIEMS' },
      { name: 'active', label: 'Ativo para novos registros', type: 'checkbox', defaultValue: true },
    ],
  };

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Clientes/Instituições</h1>
        <p className="text-sm text-ink-500">
          Clientes inativos não aparecem para seleção em novos registros, mas continuam visíveis nas
          OS e chamados que já os utilizavam.
          {admin
            ? ''
            : ' Seu perfil pode cadastrar novos clientes; alterar e excluir são ações de administrador.'}
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
