import { z } from 'zod';
import { MAX_COMPLETION_NOTE_LENGTH, OS_STATUSES } from '@/lib/os/status';
import { cuid, dateOnly, decimalCenti, openedDateOnly, positiveInt, requiredText } from './common';

const MAX_HOURS_CENTI = 24 * 100 * 31; // teto defensivo
const MAX_KM_CENTI = 100_000 * 100;

/**
 * Tecnico do atendimento: ou vem de um cadastro (vinculo), ou e digitado.
 * Quando ha vinculo o nome e resolvido no servidor a partir do cadastro.
 */
export const technicianSchema = z
  .object({
    responsibleId: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => (typeof value === 'string' ? value.trim() : '')),
    name: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => (typeof value === 'string' ? value.trim() : '')),
  })
  .superRefine((technician, ctx) => {
    if (technician.responsibleId) {
      if (technician.responsibleId.length > 64) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Técnico inválido.', path: ['responsibleId'] });
      }
      return;
    }
    if (technician.name.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o nome do técnico ou selecione um cadastro.',
        path: ['name'],
      });
    }
    if (technician.name.length > 120) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nome do técnico deve ter no máximo 120 caracteres.',
        path: ['name'],
      });
    }
  });

export type TechnicianInput = z.infer<typeof technicianSchema>;

export const osCostsSchema = z.object({
  technicianCount: positiveInt('Quantidade de tecnicos', 999),
  hoursPerTechnician: decimalCenti('Horas por tecnico', { min: 1, max: MAX_HOURS_CENTI }),
  outboundKm: decimalCenti('Quilometragem de ida', { min: 0, max: MAX_KM_CENTI }),
  returnKm: decimalCenti('Quilometragem de volta', { min: 0, max: MAX_KM_CENTI }),
});

export const osBaseSchema = z.object({
  title: requiredText('Titulo', 160, 3),
  plantId: cuid('Usina'),
  institutionId: cuid('Cliente/Instituicao'),
  responsibleId: cuid('Responsavel'),
  expectedDate: dateOnly('Previsao de execucao'),
  location: requiredText('Local de atendimento', 200, 3),
  description: requiredText('Descricao', 4000, 5),
  technicians: z.array(technicianSchema).min(1, 'Informe ao menos um técnico.').max(999),
});

/**
 * A lista de tecnicos precisa ter exatamente a quantidade informada: o campo
 * "Quantidade de tecnicos" alimenta o calculo do valor, e o formulario abre um
 * campo por tecnico. Divergencia entre os dois seria custo cobrado sem pessoa.
 */
const osFullSchema = osBaseSchema.merge(osCostsSchema).superRefine((data, ctx) => {
  if (data.technicians.length !== data.technicianCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe um técnico para cada uma das vagas indicadas em "Quantidade de técnicos".',
      path: ['technicians'],
    });
  }
});

/** Na abertura cabe a data retroativa; na edicao nao, ela fixaria outro numero. */
export const createOsSchema = osBaseSchema
  .merge(osCostsSchema)
  .extend({ openedDate: openedDateOnly })
  .superRefine((data, ctx) => {
    if (data.technicians.length !== data.technicianCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe um técnico para cada uma das vagas indicadas em "Quantidade de técnicos".',
        path: ['technicians'],
      });
    }
  });
export const updateOsSchema = osFullSchema;

/**
 * Movimentacao de status. O motivo do cancelamento, a observacao de finalizacao
 * e a justificativa de reabertura sao exigidos conforme o status de
 * origem/destino - a checagem final acontece no servico, que conhece o status
 * atual do registro.
 */
export const changeStatusSchema = z.object({
  status: z.enum(OS_STATUSES, { errorMap: () => ({ message: 'Status inválido.' }) }),
  /** Motivo cadastrado, obrigatorio ao cancelar. */
  cancellationReasonId: z.string().trim().max(64).optional(),
  /** Justificativa escrita, obrigatoria ao retroceder um registro encerrado. */
  reason: z.string().trim().max(500).optional(),
  /** Observacao escrita, obrigatoria ao concluir. */
  completionNote: z.string().trim().max(MAX_COMPLETION_NOTE_LENGTH).optional(),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type CreateOsInput = z.infer<typeof createOsSchema>;
export type UpdateOsInput = z.infer<typeof updateOsSchema>;

/** Tipos de registro que dividem o quadro e as listagens. */
export const RECORD_KINDS = ['OS', 'CHAMADO'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const osFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(OS_STATUSES).optional(),
  /** Ausente = OS e chamados da concessionaria juntos. */
  tipo: z.enum(RECORD_KINDS).optional(),
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
