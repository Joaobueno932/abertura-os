import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type Option = { id: string; name: string; active?: boolean };
export type Options = { institutions: Option[]; responsibles: Option[]; plants: Option[] };

const order: Prisma.InstitutionOrderByWithRelationInput[] = [{ name: 'asc' }];

/**
 * Opcoes dos filtros: incluem cadastros inativos, para que OS antigas
 * continuem podendo ser filtradas por eles.
 */
export async function loadFilterOptions(): Promise<Options> {
  const [institutions, responsibles, plants] = await prisma.$transaction([
    prisma.institution.findMany({ orderBy: order, select: { id: true, name: true } }),
    prisma.responsible.findMany({ orderBy: order, select: { id: true, name: true } }),
    prisma.plant.findMany({ orderBy: order, select: { id: true, name: true } }),
  ]);
  return { institutions, responsibles, plants };
}

/**
 * Opcoes do formulario: apenas cadastros ativos. Ao editar uma OS, os cadastros
 * ja vinculados sao mantidos na lista mesmo se estiverem inativos, para nao
 * apagar a informacao historica ao salvar.
 */
export async function loadFormOptions(keep?: {
  institutionId?: string;
  responsibleId?: string;
  plantId?: string;
  /** Cadastros vinculados como tecnicos da OS em edicao. */
  technicianIds?: string[];
}): Promise<Options> {
  const keptResponsibles = [...new Set([keep?.responsibleId, ...(keep?.technicianIds ?? [])])].filter(
    (id): id is string => Boolean(id),
  );
  const [institutions, responsibles, plants] = await prisma.$transaction([
    prisma.institution.findMany({
      where: keep?.institutionId ? { OR: [{ active: true }, { id: keep.institutionId }] } : { active: true },
      orderBy: order,
      select: { id: true, name: true, active: true },
    }),
    prisma.responsible.findMany({
      where:
        keptResponsibles.length > 0
          ? { OR: [{ active: true }, { id: { in: keptResponsibles } }] }
          : { active: true },
      orderBy: order,
      select: { id: true, name: true, active: true },
    }),
    prisma.plant.findMany({
      where: keep?.plantId ? { OR: [{ active: true }, { id: keep.plantId }] } : { active: true },
      orderBy: order,
      select: { id: true, name: true, active: true },
    }),
  ]);
  return { institutions, responsibles, plants };
}

/**
 * Responsavel a ser pre-selecionado para quem esta abrindo o registro.
 *
 * O responsavel e quem responde pela OS - normalmente quem a abriu -, e nao o
 * tecnico que vai a campo. Primeiro tenta o vinculo explicito
 * (Responsible.userId); se nao houver, cai para um cadastro ativo com o mesmo
 * nome, o que cobre as bases anteriores ao vinculo. Devolve null quando nao ha
 * correspondencia: o campo continua editavel e obrigatorio.
 */
export async function findResponsibleForUser(user: {
  id: string;
  name: string;
}): Promise<string | null> {
  const linked = await prisma.responsible.findUnique({
    where: { userId: user.id },
    select: { id: true, active: true },
  });
  if (linked?.active) return linked.id;

  const byName = await prisma.responsible.findFirst({
    where: { active: true, name: { equals: user.name, mode: 'insensitive' } },
    select: { id: true },
  });
  // Só devolve cadastro ativo: um id fora da lista de opções deixaria o campo
  // parecendo preenchido e vazio ao mesmo tempo.
  return byName?.id ?? null;
}
