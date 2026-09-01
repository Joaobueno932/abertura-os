import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/session';
import { ChangePasswordForm } from '@/components/change-password-form';

export const metadata: Metadata = { title: 'Definir nova senha' };
export const dynamic = 'force-dynamic';

/**
 * Fica fora do grupo (app) de proposito: o layout daquele grupo redireciona
 * para ca quando ha troca de senha pendente, e um layout aninhado criaria loop.
 */
export default async function TrocarSenhaPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const required = user.mustChangePassword;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-600 text-sm font-black tracking-tight text-white">
        O&amp;M
      </span>

      <h1 className="mt-6 text-xl font-bold text-ink-900">
        {required ? 'Defina sua senha de acesso' : 'Alterar senha'}
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        {required
          ? 'Sua conta foi criada com uma senha de provisionamento. Escolha uma nova senha para continuar.'
          : 'Escolha uma nova senha para a sua conta.'}
      </p>

      {required ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          Enquanto a senha inicial não for trocada, o sistema permanece bloqueado — inclusive pela
          API.
        </p>
      ) : null}

      <ChangePasswordForm />

      <p className="mt-8 text-xs text-ink-500">
        Conectado como <span className="font-medium text-ink-700">{user.email}</span>
      </p>
    </div>
  );
}
