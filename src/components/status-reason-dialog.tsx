'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MIN_REOPEN_REASON_LENGTH, STATUS_LABEL, type OsStatus } from '@/lib/os/status';
import type { CancellationReasonOption } from '@/lib/os/cancellation';

/**
 * Justificativa exigida em duas movimentacoes de status:
 *
 * - CANCELAR: motivo escolhido entre os cadastrados (nunca texto livre, para
 *   que os cancelamentos continuem comparaveis entre si);
 * - RETROCEDER: um registro Concluido/Cancelado so volta atras por acao de
 *   administrador e com justificativa escrita, que fica no historico.
 *
 * O dialogo apenas coleta. A obrigatoriedade e revalidada no servidor.
 */

export type StatusReasonMode = 'CANCELAR' | 'RETROCEDER';

export type StatusReasonPayload = { cancellationReasonId?: string; reason?: string };

type Props = {
  mode: StatusReasonMode;
  /** Descricao do registro afetado, ex.: "OS 20260908001". */
  recordLabel: string;
  from: OsStatus;
  to: OsStatus;
  reasons: CancellationReasonOption[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payload: StatusReasonPayload) => void;
};

export function StatusReasonDialog({
  mode,
  recordLabel,
  from,
  to,
  reasons,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? '');
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (mode === 'CANCELAR') {
      if (!reasonId) {
        setLocalError('Selecione o motivo do cancelamento.');
        return;
      }
      onConfirm({ cancellationReasonId: reasonId });
      return;
    }

    if (text.trim().length < MIN_REOPEN_REASON_LENGTH) {
      setLocalError(`Descreva o motivo com pelo menos ${MIN_REOPEN_REASON_LENGTH} caracteres.`);
      return;
    }
    onConfirm({ reason: text.trim() });
  }

  const title = mode === 'CANCELAR' ? 'Cancelar registro' : 'Retroceder registro';
  const message = localError ?? error;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-reason-title"
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg sm:p-5"
      >
        <h2 id="status-reason-title" className="text-base font-bold text-ink-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {recordLabel} · {STATUS_LABEL[from]} → {STATUS_LABEL[to]}
        </p>

        <form onSubmit={submit} className="mt-4 grid gap-3" noValidate>
          {message ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {message}
            </p>
          ) : null}

          {mode === 'CANCELAR' ? (
            <div>
              <label htmlFor="cancellationReasonId" className="field-label">
                Motivo do cancelamento <span aria-hidden className="text-red-500">*</span>
              </label>
              {reasons.length === 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  Nenhum motivo de cancelamento cadastrado. Peça a um administrador para cadastrar
                  em Motivos de cancelamento.
                </p>
              ) : (
                <select
                  id="cancellationReasonId"
                  ref={(node) => {
                    firstFieldRef.current = node;
                  }}
                  className="field-input"
                  value={reasonId}
                  onChange={(event) => setReasonId(event.target.value)}
                >
                  {reasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.active === false ? `${reason.label} (inativo)` : reason.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="reopenReason" className="field-label">
                Motivo para retroceder <span aria-hidden className="text-red-500">*</span>
              </label>
              <textarea
                id="reopenReason"
                ref={(node) => {
                  firstFieldRef.current = node;
                }}
                className="field-input min-h-24 resize-y"
                maxLength={500}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Ex.: reaberta a pedido do cliente para complementar o atendimento."
              />
              <p className="mt-1 text-xs text-ink-500">
                A justificativa fica registrada no histórico com data, hora e autor.
              </p>
            </div>
          )}

          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="submit"
              className={mode === 'CANCELAR' ? 'btn-danger' : 'btn-primary'}
              disabled={busy || (mode === 'CANCELAR' && reasons.length === 0)}
            >
              {busy ? 'Salvando…' : 'Confirmar'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Voltar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
