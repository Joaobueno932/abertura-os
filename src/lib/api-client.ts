/**
 * Cliente HTTP do frontend. Centraliza o tratamento de erro para que a
 * interface nunca exiba stack trace ou mensagem tecnica ao usuario.
 */

export type ApiFieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields: ApiFieldErrors = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Body = Record<string, unknown> | undefined;

async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; code?: string; fields?: ApiFieldErrors };
    throw new ApiError(
      data.error ?? 'Não foi possível concluir a operação.',
      response.status,
      data.code ?? 'UNKNOWN',
      data.fields ?? {},
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: Body) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: Body) => request<T>('PATCH', url, body),
  put: <T>(url: string, body?: Body) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};
