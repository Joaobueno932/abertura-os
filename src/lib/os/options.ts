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
}): Promise<Options> {
  const [institutions, responsibles, plants] = await prisma.$transaction([
    prisma.institution.findMany({
      where: keep?.institutionId ? { OR: [{ active: true }, { id: keep.institutionId }] } : { active: true },
      orderBy: order,
      select: { id: true, name: true, active: true },
    }),
    prisma.responsible.findMany({
      where: keep?.responsibleId ? { OR: [{ active: true }, { id: keep.responsibleId }] } : { active: true },
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
