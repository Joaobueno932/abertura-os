'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api-client';

/**
 * Tela administrativa generica de cadastro. A configuracao e apenas dados
 * (sem funcoes), o que permite monta-la em um Server Component e passar para
 * este componente cliente sem duplicar quatro telas quase identicas.
 */

export type CrudFieldType = 'text' | 'email' | 'password' | 'select' | 'checkbox';

export type CrudField = {
  name: string;
  label: string;
  type: CrudFieldType;
  required?: boolean;
  /** Senha e obrigatoria ao criar, opcional ao editar. */
  optionalOnEdit?: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string | boolean;
};

export type CrudColumnType = 'text' | 'active' | 'count' | 'badge';

export type CrudColumn = {
  /** Caminho do valor no item, aceitando ponto: "user.name". */
  key: string;
  label: string;
  type?: CrudColumnType;
  align?: 'left' | 'right';
};

export type CrudConfig = {
  endpoint: string;
  singular: string;
  plural: string;
  /** Rotulo do botao de criacao, ja com a concordancia correta. */
  newLabel: string;
  /** Titulo do formulario em modo edicao. */
  editLabel: string;
  columns: CrudColumn[];
  fields: CrudField[];
  /** Permite excluir (com fallback automatico para inativacao quando em uso). */
  allowDelete: boolean;
  /**
   * Permissoes por perfil. Cadastros como usinas e clientes/instituicoes sao
   * abertos a qualquer usuario para CRIAR, mas so administradores alteram,
   * desativam ou excluem. Omitidos = permitido (comportamento das telas
   * exclusivamente administrativas). O servidor repete cada checagem.
   */
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowToggle?: boolean;
  emptyMessage: string;
};

export type CrudItem = Record<string, unknown> & { id: string };

function readPath(item: CrudItem, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, item);
}

function asText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

type FormState = Record<string, string | boolean>;

function initialState(fields: CrudField[], item?: CrudItem): FormState {
  const state: FormState = {};
  for (const field of fields) {
    if (field.type === 'checkbox') {
      const current = item ? readPath(item, field.name) : field.defaultValue;
      state[field.name] = current === undefined ? true : Boolean(current);
    } else if (field.type === 'password') {
      state[field.name] = '';
    } else {
      const current = item ? readPath(item, field.name) : field.defaultValue;
      state[field.name] = current === null || current === undefined ? '' : String(current);
    }
  }
  return state;
}

export function CrudManager({ config, items }: { config: CrudConfig; items: CrudItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CrudItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialState(config.fields));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = creating || editing !== null;
  const canCreate = config.allowCreate !== false;
  const canEdit = config.allowEdit !== false;
  const canToggle = config.allowToggle !== false;

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setForm(initialState(config.fields));
    setFieldErrors({});
    setError(null);
  }

  function startEdit(item: CrudItem) {
    setCreating(false);
    setEditing(item);
    setForm(initialState(config.fields, item));
    setFieldErrors({});
    setError(null);
  }

  function close() {
    setCreating(false);
    setEditing(null);
    setFieldErrors({});
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      const value = form[field.name];
      if (field.type === 'checkbox') {
        payload[field.name] = Boolean(value);
        continue;
      }
      const text = String(value ?? '').trim();
      // Senha em branco ao editar significa "manter a senha atual".
      if (field.type === 'password' && !text && editing) continue;
      if (!text) {
        // Campo obrigatorio vazio segue para o backend validar e responder.
        if (field.required) continue;
        payload[field.name] = field.type === 'select' ? null : '';
        continue;
      }
      payload[field.name] = text;
    }

    try {
      if (editing) {
        await api.patch(`${config.endpoint}/${editing.id}`, payload);
        setNotice(`${config.singular} atualizado com sucesso.`);
      } else {
        await api.post(config.endpoint, payload);
        setNotice(`${config.singular} cadastrado com sucesso.`);
      }
      close();
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setError('Não foi possível salvar o registro.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: CrudItem) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = !item.active;
      await api.patch(`${config.endpoint}/${item.id}`, { active: next });
      setNotice(next ? `${config.singular} reativado.` : `${config.singular} desativado.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível alterar o registro.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: CrudItem) {
    const label = String(readPath(item, config.columns[0]?.key ?? 'id') ?? '');
    if (!window.confirm(`Excluir "${label}"? Se já estiver em uso, será apenas desativado.`)) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.del<{ deactivatedInsteadOfDeleted?: boolean }>(
        `${config.endpoint}/${item.id}`,
      );
      setNotice(
        result?.deactivatedInsteadOfDeleted
          ? `${config.singular} já vinculado a Ordens de Serviço: foi desativado em vez de excluído.`
          : `${config.singular} excluído.`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir o registro.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
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

      {open ? (
        <form onSubmit={submit} className="card grid gap-4 p-4 sm:p-5" noValidate>
          <h2 className="section-title">{editing ? config.editLabel : config.newLabel}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {config.fields.map((field) => {
              const id = `crud-${field.name}`;
              const value = form[field.name];

              if (field.type === 'checkbox') {
                return (
                  <label key={field.name} className="flex items-center gap-2 self-end pb-2">
                    <input
                      id={id}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, [field.name]: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-line text-brand-600"
                    />
                    <span className="text-sm text-ink-700">{field.label}</span>
                  </label>
                );
              }

              return (
                <div key={field.name}>
                  <label htmlFor={id} className="field-label">
                    {field.label}
                    {field.required && !(editing && field.optionalOnEdit) ? (
                      <span aria-hidden className="text-red-500"> *</span>
                    ) : null}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      id={id}
                      className="field-input"
                      value={String(value ?? '')}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      aria-invalid={Boolean(fieldErrors[field.name])}
                    >
                      <option value="">{field.required ? 'Selecione…' : 'Nenhum'}</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={field.type}
                      className="field-input"
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      aria-invalid={Boolean(fieldErrors[field.name])}
                    />
                  )}
                  {field.help ? <p className="mt-1 text-xs text-ink-500">{field.help}</p> : null}
                  {fieldErrors[field.name] ? (
                    <span className="field-error">{fieldErrors[field.name]}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : canCreate ? (
        <div>
          <button type="button" className="btn-primary" onClick={startCreate}>
            {config.newLabel}
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-ink-900">Nenhum registro</h2>
          <p className="max-w-md text-sm text-ink-500">{config.emptyMessage}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">{config.plural}</caption>
              <thead>
                <tr className="border-b border-line bg-brand-50/60 text-left">
                  {config.columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={`px-4 py-3 font-semibold text-ink-700 ${
                        column.align === 'right' ? 'text-right' : ''
                      }`}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    {config.columns.map((column) => {
                      const value = readPath(item, column.key);
                      return (
                        <td
                          key={column.key}
                          className={`px-4 py-3 ${
                            column.align === 'right' ? 'text-right' : ''
                          } ${item.active === false ? 'text-ink-500' : 'text-ink-900'}`}
                        >
                          {column.type === 'active' ? (
                            <span
                              className={`badge ${
                                value
                                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                                  : 'bg-gray-100 text-gray-700 ring-gray-300'
                              }`}
                            >
                              {value ? 'Ativo' : 'Inativo'}
                            </span>
                          ) : (
                            asText(value)
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canEdit ? (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1"
                          onClick={() => startEdit(item)}
                          disabled={busy}
                        >
                          Editar
                        </button>
                      ) : null}
                      {canToggle ? (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1"
                          onClick={() => void toggleActive(item)}
                          disabled={busy}
                        >
                          {item.active ? 'Desativar' : 'Reativar'}
                        </button>
                      ) : null}
                      {!canEdit && !canToggle && !config.allowDelete ? (
                        <span className="text-xs text-ink-500">Somente leitura</span>
                      ) : null}
                      {config.allowDelete ? (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-red-700 hover:bg-red-50"
                          onClick={() => void remove(item)}
                          disabled={busy}
                        >
                          Excluir
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
