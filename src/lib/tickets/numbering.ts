import { businessDayKey } from '@/lib/datetime';
import type { TransactionClient } from '@/lib/os/numbering';

const SEQUENCE_DIGITS = 3;
export const MAX_DAILY_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1; // 999

/** Prefixo que distingue um chamado da concessionaria de uma OS. */
export const TICKET_PREFIX = 'CH';

/** Monta CHAAAAMMDDNNN a partir do dia de negocio e da sequencia. */
export function formatTicketNumber(day: string, sequence: number): string {
  if (!/^\d{8}$/.test(day)) throw new Error(`Dia de negocio invalido: ${day}`);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Sequencia invalida: ${sequence}`);
  }
  if (sequence > MAX_DAILY_SEQUENCE) {
    throw new Error('Limite de 999 chamados da concessionária para o mesmo dia foi atingido.');
  }
  return `${TICKET_PREFIX}${day}${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

/**
 * Reserva o proximo numero do dia DENTRO de uma transacao, com a mesma garantia
 * atomica da numeracao das OS (INSERT ... ON CONFLICT DO UPDATE ... RETURNING).
 *
 * O contador e proprio dos chamados: compartilhar a sequencia com as OS deixaria
 * buracos nas duas numeracoes. Nunca gerar esse numero no frontend.
 */
export async function reserveTicketNumber(
  tx: TransactionClient,
  now: Date = new Date(),
): Promise<{ number: string; day: string; sequence: number }> {
  const day = businessDayKey(now);

  const { lastSeq } = await tx.ticketSequence.upsert({
    where: { day },
    create: { day, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  return { number: formatTicketNumber(day, lastSeq), day, sequence: lastSeq };
}
