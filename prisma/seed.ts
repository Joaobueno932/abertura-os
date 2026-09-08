import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { DEFAULT_RATES, SETTING_KEYS } from '../src/lib/rates';
import { DEFAULT_CANCELLATION_REASONS } from '../src/lib/os/cancellation-reasons';

/**
 * Seed idempotente do O&M OS.
 *
 * Pode ser executado quantas vezes for necessario: nao duplica registros nem
 * sobrescreve dados existentes. Em especial, NUNCA redefine a senha de um
 * administrador que ja exista - rodar o seed em producao e seguro.
 */
const prisma = new PrismaClient();

/** Clientes/instituicoes iniciais. Ficam no banco, nunca hardcoded no frontend. */
const INSTITUTIONS = ['SESI', 'SENAI', 'FIEMS', 'SEMAPA', 'ADILSON'];

const MIN_PASSWORD_LENGTH = 10;

/**
 * Provisiona o primeiro administrador a partir de variaveis de ambiente.
 * Nao existe senha padrao: sem INITIAL_ADMIN_PASSWORD o seed falha.
 * O usuario criado nasce com mustChangePassword, entao a credencial de
 * provisionamento so serve para o primeiro acesso.
 */
async function seedAdmin(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador';

  if (!email) {
    throw new Error(
      'INITIAL_ADMIN_EMAIL nao definida. Configure-a no ambiente antes de rodar o seed.',
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (existing) {
    console.log('[seed] administrador ja existe; senha preservada.');
    return;
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `INITIAL_ADMIN_PASSWORD ausente ou com menos de ${MIN_PASSWORD_LENGTH} caracteres. ` +
        'Defina uma senha forte no ambiente; nao existe senha padrao.',
    );
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: 'ADMIN',
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  console.log('[seed] administrador criado; troca de senha obrigatoria no primeiro acesso.');
}

async function seedInstitutions(): Promise<void> {
  for (const name of INSTITUTIONS) {
    await prisma.institution.upsert({ where: { name }, create: { name }, update: {} });
  }
  console.log(`[seed] instituicoes garantidas: ${INSTITUTIONS.join(', ')}`);
}

/**
 * Motivos de cancelamento de fabrica. Um administrador pode acrescentar outros
 * em /admin/motivos-cancelamento; o upsert vazio preserva o que ja existe,
 * inclusive um motivo que tenha sido desativado de proposito.
 */
async function seedCancellationReasons(): Promise<void> {
  for (const label of DEFAULT_CANCELLATION_REASONS) {
    await prisma.cancellationReason.upsert({ where: { label }, create: { label }, update: {} });
  }
  console.log(`[seed] motivos de cancelamento garantidos: ${DEFAULT_CANCELLATION_REASONS.length}`);
}

/**
 * Garante os valores de fabrica sem sobrescrever ajustes ja feitos por um
 * administrador (update vazio no upsert).
 */
async function seedRates(): Promise<void> {
  const entries: Array<[string, number]> = [
    [SETTING_KEYS.technicalHourlyRateCents, DEFAULT_RATES.technicalHourlyRateCents],
    [SETTING_KEYS.kmRateCents, DEFAULT_RATES.kmRateCents],
  ];
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: {},
    });
  }
  console.log('[seed] valores padrao garantidos: hora tecnica R$ 150,00 | km R$ 1,50');
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedInstitutions();
  await seedCancellationReasons();
  await seedRates();
  console.log(
    '[seed] concluido. Cadastre usinas em /cadastros/usinas e responsaveis em /admin/responsaveis ' +
      'antes de abrir a primeira OS.',
  );
}

main()
  .catch((error) => {
    console.error('[seed] falhou:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
