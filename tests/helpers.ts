import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { DEFAULT_RATES, SETTING_KEYS } from '@/lib/rates';
import type { SessionUser } from '@/lib/auth/session';

/** Limpa o banco de teste respeitando a ordem das chaves estrangeiras. */
export async function resetDatabase(): Promise<void> {
  await prisma.serviceOrderEvent.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.orderSequence.deleteMany();
  await prisma.responsible.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.plant.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(
  overrides: Partial<{
    email: string;
    name: string;
    role: 'ADMIN' | 'USER';
    mustChangePassword: boolean;
  }> = {},
): Promise<SessionUser> {
  const email = overrides.email ?? `user-${Math.random().toString(36).slice(2, 10)}@teste.local`;
  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? 'Usuario de Teste',
      role: overrides.role ?? 'USER',
      mustChangePassword: overrides.mustChangePassword ?? false,
      passwordHash: await hashPassword('SenhaDeTeste@123'),
    },
    select: { id: true, name: true, email: true, role: true, mustChangePassword: true },
  });
  return { ...user, role: user.role as 'ADMIN' | 'USER' };
}

export async function seedRates(): Promise<void> {
  const entries: Array<[string, number]> = [
    [SETTING_KEYS.technicalHourlyRateCents, DEFAULT_RATES.technicalHourlyRateCents],
    [SETTING_KEYS.kmRateCents, DEFAULT_RATES.kmRateCents],
  ];
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
  }
}

/** Cadastros minimos necessarios para abrir uma OS. */
export async function seedCatalog() {
  const [institution, responsible, plant] = await Promise.all([
    prisma.institution.create({ data: { name: 'FIEMS' }, select: { id: true, name: true } }),
    prisma.responsible.create({
      data: { name: 'Joao Pinheiro' },
      select: { id: true, name: true },
    }),
    prisma.plant.create({
      data: { name: 'Usina Solar Campo Grande I', location: 'Campo Grande / MS' },
      select: { id: true, name: true },
    }),
  ]);
  return { institution, responsible, plant };
}

type Catalog = Awaited<ReturnType<typeof seedCatalog>>;

/** Payload do cenario obrigatorio de validacao (2 tecnicos, 3 h, 200 + 200 km). */
export function osPayload(catalog: Catalog, overrides: Record<string, unknown> = {}) {
  return {
    title: 'manutenção preventiva',
    plantId: catalog.plant.id,
    institutionId: catalog.institution.id,
    responsibleId: catalog.responsible.id,
    expectedDate: '2026-09-15',
    location: 'Usina Solar Campo Grande I',
    description: 'Realizar manutenção preventiva e inspeção dos equipamentos.',
    technicianCount: '2',
    hoursPerTechnician: '3',
    outboundKm: '200',
    returnKm: '200',
    ...overrides,
  };
}

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
