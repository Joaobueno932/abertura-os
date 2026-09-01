'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import type { SessionUser } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/auth/roles';

type NavItem = { href: string; label: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: '/painel', label: 'Painel' },
  { href: '/os', label: 'Ordens de Serviço' },
  { href: '/os/nova', label: 'Nova OS' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin/instituicoes', label: 'Instituições' },
  { href: '/admin/responsaveis', label: 'Responsáveis' },
  { href: '/admin/usinas', label: 'Usinas' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/configuracoes', label: 'Configurações' },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isAdmin = user.role === 'ADMIN';
  const items = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  const isActive = (href: string) =>
    href === '/os' ? pathname === '/os' : pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    setLeaving(true);
    try {
      await api.post('/api/auth/logout');
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-brand-600 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3">
          <Link href="/painel" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-white/15 text-sm font-black tracking-tight">
              O&amp;M
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-wide">O&amp;M OS</span>
              <span className="block text-[11px] text-white/70">Ordens de Serviço</span>
            </span>
          </Link>

          <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex" aria-label="Principal">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(item.href) ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <span className="block text-sm font-semibold">{user.name}</span>
              <span className="block text-[11px] text-white/70">{ROLE_LABEL[user.role]}</span>
            </div>
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xs font-bold"
            >
              {initials(user.name)}
            </span>
            <Link
              href="/trocar-senha"
              className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 sm:block"
            >
              Alterar senha
            </Link>
            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 sm:block"
            >
              {leaving ? 'Saindo…' : 'Sair'}
            </button>
            <button
              type="button"
              className="rounded-md p-2 hover:bg-white/10 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="menu-mobile"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav id="menu-mobile" className="border-t border-white/15 px-4 pb-3 lg:hidden" aria-label="Menu">
            <ul className="grid gap-1 pt-2">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive(item.href) ? 'bg-white/20' : 'text-white/85 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/trocar-senha"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
                >
                  Alterar senha
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/85 hover:bg-white/10"
                >
                  Sair
                </button>
              </li>
            </ul>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
