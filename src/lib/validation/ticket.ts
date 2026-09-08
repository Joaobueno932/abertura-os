import { z } from 'zod';
import { cuid, decimalCenti, requiredText } from './common';

/** Teto defensivo: 90 dias de previsao para solucao. */
const MAX_HOURS_CENTI = 24 * 90 * 100;

export const ticketBaseSchema = z.object({
  title: requiredText('Titulo', 160, 3),
  plantId: cuid('Usina'),
  institutionId: cuid('Cliente/Instituicao'),
  responsibleId: cuid('Responsavel'),
  /** Previsao em horas para a solucao, informada pela concessionaria. */
  expectedHours: decimalCenti('Previsao em horas', { min: 1, max: MAX_HOURS_CENTI }),
  /** Protocolo que a concessionaria fornece na abertura do chamado. */
  protocol: requiredText('Protocolo', 60, 2),
  description: requiredText('Descricao', 4000, 5),
});

export const createTicketSchema = ticketBaseSchema;
export const updateTicketSchema = ticketBaseSchema;

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
