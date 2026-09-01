import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As rotas administrativas sao chamadas diretamente, como faria um cliente HTTP
 * qualquer: o objetivo e provar que a restricao NAO depende de esconder links no
 * frontend. A unica coisa simulada e a leitura da sessao.
 */
const sessionMock = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, getSessionUser: async () => sessionMock.current };
});

const { prisma } = await import('@/lib/prisma');
const { createUser, jsonRequest, osPayload, resetDatabase, seedCatalog, seedRates } = await import(
  './helpers'
);

const institutions = await import('@/app/api/admin/instituicoes/route');
const institutionById = await import('@/app/api/admin/instituicoes/[id]/route');
const responsibles = await import('@/app/api/admin/responsaveis/route');
const plants = await import('@/app/api/admin/usinas/route');
const users = await import('@/app/api/admin/usuarios/route');
const settings = await import('@/app/api/admin/configuracoes/route');
const osRoute = await import('@/app/api/os/route');
const osById = await import('@/app/api/os/[id]/route');

type Session = Awaited<ReturnType<typeof createUser>> | null;

function actAs(user: Session) {
  sessionMock.current = user;
}

const ADMIN_GET = [
  ['instituicoes', () => institutions.GET()],
  ['responsaveis', () => responsibles.GET()],
  ['usinas', () => plants.GET()],
  ['usuarios', () => users.GET()],
  ['configuracoes', () => settings.GET()],
] as const;

const ADMIN_WRITE = [
  [
    'criar instituicao',
    () =>
      institutions.POST(
        jsonRequest('http://localhost/api/admin/instituicoes', 'POST', { name: 'Invasora' }),
      ),
  ],
  [
    'criar responsavel',
    () =>
      responsibles.POST(
        jsonRequest('http://localhost/api/admin/responsaveis', 'POST', { name: 'Invasor' }),
      ),
  ],
  [
    'criar usina',
    () => plants.POST(jsonRequest('http://localhost/api/admin/usinas', 'POST', { name: 'Invasora' })),
  ],
  [
    'criar usuario',
    () =>
      users.POST(
        jsonRequest('http://localhost/api/admin/usuarios', 'POST', {
          name: 'Invasor',
          email: 'invasor@teste.local',
          password: 'SenhaMuitoLonga@1',
          role: 'ADMIN',
        }),
      ),
  ],
  [
    'alterar valores',
    () =>
      settings.PUT(
        jsonRequest('http://localhost/api/admin/configuracoes', 'PUT', {
          technicalHourlyRate: '999',
          kmRate: '9',
        }),
      ),
  ],
] as const;

describe('usuario comum na API administrativa', () => {
  it.each(ADMIN_GET)('nao consegue listar %s', async (_name, call) => {
    actAs(await createUser({ role: 'USER' }));
    const response = await call();
    expect(response.status).toBe(403);
  });

  it.each(ADMIN_WRITE)('nao consegue %s', async (_name, call) => {
    actAs(await createUser({ role: 'USER' }));
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('nao consegue desativar uma instituicao', async () => {
    actAs(await createUser({ role: 'USER' }));
    const institution = await prisma.institution.create({ data: { name: 'FIEMS' } });

    const patch = await institutionById.PATCH(
      jsonRequest(`http://localhost/api/admin/instituicoes/${institution.id}`, 'PATCH', {
        active: false,
      }),
      { params: Promise.resolve({ id: institution.id }) },
    );
    expect(patch.status).toBe(403);

    const remove = await institutionById.DELETE(
      jsonRequest(`http://localhost/api/admin/instituicoes/${institution.id}`, 'DELETE'),
      { params: Promise.resolve({ id: institution.id }) },
    );
    expect(remove.status).toBe(403);

    const stored = await prisma.institution.findUniqueOrThrow({ where: { id: institution.id } });
    expect(stored.active).toBe(true);
  });
});

describe('sem sessao', () => {
  it.each(ADMIN_GET)('%s responde 401', async (_name, call) => {
    actAs(null);
    const response = await call();
    expect(response.status).toBe(401);
  });

  it('nao permite listar nem abrir OS', async () => {
    actAs(null);
    const list = await osRoute.GET(jsonRequest('http://localhost/api/os', 'GET'));
    expect(list.status).toBe(401);

    const create = await osRoute.POST(jsonRequest('http://localhost/api/os', 'POST', {}));
    expect(create.status).toBe(401);
  });
});

describe('administrador', () => {
  it('acessa e altera os cadastros', async () => {
    actAs(await createUser({ role: 'ADMIN' }));

    const created = await institutions.POST(
      jsonRequest('http://localhost/api/admin/instituicoes', 'POST', { name: 'FIEMS' }),
    );
    expect(created.status).toBe(201);

    const list = await institutions.GET();
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ items: [{ name: 'FIEMS', active: true }] });
  });

  it('impede nome duplicado', async () => {
    actAs(await createUser({ role: 'ADMIN' }));
    await institutions.POST(
      jsonRequest('http://localhost/api/admin/instituicoes', 'POST', { name: 'SESI' }),
    );
    const again = await institutions.POST(
      jsonRequest('http://localhost/api/admin/instituicoes', 'POST', { name: 'SESI' }),
    );
    expect(again.status).toBe(409);
  });

  it('desativa em vez de excluir quando ja existe OS vinculada', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    actAs(admin);
    await seedRates();
    const catalog = await seedCatalog();

    const create = await osRoute.POST(
      jsonRequest('http://localhost/api/os', 'POST', osPayload(catalog)),
    );
    expect(create.status).toBe(201);

    const removal = await institutionById.DELETE(
      jsonRequest(`http://localhost/api/admin/instituicoes/${catalog.institution.id}`, 'DELETE'),
      { params: Promise.resolve({ id: catalog.institution.id }) },
    );
    expect(removal.status).toBe(200);
    await expect(removal.json()).resolves.toMatchObject({ deactivatedInsteadOfDeleted: true });

    const stored = await prisma.institution.findUniqueOrThrow({
      where: { id: catalog.institution.id },
    });
    expect(stored.active).toBe(false);
  });

  it('exclui uma OS pela rota, e o usuario comum nao consegue', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    actAs(admin);
    await seedRates();
    const catalog = await seedCatalog();

    const create = await osRoute.POST(
      jsonRequest('http://localhost/api/os', 'POST', osPayload(catalog)),
    );
    const order = (await create.json()) as { id: string; number: string };

    // Usuario comum e barrado na propria rota, nao apenas na interface.
    actAs(await createUser({ role: 'USER' }));
    const denied = await osById.DELETE(
      jsonRequest(`http://localhost/api/os/${order.id}`, 'DELETE'),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(denied.status).toBe(403);
    expect(await prisma.serviceOrder.findUnique({ where: { id: order.id } })).not.toBeNull();

    actAs(admin);
    const removal = await osById.DELETE(
      jsonRequest(`http://localhost/api/os/${order.id}`, 'DELETE'),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(removal.status).toBe(200);
    await expect(removal.json()).resolves.toMatchObject({ deleted: true, number: order.number });
    expect(await prisma.serviceOrder.findUnique({ where: { id: order.id } })).toBeNull();
  });

  it('exclui de fato um cadastro nunca utilizado', async () => {
    actAs(await createUser({ role: 'ADMIN' }));
    const institution = await prisma.institution.create({ data: { name: 'SEMAPA' } });

    const removal = await institutionById.DELETE(
      jsonRequest(`http://localhost/api/admin/instituicoes/${institution.id}`, 'DELETE'),
      { params: Promise.resolve({ id: institution.id }) },
    );
    await expect(removal.json()).resolves.toMatchObject({ deleted: true });
    expect(await prisma.institution.findUnique({ where: { id: institution.id } })).toBeNull();
  });
});

describe('usuario comum nas operacoes de OS', () => {
  it('pode abrir e listar Ordens de Servico', async () => {
    actAs(await createUser({ role: 'USER' }));
    await seedRates();
    const catalog = await seedCatalog();

    const create = await osRoute.POST(
      jsonRequest('http://localhost/api/os', 'POST', osPayload(catalog)),
    );
    expect(create.status).toBe(201);

    const list = await osRoute.GET(jsonRequest('http://localhost/api/os', 'GET'));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ total: 1 });
  });

  it('recebe erros de validacao por campo', async () => {
    actAs(await createUser({ role: 'USER' }));
    await seedRates();
    const catalog = await seedCatalog();

    const response = await osRoute.POST(
      jsonRequest(
        'http://localhost/api/os',
        'POST',
        osPayload(catalog, { title: '', technicianCount: '0', outboundKm: '-10' }),
      ),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields)).toEqual(
      expect.arrayContaining(['title', 'technicianCount', 'outboundKm']),
    );
  });
});

describe('troca de senha obrigatoria', () => {
  it('bloqueia a API enquanto a senha de provisionamento nao for trocada', async () => {
    actAs(await createUser({ role: 'ADMIN', mustChangePassword: true }));

    const list = await osRoute.GET(jsonRequest('http://localhost/api/os', 'GET'));
    expect(list.status).toBe(403);
    await expect(list.json()).resolves.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

    // Nem mesmo um administrador opera os cadastros nesse estado.
    const admin = await institutions.GET();
    expect(admin.status).toBe(403);
    await expect(admin.json()).resolves.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('libera a API depois que a troca e concluida', async () => {
    const user = await createUser({ role: 'USER', mustChangePassword: true });
    actAs(user);
    expect((await osRoute.GET(jsonRequest('http://localhost/api/os', 'GET'))).status).toBe(403);

    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    actAs({ ...user, mustChangePassword: false });

    expect((await osRoute.GET(jsonRequest('http://localhost/api/os', 'GET'))).status).toBe(200);
  });
});

beforeEach(async () => {
  await resetDatabase();
  sessionMock.current = null;
});

afterAll(async () => {
  await prisma.$disconnect();
});
