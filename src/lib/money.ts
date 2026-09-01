/**
 * Utilitarios monetarios. Toda a aritmetica ocorre em inteiros (centavos ou
 * centesimos), nunca em ponto flutuante.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 150000 => "R$ 1.500,00" */
export function formatBRL(cents: number): string {
  // Intl usa espaco nao separavel (U+00A0) apos "R$"; normalizamos para espaco comum.
  return BRL.format(cents / 100).replace(/\u00a0/g, ' ');
}

/** 350 => "3,5" | 300 => "3" | 20000 => "200" */
export function formatCenti(centi: number): string {
  const negative = centi < 0;
  const abs = Math.abs(centi);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  let text = String(whole);
  if (frac !== 0) {
    text += `,${String(frac).padStart(2, '0').replace(/0$/, '')}`;
  }
  return negative ? `-${text}` : text;
}

const DECIMAL = /^-?\d{1,9}(?:[.,]\d{1,2})?$/;

/**
 * Converte "3,5" | "3.5" | 3.5 para centesimos inteiros (350).
 * Retorna null para entradas invalidas (inclusive precisao acima de 2 casas).
 */
export function parseToCenti(value: string | number): number | null {
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value.trim();
  if (!raw || !DECIMAL.test(raw)) return null;
  const negative = raw.startsWith('-');
  const [whole = '0', frac = ''] = raw.replace('-', '').replace(',', '.').split('.');
  const centi = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(centi)) return null;
  return negative ? -centi : centi;
}

/**
 * Divisao inteira com arredondamento meio-para-cima em valor absoluto.
 * Usada para reduzir produtos de centesimos de volta a centavos.
 */
export function divideRound(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator) || 1;
  const abs = Math.abs(numerator);
  const den = Math.abs(denominator);
  return sign * Math.floor((abs * 2 + den) / (den * 2));
}
