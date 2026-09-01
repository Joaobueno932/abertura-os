import { z } from 'zod';
import { OS_STATUSES } from '@/lib/os/status';
import { cuid, dateOnly, decimalCenti, positiveInt, requiredText } from './common';

const MAX_HOURS_CENTI = 24 * 100 * 31; // teto defensivo
const MAX_KM_CENTI = 100_000 * 100;

export const osCostsSchema = z.object({
  technicianCount: positiveInt('Quantidade de tecnicos', 999),
  hoursPerTechnician: decimalCenti('Horas por tecnico', { min: 1, max: MAX_HOURS_CENTI }),
  outboundKm: decimalCenti('Quilometragem de ida', { min: 0, max: MAX_KM_CENTI }),
  returnKm: decimalCenti('Quilometragem de volta', { min: 0, max: MAX_KM_CENTI }),
});

export const osBaseSchema = z.object({
  title: requiredText('Titulo', 160, 3),
  plantId: cuid('Usina'),
  institutionId: cuid('Instituicao'),
  responsibleId: cuid('Responsavel'),
  expectedDate: dateOnly('Previsao de execucao'),
  location: requiredText('Local de atendimento', 200, 3),
  description: requiredText('Descricao', 4000, 5),
});

export const createOsSchema = osBaseSchema.merge(osCostsSchema);
export const updateOsSchema = osBaseSchema.merge(osCostsSchema);

export const changeStatusSchema = z.object({
  status: z.enum(OS_STATUSES, { errorMap: () => ({ message: 'Status inválido.' }) }),
});

export type CreateOsInput = z.infer<typeof createOsSchema>;
export type UpdateOsInput = z.infer<typeof updateOsSchema>;

export const osFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(OS_STATUSES).optional(),
  institutionId: z.string().trim().max(64).optional(),
  responsibleId: z.string().trim().max(64).optional(),
  plantId: z.string().trim().max(64).optional(),
  openedFrom: z.string().trim().max(10).optional(),
  openedTo: z.string().trim().max(10).optional(),
  expectedFrom: z.string().trim().max(10).optional(),
  expectedTo: z.string().trim().max(10).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type OsFilters = z.infer<typeof osFiltersSchema>;
