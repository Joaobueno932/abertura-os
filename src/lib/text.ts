/**
 * Padronizacao de texto aplicada no backend antes da persistencia.
 *
 * Regras (requisito 8):
 *  - campos textuais comuns nao devem ser gravados integralmente em CAIXA ALTA;
 *  - o sistema NAO capitaliza automaticamente a primeira letra;
 *  - siglas, numeros e a capitalizacao intencional do usuario sao preservados;
 *  - o campo Descricao e a excecao: sempre gravado em CAIXA ALTA.
 */

/** Siglas preservadas quando um texto todo em maiusculas precisa ser normalizado. */
const ACRONYMS = new Set([
  'SESI', 'SENAI', 'FIEMS', 'SEMAPA', 'IEL', 'SESC', 'SENAC', 'CNI',
  'OS', 'O&M', 'UFV', 'CGH', 'PCH', 'UTE', 'UHE', 'BT', 'MT', 'AT',
  'CA', 'CC', 'KM', 'KW', 'KWP', 'KWH', 'MW', 'MWP', 'MWH', 'CFTV',
  'MS', 'MT', 'SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'GO', 'DF', 'BA',
  'BR', 'MS-', 'EPI', 'NR', 'NR10', 'NR35', 'ART', 'CNPJ', 'CPF',
]);

const ROMAN = /^[IVXLCDM]{1,7}$/;

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isAllUpperCase(value: string): boolean {
  const letters = value.match(/\p{L}/gu);
  if (!letters || letters.length < 2) return false;
  return letters.every((letter) => letter === letter.toLocaleUpperCase('pt-BR'));
}

/**
 * Normaliza um campo textual comum (titulo, local, nomes de cadastro).
 * Se o usuario digitou tudo em caixa alta, o texto e convertido para minusculas
 * preservando siglas conhecidas, numerais romanos e tokens com digitos.
 * Caso contrario, a capitalizacao original e mantida intacta.
 */
export function normalizeText(value: string): string {
  const text = collapse(value);
  if (!text || !isAllUpperCase(text)) return text;

  return text
    .split(' ')
    .map((token) => {
      const core = token.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, '');
      if (!core) return token;
      if (ACRONYMS.has(core)) return token;
      if (/\p{N}/u.test(core)) return token;
      if (core.length <= 3 && ROMAN.test(core)) return token;
      return token.toLocaleLowerCase('pt-BR');
    })
    .join(' ');
}

/** Descricao: sempre persistida e apresentada em CAIXA ALTA. */
export function normalizeDescription(value: string): string {
  return collapse(value).toLocaleUpperCase('pt-BR');
}

/**
 * Sanitiza um trecho para uso em nome de arquivo (defesa contra path traversal
 * e caracteres invalidos em Windows/Linux).
 */
export function sanitizeFileNamePart(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return cleaned || 'documento';
}
