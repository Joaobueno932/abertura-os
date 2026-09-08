import { prisma } from '@/lib/prisma';

export type CancellationReasonOption = { id: string; label: string; active: boolean };

/**
 * Motivos disponiveis para cancelar uma OS ou um chamado.
 *
 * Motivos inativos nao aparecem para novos cancelamentos, mas o motivo ja
 * gravado em um registro continua na lista (`keep`) para nao sumir da tela
 * nem ser perdido ao salvar - mesma regra dos demais cadastros.
 */
export async function loadCancellationReasons(
  keep?: string | null,
): Promise<CancellationReasonOption[]> {
  return prisma.cancellationReason.findMany({
    where: keep ? { OR: [{ active: true }, { id: keep }] } : { active: true },
    orderBy: { label: 'asc' },
    select: { id: true, label: true, active: true },
  });
}
