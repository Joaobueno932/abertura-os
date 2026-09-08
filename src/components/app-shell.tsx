'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { SessionUser } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/auth/roles';

/**
 * Barra de navegacao.
 *
 * Os destinos crescem com o sistema (OS, chamados, cadastros, administracao),
 * e uma lista unica de links acabaria quebrando em duas linhas. Por isso o menu
 * e agrupado: no maximo cinco itens no topo, cada um abrindo o que pertence a
 * ele. Cadastrar OS/chamado fica dentro do proprio grupo, e o acesso rapido
 * continua nos botoes "Abrir nova OS" das telas.
 */

type NavLink = { href: string; label: string; hint?: string; adminOnly?: boolean };
type NavGroup = { id: string; label: string; items: NavLink[] };

const PAINEL: NavLink = { href: '/painel', label: 'Painel' };

const GROUPS: NavGroup[] = [
  {
    id: 'os',
    label: 'Ordens de Serviço',
    items: [
      { href: '/os', label: 'Todas as OS', hint: 'Busca, filtros e somatórios' },
      { href: '/os/nova', label: 'Abrir nova OS', hint: 'Numeração automática do dia' },
    ],
  },
  {
    id: 'chamados',
    label: 'Chamados',
    items: [
      { href: '/chamados', label: 'Todos os chamados', hint: 'Concessionária de energia' },
      { href: '/chamados/novo', label: 'Abrir chamado', hint: 'Protocolo e prazo de solução' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    items: [
      { href: '/cadastros/clientes', label: 'Clientes/Instituições' },
      { href: '/cadastros/usinas', label: 'Usinas' },
      { href: '/admin/responsaveis', label: 'Responsáveis', adminOnly: true },
      { href: '/admin/motivos-cancelamento', label: 'Motivos de cancelamento', adminOnly: true },
    ],
  },
  {
    id: 'admin',
    label: 'Administração',
    items: [
      { href: '/admin/usuarios', label: 'Usuários', adminOnly: true },
      { href: '/admin/configuracoes', label: 'Configurações', adminOnly: true },
    ],
  },
];

/**
 * Rotas com paginas filhas que tem item proprio no menu: sem a comparacao
 * exata, dois itens ficariam marcados como atuais ao mesmo tempo.
 */
const EXACT_ONLY = ['/painel', '/os', '/chamados'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  /** Id do menu suspenso aberto (grupo do topo ou "user"). Só um por vez. */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isAdmin = user.role === 'ADMIN';

  const visible = (item: NavLink) => !item.adminOnly || isAdmin;
  const groups = GROUPS.map((group) => ({ ...group, items: group.items.filter(visible) })).filter(
    (group) => group.items.length > 0,
  );

  const isActive = (href: string) =>
    EXACT_ONLY.includes(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  /** O grupo fica destacado quando a tela atual pertence a ele. */
  const isGroupActive = (group: NavGroup) => group.items.some((item) => isActive(item.href));

  // Navegar fecha tudo: o menu nunca fica aberto por cima da tela nova.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Clique fora e Esc fecham o menu aberto. O clique e identificado pelo
  // proprio marcador data-menu, o que dispensa uma ref por grupo.
  useEffect(() => {
    if (!openMenu) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest(`[data-menu="${openMenu}"]`)) return;
      setOpenMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  async function logout() {
    setLeaving(true);
    try {
      await api.post('/api/auth/logout');
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  const toggle = (id: string) => setOpenMenu((current) => (current === id ? null : id));

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-brand-600 text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4">
          <Link href="/painel" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-white/15 text-sm font-black tracking-tight">
              O&amp;M
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-wide">O&amp;M OS</span>
              <span className="block text-[11px] text-white/70">Ordens de Serviço</span>
            </span>
          </Link>

          <nav className="ml-3 hidden items-center gap-0.5 lg:flex" aria-label="Principal">
            <Link
              href={PAINEL.href}
              aria-current={isActive(PAINEL.href) ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(PAINEL.href) ? 'bg-white/20 text-white' : 'text-white/85 hover:bg-white/10'
              }`}
            >
              {PAINEL.label}
            </Link>

            {groups.map((group) => {
              const open = openMenu === group.id;
              const active = isGroupActive(group);
              return (
                <div key={group.id} data-menu={group.id} className="relative">
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={open}
                    aria-haspopup="true"
                    aria-controls={`menu-${group.id}`}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active || open ? 'bg-white/20 text-white' : 'text-white/85 hover:bg-white/10'
                    }`}
                  >
                    {group.label}
                    <Chevron open={open} />
                  </button>

                  {open ? (
                    <ul
                      id={`menu-${group.id}`}
                      className="absolute top-full left-0 z-40 mt-1.5 min-w-64 rounded-lg border border-line bg-white p-1.5 shadow-lg"
                    >
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={isActive(item.href) ? 'page' : undefined}
                            className={`block rounded-md px-3 py-2 transition-colors ${
                              isActive(item.href)
                                ? 'bg-brand-50 text-brand-700'
                                : 'text-ink-900 hover:bg-brand-50'
                            }`}
                          >
                            <span className="block text-sm font-medium">{item.label}</span>
                            {item.hint ? (
                              <span className="block text-xs text-ink-500">{item.hint}</span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Conta: nome, perfil e as acoes da sessao em um menu so, para nao
                disputar espaco com a navegacao. */}
            <div data-menu="user" className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => toggle('user')}
                aria-expanded={openMenu === 'user'}
                aria-haspopup="true"
                aria-controls="menu-user"
                className={`flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-2.5 transition-colors ${
                  openMenu === 'user' ? 'bg-white/20' : 'hover:bg-white/10'
                }`}
              >
                <span className="hidden text-right leading-tight xl:block">
                  <span className="block max-w-40 truncate text-sm font-semibold">{user.name}</span>
                  <span className="block text-[11px] text-white/70">{ROLE_LABEL[user.role]}</span>
                </span>
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold"
                >
                  {initials(user.name)}
                </span>
                <Chevron open={openMenu === 'user'} />
              </button>

              {openMenu === 'user' ? (
                <div
                  id="menu-user"
                  className="absolute top-full right-0 z-40 mt-1.5 min-w-60 rounded-lg border border-line bg-white p-1.5 shadow-lg"
                >
                  <div className="border-b border-line px-3 pt-1 pb-2">
                    <p className="text-sm font-semibold text-ink-900">{user.name}</p>
                    <p className="truncate text-xs text-ink-500">{user.email}</p>
                    <p className="mt-0.5 text-xs font-medium text-brand-600">
                      {ROLE_LABEL[user.role]}
                    </p>
                  </div>
                  <Link
                    href="/trocar-senha"
                    className="mt-1 block rounded-md px-3 py-2 text-sm font-medium text-ink-900 hover:bg-brand-50"
                  >
                    Alterar senha
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={leaving}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {leaving ? 'Saindo…' : 'Sair'}
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="rounded-md p-2 hover:bg-white/10 lg:hidden"
              aria-expanded={mobileOpen}
              aria-controls="menu-mobile"
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMobileOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <nav
            id="menu-mobile"
            className="max-h-[70vh] overflow-y-auto border-t border-white/15 px-4 pb-4 lg:hidden"
            aria-label="Menu"
          >
            <ul className="grid gap-1 pt-3">
              <li>
                <Link
                  href={PAINEL.href}
                  aria-current={isActive(PAINEL.href) ? 'page' : undefined}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive(PAINEL.href) ? 'bg-white/20' : 'text-white/85 hover:bg-white/10'
                  }`}
                >
                  {PAINEL.label}
                </Link>
              </li>
            </ul>

            {groups.map((group) => (
              <div key={group.id} className="mt-3">
                <p className="px-3 text-[11px] font-bold tracking-wide text-white/60 uppercase">
                  {group.label}
                </p>
                <ul className="mt-1 grid gap-1">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={`block rounded-md px-3 py-2 text-sm font-medium ${
                          isActive(item.href) ? 'bg-white/20' : 'text-white/85 hover:bg-white/10'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="mt-3 border-t border-white/15 pt-3">
              <p className="px-3 text-sm font-semibold">{user.name}</p>
              <p className="px-3 text-[11px] text-white/70">{ROLE_LABEL[user.role]}</p>
              <ul className="mt-1 grid gap-1">
                <li>
                  <Link
                    href="/trocar-senha"
                    className="block rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
                  >
                    Alterar senha
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={leaving}
                    className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/85 hover:bg-white/10 disabled:opacity-60"
                  >
                    {leaving ? 'Saindo…' : 'Sair'}
                  </button>
                </li>
              </ul>
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
