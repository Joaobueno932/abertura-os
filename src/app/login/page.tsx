import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/painel');

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-600 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/15 text-base font-black">
            O&amp;M
          </span>
          <span>
            <span className="block text-lg font-bold tracking-wide">O&amp;M OS</span>
            <span className="block text-xs tracking-[0.2em] text-white/70 uppercase">
              Ordens de Serviço
            </span>
          </span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-bold">Operação e manutenção</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Abertura, acompanhamento em Kanban, cálculo do atendimento e emissão do documento
            oficial em papel timbrado — em um só lugar.
          </p>
        </div>

        <p className="text-xs text-white/60">
          Em Conta Ltda · Centro de Sustentabilidade da Indústria · Campo Grande / MS
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-600 text-base font-black text-white">
              O&amp;M
            </span>
          </div>
          <h2 className="text-xl font-bold text-ink-900">Entrar no sistema</h2>
          <p className="mt-1 text-sm text-ink-500">
            Use suas credenciais corporativas para continuar.
          </p>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
