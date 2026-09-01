import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { ROLES, ROLE_LABEL } from '@/lib/auth/roles';
import { CrudManager, type CrudConfig } from '@/components/admin/crud-manager';

export const metadata: Metadata = { title: 'Usuários' };
export const dynamic = 'force-dynamic';

const config: CrudConfig = {
  endpoint: '/api/admin/usuarios',
  singular: 'Usuário',
  plural: 'Usuários',
  newLabel: 'Novo usuário',
  editLabel: 'Editar usuário',
  // Usuarios sao sempre desativados, nunca excluidos: eles assinam o historico das OS.
  allowDelete: false,
  emptyMessage: 'Nenhum usuário cadastrado.',
  columns: [
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
    { key: 'roleLabel', label: 'Perfil' },
    { key: 'active', label: 'Situação', type: 'active' },
  ],
  fields: [
    { name: 'name', label: 'Nome', type: 'text', required: true },
    { name: 'email', label: 'E-mail', type: 'email', required: true },
    {
      name: 'password',
      label: 'Senha',
      type: 'password',
      required: true,
      optionalOnEdit: true,
      help: 'Mínimo de 10 caracteres. Ao editar, deixe em branco para manter a senha atual.',
    },
    {
      name: 'role',
      label: 'Perfil',
      type: 'select',
      required: true,
      defaultValue: 'USER',
      options: ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
    },
    { name: 'active', label: 'Ativo', type: 'checkbox', defaultValue: true },
  ],
};

export default async function UsuariosPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  const items = users.map((user) => ({
    ...user,
    roleLabel: ROLE_LABEL[user.role as (typeof ROLES)[number]] ?? user.role,
  }));

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-bold text-ink-900">Usuários</h1>
        <p className="text-sm text-ink-500">
          Administradores acessam os cadastros auxiliares e as configurações. Usuários comuns podem
          abrir, editar e movimentar Ordens de Serviço.
        </p>
      </header>
      <CrudManager config={config} items={items} />
    </div>
  );
}
