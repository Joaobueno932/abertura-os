import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { assertSameOrigin, badRequest, conflict, notFound, withErrorHandling } from '@/lib/http';
import { parseOrThrow, readJson } from '@/lib/validation/common';
import { userUpdateSchema } from '@/lib/validation/admin';
import { isUniqueViolation, prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { destroyAllSessions } from '@/lib/auth/session';
import { normalizeText } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await requireAdmin();
  assertSameOrigin(request);
  const { id } = await context.params;
  const input = parseOrThrow(userUpdateSchema.partial(), await readJson(request));

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!existing) throw notFound('Usuário não encontrado.');

  // Evita que o proprio administrador perca o acesso administrativo por engano.
  if (actor.id === id) {
    if (input.role !== undefined && input.role !== 'ADMIN') {
      throw badRequest('Você não pode remover o próprio perfil de administrador.');
    }
    if (input.active === false) {
      throw badRequest('Você não pode desativar o próprio usuário.');
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: normalizeText(input.name) } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
      select: publicFields,
    });

    // Trocar senha ou desativar encerra as sessoes abertas do usuario.
    if (input.password || input.active === false) await destroyAllSessions(id);

    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'email')) throw conflict('Já existe um usuário com esse e-mail.');
    throw error;
  }
});
