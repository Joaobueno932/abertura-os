import { APP_TIMEZONE } from './timezone';

/**
 * Chave do dia de negocio (AAAAMMDD) para um instante, no fuso configurado.
 * E a base da numeracao sequencial diaria da OS.
 */
export function businessDayKey(date: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

/** DD/MM/AAAA para um instante, no fuso de negocio. */
export function formatDateBR(date: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * DD/MM/AAAA HH:mm para um instante, no fuso de negocio.
 * Montado a partir das partes porque o Intl insere virgula entre data e hora.
 */
export function formatDateTimeBR(date: Date, timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte "AAAA-MM-DD" (input type=date) para um Date ancorado ao meio-dia UTC.
 * O meio-dia evita que a data mude ao ser exibida em qualquer fuso de -11 a +12.
 */
export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  // Rejeita datas inexistentes como 31/02.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** Hoje no formato do input type=date (AAAA-MM-DD), no fuso de negocio. */
export function todayDateInput(timeZone: string = APP_TIMEZONE): string {
  const key = businessDayKey(new Date(), timeZone);
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}`;
}

/**
 * Instante de abertura de um registro a partir da data opcional do formulario.
 *
 * Sem data, ou com a data de hoje, vale o instante atual - preserva a hora real
 * da abertura no caso normal. Com uma data anterior, ancora no meio-dia UTC
 * daquele dia (08:00 no fuso de negocio), que e o mesmo ponto usado pelos campos
 * "somente data" e nao escorrega de dia em nenhum fuso.
 */
export function resolveOpenedAt(openedDate: string | undefined, now: Date = new Date()): Date {
  if (!openedDate) return now;
  const parsed = parseDateOnly(openedDate);
  if (!parsed) return now;
  return businessDayKey(parsed) === businessDayKey(now) ? now : parsed;
}

/** Formata um campo "somente data" (ancorado ao meio-dia UTC) como DD/MM/AAAA. */
export function formatDateOnlyBR(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

/** Valor para <input type="date"> a partir de um campo "somente data". */
export function toDateInputValue(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${m}-${d}`;
}

/**
 * Indica se a previsao esta atrasada em relacao ao dia de negocio atual.
 * Comparacao feita por chave de dia, sem depender do horario.
 */
export function isOverdue(expectedDate: Date, now: Date = new Date()): boolean {
  const expectedKey =
    `${expectedDate.getUTCFullYear()}` +
    String(expectedDate.getUTCMonth() + 1).padStart(2, '0') +
    String(expectedDate.getUTCDate()).padStart(2, '0');
  return expectedKey < businessDayKey(now);
}
