/**
 * As fontes padrao do PDF (Helvetica) usam a codificacao WinAnsi, que cobre o
 * portugues completo (acentos, cedilha, aspas tipograficas, travessao e o sinal
 * de multiplicacao). Caracteres fora dessa tabela - emoji, alfabetos nao
 * latinos - fariam a geracao falhar, entao sao convertidos para o equivalente
 * mais proximo antes da escrita.
 */

// Caracteres da faixa 0x80-0x9F do WinAnsi (nao coincidem com Unicode).
const WINANSI_HIGH = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
    0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ],
);

function isWinAnsi(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WINANSI_HIGH.has(codePoint);
}

/** Converte um texto arbitrario em uma string totalmente codificavel em WinAnsi. */
export function toWinAnsi(value: string): string {
  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n');
  let output = '';

  for (const char of normalized) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === '\n' || char === '\t') {
      output += char;
      continue;
    }
    if (isWinAnsi(codePoint)) {
      output += char;
      continue;
    }
    // Tenta remover diacriticos (ex.: caracteres latinos estendidos).
    const stripped = char.normalize('NFD').replace(/\p{M}/gu, '');
    if (stripped && [...stripped].every((c) => isWinAnsi(c.codePointAt(0) ?? 0))) {
      output += stripped;
      continue;
    }
    output += '?';
  }

  return output;
}
