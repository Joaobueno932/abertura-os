import { z } from 'zod';
import { parseToCenti } from '@/lib/money';
import { parseDateOnly } from '@/lib/datetime';
import { badRequest } from '@/lib/http';

/** Texto obrigatorio com limites de tamanho. */
export const requiredText = (label: string, max: number, min = 2) =>
  z
    .string({ required_error: `${label} é obrigatório.`, invalid_type_error: `${label} é obrigatório.` })
    .trim()
    .min(min, `${label} deve ter pelo menos ${min} caracteres.`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

export const cuid = (label: string) =>
  z
    .string({ required_error: `${label} é obrigatório.`, invalid_type_error: `${label} é obrigatório.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(64, `${label} inválido.`);

/** Aceita "3,5" | "3.5" | 3.5 e devolve centesimos inteiros. */
export const decimalCenti = (label: string, opts: { min: number; max: number }) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const centi = parseToCenti(value);
    if (centi === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} inválido. Use até 2 casas decimais.` });
      return z.NEVER;
    }
    if (centi < opts.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          opts.min > 0 ? `${label} deve ser maior que zero.` : `${label} não pode ser negativo.`,
      });
      return z.NEVER;
    }
    if (centi > opts.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} excede o limite permitido.` });
      return z.NEVER;
    }
    return centi;
  });

/** Inteiro positivo, aceitando string numerica vinda de formulario. */
export const positiveInt = (label: string, max: number) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const raw = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} deve ser um número inteiro.` });
      return z.NEVER;
    }
    if (raw <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} deve ser maior que zero.` });
      return z.NEVER;
    }
    if (raw > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} excede o limite permitido.` });
      return z.NEVER;
    }
    return raw;
  });

/** "AAAA-MM-DD" -> Date ancorado ao meio-dia UTC. */
export const dateOnly = (label: string) =>
  z
    .string({ required_error: `${label} é obrigatória.`, invalid_type_error: `${label} é obrigatória.` })
    .transform((value, ctx) => {
      const parsed = parseDateOnly(value);
      if (!parsed) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} inválida.` });
        return z.NEVER;
      }
      return parsed;
    });

/** Converte erros do zod em AppError 400 com mapa de campos para o formulario. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = result.error.issues[0]?.message ?? 'Dados inválidos.';
  throw badRequest(first, fields);
}

/** Le o corpo JSON de forma defensiva. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest('Corpo da requisição inválido.');
  }
}
