'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import {
  canTransition,
  isTerminal,
  OS_STATUSES,
  requiresCancellationReason,
  requiresCompletionNote,
  requiresReopenReason,
  STATUS_LABEL,
  type OsStatus,
} from '@/lib/os/status';
import type { CancellationReasonOption } from '@/lib/os/cancellation';
import type { RecordKind } from '@/lib/validation/os';
import {
  StatusReasonDialog,
  type StatusReasonMode,
  type StatusReasonPayload,
} from './status-reason-dialog';

type Props = {
  kind: RecordKind;
  id: string;
  number: string;
  status: OsStatus;
  canEdit: boolean;
  isAdmin: boolean;
  reasons: CancellationReasonOption[];
};

const COPY = {
  OS: {
    singular: 'OS',
    article: 'a',
    listHref: '/os',
    detailHref: (id: string) => `/os/${id}`,
    endpoint: (id: string) => `/api/os/${id}`,
  },
  CHAMADO: {
    singular: 'chamado',
    article: 'o',
    listHref: '/chamados',
    detailHref: (id: string) => `/chamados/${id}`,
    endpoint: (id: string) => `/api/chamados/${id}`,
  },
} as const;

/**
 * Acoes da tela de detalhes, compartilhadas por OS e chamados da concessionaria.
 *
 * As regras de status estao em @/lib/os/status e sao as mesmas aplicadas no
 * servidor: aqui elas apenas evitam que o usuario tente algo que sera recusado.
 */
export function RecordActions({ kind, id, number, status, canEdit, isAdmin, reasons }: Props) {
  const router = useRouter();
  const copy = COPY[kind];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<OsStatus | null>(null);

  const targets = OS_STATUSES.filter((candidate) => canTransition(status, candidate));
  const blockedByRole = isTerminal(status) && !isAdmin;

  async function remove() {
    // Operacao irreversivel: exige digitar o numero, para que um clique
    // acidental (ou no registro errado) nao apague nada.
    const typed = window.prompt(
      `Excluir definitivamente ${copy.article} ${copy.singular} ${number}?\n\n` +
        `${copy.singular === 'OS' ? 'A OS' : 'O chamado'} e todo o histórico dele serão apagados, ` +
        'sem como desfazer. O número não será reaproveitado.\n\n' +
        `Para confirmar, digite o número (${number}):`,
    );
    if (typed === null) return;
    if (typed.trim() !== number) {
      setError('Número não confere. Nada foi excluído.');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy('excluir');
    try {
      await api.del(copy.endpoint(id));
      router.push(copy.listHref);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir o registro.');
      setBusy(null);
    }
  }

  async function changeStatus(next: OsStatus, payload: StatusReasonPayload = {}) {
    setError(null);
    setNotice(null);
    setBusy(next);
    try {
      await api.patch(`${copy.endpoint(id)}/status`, { status: next, ...payload });
      setNotice(`Status alterado para "${STATUS_LABEL[next]}".`);
      setPendingTarget(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível alterar o status.');
    } finally {
      setBusy(null);
    }
  }

  /** Cancelar, concluir e retroceder passam pelo dialogo; o resto vai direto. */
  function start(next: OsStatus) {
    if (
      requiresCancellationReason(next) ||
      requiresCompletionNote(next) ||
      requiresReopenReason(status)
    ) {
      setError(null);
      setNotice(null);
      setPendingTarget(next);
      return;
    }
    void changeStatus(next);
  }

  /**
   * Os tres modos nunca se sobrepoem: de um registro encerrado so se sai para
   * Aberta/Em andamento, e nenhuma dessas transicoes pede motivo ou observacao.
   */
  function dialogModeFor(next: OsStatus): StatusReasonMode {
    if (requiresReopenReason(status)) return 'RETROCEDER';
    if (requiresCompletionNote(next)) return 'CONCLUIR';
    return 'CANCELAR';
  }

  return (
    <div className="no-print grid gap-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Link href={`${copy.detailHref(id)}/editar`} className="btn-secondary">
            Editar
          </Link>
        ) : null}

        {kind === 'OS' ? (
          <>
            <a
              className="btn-primary"
              href={`/api/os/${id}/documento?formato=pdf`}
              download={`OS-${number}.pdf`}
            >
              Gerar PDF
            </a>
            <a
              className="btn-secondary"
              href={`/api/os/${id}/documento?formato=docx`}
              download={`OS-${number}.docx`}
            >
              Gerar DOCX
            </a>
            <a
              className="btn-secondary"
              href={`/api/os/${id}/documento?formato=pdf&inline=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visualizar / imprimir
            </a>
          </>
        ) : null}
      </div>

      {targets.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="field-label">Alterar status</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => (
              <button
                key={target}
                type="button"
                className={target === 'CANCELADA' ? 'btn-danger' : 'btn-secondary'}
                disabled={busy !== null || blockedByRole}
                title={
                  blockedByRole
                    ? 'Somente administradores podem retroceder um registro concluído ou cancelado.'
                    : undefined
                }
                onClick={() => start(target)}
              >
                {busy === target ? 'Alterando…' : STATUS_LABEL[target]}
              </button>
            ))}
          </div>
          {blockedByRole ? (
            <p className="mt-2 text-xs text-ink-500">
              {STATUS_LABEL[status]} desde a última alteração. Somente um administrador pode
              retroceder este registro, informando o motivo.
            </p>
          ) : null}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="border-t border-line pt-3">
          <p className="field-label">Zona de risco</p>
          <p className="mt-1 text-sm text-ink-500">
            A exclusão apaga o registro e o histórico dele definitivamente. O número {number} não
            será reaproveitado.
          </p>
          <button
            type="button"
            className="btn-danger mt-2"
            disabled={busy !== null}
            onClick={() => void remove()}
          >
            {busy === 'excluir' ? 'Excluindo…' : `Excluir ${copy.singular}`}
          </button>
        </div>
      ) : null}

      {pendingTarget ? (
        <StatusReasonDialog
          mode={dialogModeFor(pendingTarget)}
          recordLabel={`${copy.singular === 'OS' ? 'OS' : 'Chamado'} ${number}`}
          from={status}
          to={pendingTarget}
          reasons={reasons}
          busy={busy !== null}
          error={error}
          onClose={() => setPendingTarget(null)}
          onConfirm={(payload) => void changeStatus(pendingTarget, payload)}
        />
      ) : null}
    </div>
  );
}
