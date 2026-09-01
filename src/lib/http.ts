import { NextResponse } from 'next/server';

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'BAD_REQUEST',
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(message, 400, 'BAD_REQUEST', fields);
export const unauthorized = (message = 'Sessão expirada. Entre novamente.') =>
  new AppError(message, 401, 'UNAUTHORIZED');
export const forbidden = (message = 'Você não tem permissão para esta operação.') =>
  new AppError(message, 403, 'FORBIDDEN');
export const notFound = (message = 'Registro não encontrado.') =>
  new AppError(message, 404, 'NOT_FOUND');
export const conflict = (message: string) => new AppError(message, 409, 'CONFLICT');
export const tooManyRequests = (message = 'Muitas tentativas. Aguarde e tente novamente.') =>
  new AppError(message, 429, 'TOO_MANY_REQUESTS');

export type ApiErrorBody = { error: string; code: string; fields?: Record<string, string> };

/**
 * Converte qualquer excecao em resposta JSON segura. Erros inesperados nunca
 * vazam stack trace ou mensagem interna para o cliente.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) },
      { status: error.status },
    );
  }
  console.error('[api] erro nao tratado:', error);
  return NextResponse.json(
    { error: 'Erro interno ao processar a solicitação.', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

/** Envolve um handler de rota aplicando tratamento de erro padronizado. */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Verifica a origem de requisicoes que alteram estado (defesa CSRF adicional
 * ao SameSite=Lax do cookie de sessao).
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return; // navegacoes same-origin e clientes nao-browser
  const host = request.headers.get('host');
  try {
    if (new URL(origin).host !== host) {
      throw forbidden('Origem da requisição não autorizada.');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw forbidden('Origem da requisição não autorizada.');
  }
}
