'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { canTransition, OS_STATUSES, STATUS_LABEL, type OsStatus } from '@/lib/os/status';

type Props = {
  osId: string;
  osNumber: string;
  status: OsStatus;
  canEdit: boolean;
  isAdmin: boolean;
};

export function OsActions({ osId, osNumber, status, canEdit, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const targets = OS_STATUSES.filter((candidate) => canTransition(status, candidate));

  async function remove() {
    // Operacao irreversivel: exige digitar o numero da OS, para que um clique
    // acidental (ou na OS errada) nao apague nada.
    const typed = window.prompt(
      `Excluir definitivamente a OS ${osNumber}?\n\n` +
        'A OS e todo o histórico dela serão apagados, sem como desfazer. ' +
        'O número não será reaproveitado.\n\n' +
        `Para confirmar, digite o número da OS (${osNumber}):`,
    );
    if (typed === null) return;
    if (typed.trim() !== osNumber) {
      setError('Número não confere. A OS não foi excluída.');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy('excluir');
    try {
      await api.del(`/api/os/${osId}`);
      router.push('/os');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir a OS.');
      setBusy(null);
    }
  }

  async function changeStatus(next: OsStatus) {
    setError(null);
    setNotice(null);
    setBusy(next);
    try {
      await api.patch(`/api/os/${osId}/status`, { status: next });
      setNotice(`Status alterado para "${STATUS_LABEL[next]}".`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível alterar o status.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="no-print grid gap-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Link href={`/os/${osId}/editar`} className="btn-secondary">
            Editar
          </Link>
        ) : null}

        <a
          className="btn-primary"
          href={`/api/os/${osId}/documento?formato=pdf`}
          download={`OS-${osNumber}.pdf`}
        >
          Gerar PDF
        </a>
        <a
          className="btn-secondary"
          href={`/api/os/${osId}/documento?formato=docx`}
          download={`OS-${osNumber}.docx`}
        >
          Gerar DOCX
        </a>
        <a
          className="btn-secondary"
          href={`/api/os/${osId}/documento?formato=pdf&inline=1`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visualizar / imprimir
        </a>
      </div>

      {targets.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="field-label">Alterar status</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => {
              const needsAdmin =
                (status === 'CONCLUIDA' || status === 'CANCELADA') && !isAdmin;
              return (
                <button
                  key={target}
                  type="button"
                  className={target === 'CANCELADA' ? 'btn-danger' : 'btn-secondary'}
                  disabled={busy !== null || needsAdmin}
                  title={needsAdmin ? 'Somente administradores podem reabrir uma OS encerrada.' : undefined}
                  onClick={() => void changeStatus(target)}
                >
                  {busy === target ? 'Alterando…' : STATUS_LABEL[target]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="border-t border-line pt-3">
          <p className="field-label">Zona de risco</p>
          <p className="mt-1 text-sm text-ink-500">
            A exclusão apaga a OS e o histórico dela definitivamente. O número {osNumber} não será
            reaproveitado.
          </p>
          <button
            type="button"
            className="btn-danger mt-2"
            disabled={busy !== null}
            onClick={() => void remove()}
          >
            {busy === 'excluir' ? 'Excluindo…' : 'Excluir OS'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
