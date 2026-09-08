import { z } from 'zod';
import { requiredText } from './common';
import { ROLES } from '@/lib/auth/roles';
import { decimalCenti } from './common';

export const institutionSchema = z.object({
  name: requiredText('Nome do cliente/instituicao', 120, 2),
  active: z.boolean().optional().default(true),
});

/** Motivos oferecidos ao cancelar uma OS ou um chamado da concessionaria. */
export const cancellationReasonSchema = z.object({
  label: requiredText('Motivo', 120, 3),
  active: z.boolean().optional().default(true),
});

export const responsibleSchema = z.object({
  name: requiredText('Nome do responsavel', 120, 2),
  active: z.boolean().optional().default(true),
  userId: z.string().trim().max(64).nullish(),
});

export const plantSchema = z.object({
  name: requiredText('Nome da usina', 120, 2),
  location: z.string().trim().max(200).nullish(),
  active: z.boolean().optional().default(true),
});

export const userSchema = z.object({
  name: requiredText('Nome', 120, 2),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(160),
  password: z
    .string()
    .min(10, 'A senha deve ter pelo menos 10 caracteres.')
    .max(200, 'Senha muito longa.'),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Perfil inválido.' }) }),
  active: z.boolean().optional().default(true),
});

export const userUpdateSchema = userSchema.partial({ password: true });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(160),
  password: z.string().min(1, 'Informe a senha.').max(200),
});

export const ratesSchema = z.object({
  technicalHourlyRate: decimalCenti('Valor da hora tecnica', { min: 0, max: 100_000_00 }),
  kmRate: decimalCenti('Valor do quilometro', { min: 0, max: 100_000_00 }),
});

/** Troca de senha do proprio usuario (inclusive a obrigatoria do 1o acesso). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.').max(200),
    newPassword: z
      .string()
      .min(10, 'A nova senha deve ter pelo menos 10 caracteres.')
      .max(200, 'Senha muito longa.'),
    confirmPassword: z.string().max(200),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'A confirmação não confere com a nova senha.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'A nova senha deve ser diferente da atual.',
    path: ['newPassword'],
  });
