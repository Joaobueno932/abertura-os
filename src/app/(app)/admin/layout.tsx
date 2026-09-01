import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';

/**
 * Area administrativa. A restricao e aplicada no servidor; as rotas de API
 * administrativas repetem a verificacao com requireAdmin(), de modo que
 * esconder os links no frontend nunca e a unica barreira.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/trocar-senha');

  if (!isAdmin(user.role)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm font-semibold tracking-wide text-ink-500 uppercase">Acesso restrito</p>
        <h1 className="mt-2 text-xl font-bold text-ink-900">
          Esta área é exclusiva de administradores
        </h1>
        <p className="mt-2 text-sm text-ink-700">
          Seu perfil não possui permissão para acessar os cadastros administrativos. Fale com um
          administrador se precisar desse acesso.
        </p>
        <Link href="/painel" className="btn-primary mt-6">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
