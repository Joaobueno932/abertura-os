import { AppError, forbidden, unauthorized } from '@/lib/http';
import { getSessionUser, type SessionUser } from './session';
import { isAdmin } from './roles';

/** Codigo devolvido enquanto a troca de senha obrigatoria nao for concluida. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Exige apenas uma sessao valida, sem checar a troca de senha pendente.
 * Usado pelos poucos endpoints que precisam funcionar nesse estado: encerrar a
 * sessao e definir a nova senha.
 */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/**
 * Exige uma sessao valida e utilizavel. Usado por TODAS as rotas de API que nao
 * sejam publicas - a autorizacao nunca depende apenas do frontend.
 *
 * Enquanto a senha de provisionamento nao for trocada, a credencial inicial nao
 * opera o sistema: a restricao vale para a API, nao so para a interface.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.mustChangePassword) {
    throw new AppError(
      'Defina uma nova senha antes de usar o sistema.',
      403,
      PASSWORD_CHANGE_REQUIRED,
    );
  }
  return user;
}

/** Exige sessao valida com papel de administrador, validado no servidor. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw forbidden('Operação restrita a administradores.');
  return user;
}
