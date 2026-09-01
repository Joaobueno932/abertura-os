import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';

/**
 * Guarda de autenticacao do modulo. A verificacao ocorre no servidor a cada
 * navegacao; as rotas de API repetem a checagem por conta propria.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // Credencial de provisionamento: nada do modulo abre antes da troca de senha.
  // A API aplica a mesma regra em requireUser(), entao isto nao e a unica barreira.
  if (user.mustChangePassword) redirect('/trocar-senha');
  return <AppShell user={user}>{children}</AppShell>;
}
