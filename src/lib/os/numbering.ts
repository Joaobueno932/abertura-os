import type { Prisma, PrismaClient } from '@prisma/client';
import { businessDayKey } from '@/lib/datetime';

export type TransactionClient = Prisma.TransactionClient | PrismaClient;

const SEQUENCE_DIGITS = 3;
export const MAX_DAILY_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1; // 999

/** Monta AAAAMMDDNNN a partir do dia de negocio e da sequencia. */
export function formatOsNumber(day: string, sequence: number): string {
  if (!/^\d{8}$/.test(day)) throw new Error(`Dia de negocio invalido: ${day}`);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Sequencia invalida: ${sequence}`);
  }
  if (sequence > MAX_DAILY_SEQUENCE) {
    throw new Error('Limite de 999 Ordens de Serviço para o mesmo dia foi atingido.');
  }
  return `${day}${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

/** Decompoe AAAAMMDDNNN de volta em dia e sequencia. */
export function parseOsNumber(number: string): { day: string; sequence: number } | null {
  if (!/^\d{11}$/.test(number)) return null;
  return { day: number.slice(0, 8), sequence: Number(number.slice(8)) };
}

/**
 * Reserva o proximo numero do dia DENTRO de uma transacao.
 *
 * O upsert com `increment` e compilado pelo Prisma para um unico comando nativo
 * do PostgreSQL:
 *
 *   INSERT INTO "OrderSequence" ("day", "lastSeq") VALUES ($1, 1)
 *   ON CONFLICT ("day") DO UPDATE SET "lastSeq" = "OrderSequence"."lastSeq" + 1
 *   RETURNING "lastSeq"
 *
 * Nao ha janela entre ler e escrever, como haveria em um SELECT seguido de
 * UPDATE: duas transacoes concorrentes nunca recebem o mesmo valor. A primeira
 * insere ou incrementa e mantem o lock da linha ate o commit; a segunda espera
 * esse lock e le o valor ja incrementado.
 *
 * Usa a API tipada do Prisma, e nao $queryRaw, de proposito: SQL cru nao e
 * qualificado com o schema da conexao (`?schema=`), o que faria a reserva cair
 * no schema errado em qualquer ambiente que nao use o padrao.
 *
 * A constraint UNIQUE de ServiceOrder.number continua sendo a garantia final, e
 * o chamador faz retry em caso de colisao.
 *
 * Nunca gerar esse numero no frontend.
 */
export async function reserveOsNumber(
  tx: TransactionClient,
  now: Date = new Date(),
): Promise<{ number: string; day: string; sequence: number }> {
  const day = businessDayKey(now);

  const { lastSeq } = await tx.orderSequence.upsert({
    where: { day },
    create: { day, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  return { number: formatOsNumber(day, lastSeq), day, sequence: lastSeq };
}
