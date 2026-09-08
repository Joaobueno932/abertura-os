/**
 * Construtores minimos de OOXML (WordprocessingML) usados para montar o corpo
 * do documento. O restante do pacote .docx (cabecalho, rodape, imagens,
 * estilos, tema, margens) vem intacto do papel timbrado oficial.
 */

export const BRAND = {
  /** Azul institucional extraido do banner do timbrado. */
  primary: '124489',
  /** Azul secundario do banner. */
  secondary: '006AAE',
  text: '1F2937',
  muted: '6B7280',
  line: 'D6DEEA',
  band: 'EEF3FA',
  white: 'FFFFFF',
} as const;

export const FONT = 'Arial';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Remove caracteres de controle nao permitidos em XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export type RunOptions = {
  bold?: boolean;
  italic?: boolean;
  /** Tamanho em pontos (convertido para half-points). */
  size?: number;
  color?: string;
  caps?: boolean;
  spacingTwips?: number;
};

function runProps(options: RunOptions): string {
  const parts = [`<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`];
  if (options.bold) parts.push('<w:b/><w:bCs/>');
  if (options.italic) parts.push('<w:i/><w:iCs/>');
  if (options.caps) parts.push('<w:caps/>');
  if (options.color) parts.push(`<w:color w:val="${options.color}"/>`);
  if (options.spacingTwips) parts.push(`<w:spacing w:val="${options.spacingTwips}"/>`);
  const halfPoints = Math.round((options.size ?? 10) * 2);
  parts.push(`<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`);
  return `<w:rPr>${parts.join('')}</w:rPr>`;
}

/** Um run de texto. Quebras de linha viram <w:br/>. */
export function run(text: string, options: RunOptions = {}): string {
  const segments = String(text).split(/\r?\n/);
  const body = segments
    .map((segment, index) => {
      const prefix = index === 0 ? '' : '<w:br/>';
      return `${prefix}<w:t xml:space="preserve">${escapeXml(segment)}</w:t>`;
    })
    .join('');
  return `<w:r>${runProps(options)}${body}</w:r>`;
}

export type ParagraphOptions = {
  align?: 'left' | 'center' | 'right' | 'both';
  spaceBefore?: number;
  spaceAfter?: number;
  lineTwips?: number;
  shading?: string;
  indentLeft?: number;
  indentRight?: number;
  /** Recuo apenas da primeira linha, em twips. */
  firstLine?: number;
  keepNext?: boolean;
  borderBottom?: string;
};

export function paragraph(content: string, options: ParagraphOptions = {}): string {
  const props: string[] = [];
  if (options.keepNext) props.push('<w:keepNext/>');
  if (options.shading) {
    props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>`);
  }
  if (options.borderBottom) {
    props.push(
      `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${options.borderBottom}"/></w:pBdr>`,
    );
  }
  if (
    options.indentLeft !== undefined ||
    options.indentRight !== undefined ||
    options.firstLine !== undefined
  ) {
    const firstLine = options.firstLine ? ` w:firstLine="${options.firstLine}"` : '';
    props.push(
      `<w:ind w:left="${options.indentLeft ?? 0}" w:right="${options.indentRight ?? 0}"${firstLine}/>`,
    );
  }
  const before = options.spaceBefore ?? 0;
  const after = options.spaceAfter ?? 0;
  const line = options.lineTwips ? ` w:line="${options.lineTwips}" w:lineRule="auto"` : '';
  props.push(`<w:spacing w:before="${before}" w:after="${after}"${line}/>`);
  if (options.align) {
    const map = { left: 'left', center: 'center', right: 'right', both: 'both' } as const;
    props.push(`<w:jc w:val="${map[options.align]}"/>`);
  }
  return `<w:p><w:pPr>${props.join('')}</w:pPr>${content}</w:p>`;
}

export type CellOptions = {
  widthTwips: number;
  shading?: string;
  /** Cor da borda inferior; ausente = sem borda. */
  borderBottom?: string;
  verticalAlign?: 'top' | 'center' | 'bottom';
  paddingTwips?: number;
  colSpan?: number;
};

export function cell(content: string, options: CellOptions): string {
  const props: string[] = [`<w:tcW w:w="${options.widthTwips}" w:type="dxa"/>`];
  if (options.colSpan && options.colSpan > 1) {
    props.push(`<w:gridSpan w:val="${options.colSpan}"/>`);
  }
  if (options.shading) {
    props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>`);
  }
  props.push(
    options.borderBottom
      ? `<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${options.borderBottom}"/></w:tcBorders>`
      : '<w:tcBorders><w:bottom w:val="nil"/></w:tcBorders>',
  );
  const pad = options.paddingTwips ?? 60;
  props.push(
    `<w:tcMar><w:top w:w="${pad}" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>` +
      `<w:bottom w:w="${pad}" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar>`,
  );
  props.push(`<w:vAlign w:val="${options.verticalAlign ?? 'center'}"/>`);
  return `<w:tc><w:tcPr>${props.join('')}</w:tcPr>${content}</w:tc>`;
}

export function row(cells: string, options: { cantSplit?: boolean } = {}): string {
  const props = options.cantSplit === false ? '' : '<w:trPr><w:cantSplit/></w:trPr>';
  return `<w:tr>${props}${cells}</w:tr>`;
}

export function table(rows: string, columnWidths: number[]): string {
  const grid = columnWidths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  const total = columnWidths.reduce((sum, width) => sum + width, 0);
  return (
    '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${total}" w:type="dxa"/>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>' +
    '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' +
    '<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>' +
    `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`
  );
}

/**
 * Quebra de pagina explicita. Usada para isolar o bloco de valor do
 * atendimento, que sempre comeca em uma pagina nova.
 */
export function pageBreak(): string {
  return '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
}

/** Paragrafo vazio usado como espacador vertical. */
export function spacer(afterTwips = 120): string {
  return paragraph(run('', { size: 4 }), { spaceAfter: afterTwips });
}
