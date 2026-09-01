'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api-client';

export function ChangePasswordForm({ redirectTo = '/painel' }: { redirectTo?: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await api.post('/api/auth/senha', { currentPassword, newPassword, confirmPassword });
      router.replace(redirectTo);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Não foi possível alterar a senha.');
      }
      setSaving(false);
    }
  }

  const fieldError = (key: string) =>
    fields[key] ? <span className="field-error">{fields[key]}</span> : null;

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="currentPassword" className="field-label">
          Senha atual
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="field-input"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          aria-invalid={Boolean(fields.currentPassword)}
        />
        {fieldError('currentPassword')}
      </div>

      <div>
        <label htmlFor="newPassword" className="field-label">
          Nova senha
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className="field-input"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-describedby="newPassword-hint"
          aria-invalid={Boolean(fields.newPassword)}
        />
        <p id="newPassword-hint" className="mt-1 text-xs text-ink-500">
          Mínimo de 10 caracteres. Use uma senha que você não utilize em outro serviço.
        </p>
        {fieldError('newPassword')}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="field-label">
          Confirme a nova senha
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className="field-input"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={Boolean(fields.confirmPassword)}
        />
        {fieldError('confirmPassword')}
      </div>

      <button type="submit" className="btn-primary mt-2 w-full" disabled={saving}>
        {saving ? 'Salvando…' : 'Definir nova senha'}
      </button>
    </form>
  );
}
