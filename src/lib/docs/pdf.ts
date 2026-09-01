import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import { bannerXPt, loadLetterheadTemplate, type LetterheadTemplate } from './template';
import { APPROVAL_LINES, documentSections, type OsDocumentModel } from './model';
import { toWinAnsi } from './winansi';

/**
 * Renderizacao do PDF da Ordem de Servico.
 *
 * O papel timbrado e preservado de forma literal: as MESMAS imagens de
 * cabecalho e rodape embutidas no .docx oficial sao extraidas do pacote e
 * desenhadas nas MESMAS coordenadas que o Word usa (margem + recuo do
 * paragrafo), sobre uma pagina com as dimensoes e margens lidas do <w:sectPr>
 * do template. Nao ha nenhuma dependencia de sistema operacional: o PDF e
 * produzido inteiramente em JavaScript.
 */

const COLOR = {
  primary: rgb(0x12 / 255, 0x44 / 255, 0x89 / 255),
  secondary: rgb(0x00 / 255, 0x6a / 255, 0xae / 255),
  text: rgb(0x1f / 255, 0x29 / 255, 0x37 / 255),
  muted: rgb(0x6b / 255, 0x72 / 255, 0x80 / 255),
  line: rgb(0xd6 / 255, 0xde / 255, 0xea / 255),
  band: rgb(0xee / 255, 0xf3 / 255, 0xfa / 255),
  white: rgb(1, 1, 1),
};

const SIZE = {
  title: 16,
  number: 12,
  heading: 9.5,
  label: 7.5,
  value: 10,
  memo: 9.5,
  total: 15,
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

/** Estado de layout: cursor vertical + quebra de pagina automatica. */
class Layout {
  private page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly template: LetterheadTemplate,
    private readonly banners: { header: PDFImage | null; footer: PDFImage | null },
    private readonly fonts: Fonts,
  ) {
    this.page = this.newPage();
    this.y = this.top;
  }

  get left(): number {
    return this.template.marginLeftPt;
  }

  get right(): number {
    return this.template.pageWidthPt - this.template.marginRightPt;
  }

  get width(): number {
    return this.right - this.left;
  }

  get top(): number {
    return this.template.pageHeightPt - this.template.marginTopPt;
  }

  get bottom(): number {
    return this.template.marginBottomPt;
  }

  get current(): PDFPage {
    return this.page;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([this.template.pageWidthPt, this.template.pageHeightPt]);
    const { header, footer } = this.banners;

    if (header && this.template.header) {
      page.drawImage(header, {
        x: bannerXPt(this.template, this.template.header),
        y: this.template.pageHeightPt - this.template.headerOffsetPt - this.template.header.heightPt,
        width: this.template.header.widthPt,
        height: this.template.header.heightPt,
      });
    }
    if (footer && this.template.footer) {
      page.drawImage(footer, {
        x: bannerXPt(this.template, this.template.footer),
        y: this.template.footerOffsetPt,
        width: this.template.footer.widthPt,
        height: this.template.footer.heightPt,
      });
    }
    return page;
  }

  /** Garante espaco vertical; abre nova pagina timbrada quando necessario. */
  ensure(height: number): void {
    if (this.y - height >= this.bottom) return;
    this.page = this.newPage();
    this.y = this.top;
  }

  gap(height: number): void {
    this.y -= height;
  }

  text(
    value: string,
    options: {
      x?: number;
      size?: number;
      font?: keyof Fonts;
      color?: ReturnType<typeof rgb>;
      align?: 'left' | 'right' | 'center';
      maxWidth?: number;
    } = {},
  ): void {
    const size = options.size ?? SIZE.value;
    const font = this.fonts[options.font ?? 'regular'];
    const content = toWinAnsi(value);
    const x = options.x ?? this.left;
    const maxWidth = options.maxWidth ?? this.right - x;
    const textWidth = font.widthOfTextAtSize(content, size);

    let drawX = x;
    if (options.align === 'right') drawX = x + maxWidth - textWidth;
    else if (options.align === 'center') drawX = x + (maxWidth - textWidth) / 2;

    this.page.drawText(content, {
      x: drawX,
      y: this.y - size,
      size,
      font,
      color: options.color ?? COLOR.text,
    });
  }

  rect(options: {
    x?: number;
    width?: number;
    height: number;
    color: ReturnType<typeof rgb>;
    yOffset?: number;
  }): void {
    this.page.drawRectangle({
      x: options.x ?? this.left,
      y: this.y - options.height + (options.yOffset ?? 0),
      width: options.width ?? this.width,
      height: options.height,
      color: options.color,
    });
  }

  line(y: number, x1 = this.left, x2 = this.right, color = COLOR.line): void {
    this.page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness: 0.7,
      color,
    });
  }

  /** Quebra o texto em linhas que cabem na largura informada. */
  wrap(value: string, maxWidth: number, size: number, font: PDFFont): string[] {
    const lines: string[] = [];
    for (const rawLine of toWinAnsi(value).split('\n')) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  paragraph(
    value: string,
    options: { size?: number; font?: keyof Fonts; color?: ReturnType<typeof rgb>; leading?: number } = {},
  ): void {
    const size = options.size ?? SIZE.value;
    const font = this.fonts[options.font ?? 'regular'];
    const leading = options.leading ?? size * 1.45;
    for (const line of this.wrap(value, this.width, size, font)) {
      this.ensure(leading);
      this.text(line, { size, font: options.font, color: options.color });
      this.y -= leading;
    }
  }
}

function sectionHeading(layout: Layout, title: string): void {
  const height = 18;
  layout.ensure(height + 34);
  layout.gap(12);
  layout.rect({ height, color: COLOR.primary });
  layout.text(title, {
    x: layout.left + 8,
    size: SIZE.heading,
    font: 'bold',
    color: COLOR.white,
    maxWidth: layout.width - 16,
  });
  layout.gap(height + 10);
}

/** Desenha as secoes de campos (1 ou 2 colunas) com filete inferior. */
function drawFields(
  layout: Layout,
  fonts: Fonts,
  rows: { label: string; value: string }[],
  columns: 1 | 2,
): void {
  const gutter = 18;
  const columnWidth = columns === 1 ? layout.width : (layout.width - gutter) / 2;

  /** Desenha rotulo + valor e devolve a linha de base da ultima linha escrita. */
  const drawOne = (field: { label: string; value: string }, x: number): number => {
    const lines = layout.wrap(field.value || '-', columnWidth, SIZE.value, fonts.regular);
    const startY = layout.y;
    layout.text(field.label.toLocaleUpperCase('pt-BR'), {
      x,
      size: SIZE.label,
      font: 'bold',
      color: COLOR.muted,
      maxWidth: columnWidth,
    });
    let cursor = startY - SIZE.label - 6;
    let lastBaseline = cursor - SIZE.value;
    for (const line of lines) {
      const saved = layout.y;
      layout.y = cursor;
      layout.text(line, { x, size: SIZE.value, maxWidth: columnWidth });
      layout.y = saved;
      lastBaseline = cursor - SIZE.value;
      cursor -= SIZE.value * 1.35;
    }
    return lastBaseline;
  };

  for (let index = 0; index < rows.length; index += columns) {
    const left = rows[index];
    if (!left) break;
    const right = columns === 2 ? rows[index + 1] : undefined;

    const estimated =
      SIZE.label +
      5 +
      Math.max(
        layout.wrap(left.value || '-', columnWidth, SIZE.value, fonts.regular).length,
        right ? layout.wrap(right.value || '-', columnWidth, SIZE.value, fonts.regular).length : 1,
      ) *
        SIZE.value *
        1.35 +
      10;
    layout.ensure(estimated);

    const baselineLeft = drawOne(left, layout.left);
    const baselineRight = right ? drawOne(right, layout.left + columnWidth + gutter) : baselineLeft;
    // Filete abaixo dos descendentes (Helvetica desce ~0,21 em).
    const ruleY = Math.min(baselineLeft, baselineRight) - 4.5;

    layout.line(ruleY, layout.left, layout.right);
    layout.y = ruleY - 11;
  }
}

function costLine(
  layout: Layout,
  label: string,
  value: string,
  options: { strong?: boolean } = {},
): void {
  layout.ensure(22);
  const baseline = layout.y - SIZE.value;
  layout.text(label, {
    size: SIZE.value,
    font: options.strong ? 'bold' : 'regular',
    color: COLOR.text,
    maxWidth: layout.width * 0.65,
  });
  layout.text(value, {
    x: layout.left + layout.width * 0.65,
    maxWidth: layout.width * 0.35,
    align: 'right',
    size: SIZE.value,
    font: options.strong ? 'bold' : 'regular',
    color: options.strong ? COLOR.primary : COLOR.text,
  });
  const ruleY = baseline - 4.5;
  layout.line(ruleY);
  layout.y = ruleY - 9;
}

function memoLine(layout: Layout, text: string): void {
  const height = SIZE.memo + 12;
  layout.ensure(height + 8);
  layout.gap(6);
  layout.rect({ height, color: COLOR.band });
  layout.text(text, {
    x: layout.left + 8,
    size: SIZE.memo,
    font: 'italic',
    color: COLOR.secondary,
    maxWidth: layout.width - 16,
  });
  layout.gap(height + 8);
}

function subHeading(layout: Layout, text: string): void {
  layout.ensure(30);
  layout.gap(8);
  layout.text(text, { size: SIZE.heading, font: 'bold', color: COLOR.primary });
  layout.gap(SIZE.heading + 8);
}

function drawCosts(layout: Layout, model: OsDocumentModel): void {
  const { costs } = model;
  sectionHeading(layout, 'CUSTOS DO ATENDIMENTO');

  layout.ensure(170);
  subHeading(layout, 'SERVIÇO TÉCNICO');
  costLine(layout, 'Quantidade de técnicos', costs.technicianCount);
  costLine(layout, 'Horas por técnico', costs.hoursPerTechnician);
  costLine(layout, 'Valor da hora técnica', costs.hourlyRate);
  memoLine(layout, costs.technicalMemo);
  costLine(layout, 'Subtotal das horas técnicas', costs.technicalSubtotal, { strong: true });

  layout.ensure(200);
  subHeading(layout, 'DESLOCAMENTO');
  costLine(layout, 'Quilometragem de ida', costs.outboundKm);
  costLine(layout, 'Quilometragem de volta', costs.returnKm);
  costLine(layout, 'Quilometragem total', costs.totalKm);
  costLine(layout, 'Valor por quilômetro', costs.kmRate);
  memoLine(layout, costs.travelMemo);
  costLine(layout, 'Subtotal de deslocamento', costs.travelSubtotal, { strong: true });

  const bandHeight = 34;
  layout.ensure(bandHeight + 20);
  layout.gap(12);
  layout.rect({ height: bandHeight, color: COLOR.primary });
  const saved = layout.y;
  layout.y = saved - 10;
  layout.text('TOTAL DO ATENDIMENTO', {
    x: layout.left + 10,
    size: SIZE.heading + 1,
    font: 'bold',
    color: COLOR.white,
    maxWidth: layout.width * 0.6,
  });
  layout.text(costs.total, {
    x: layout.left + layout.width * 0.6,
    maxWidth: layout.width * 0.4 - 10,
    align: 'right',
    size: SIZE.total,
    font: 'bold',
    color: COLOR.white,
  });
  layout.y = saved;
  layout.gap(bandHeight + 6);
}

function drawApproval(layout: Layout): void {
  sectionHeading(layout, 'APROVAÇÃO DO SERVIÇO');
  layout.paragraph(
    'Ao assinar, o cliente declara ciência e aprova a execução do serviço nas condições e valores acima.',
    { size: SIZE.label + 0.5, color: COLOR.muted },
  );
  layout.gap(10);

  for (const field of APPROVAL_LINES) {
    layout.ensure(34);
    const baseline = layout.y - SIZE.value;
    layout.text(`${field.label}:`, { size: SIZE.value, maxWidth: layout.width * 0.35 });
    if (field.value) {
      // O proprio valor ja desenha a pauta (ex.: ____/____/________).
      layout.text(field.value, { x: layout.left + layout.width * 0.35, size: SIZE.value });
    } else {
      layout.line(baseline - 4.5, layout.left + layout.width * 0.35, layout.right, COLOR.text);
    }
    layout.y = baseline - 22;
  }
}

/** Gera o PDF da OS. Retorna os bytes prontos para download. */
export async function generateOsPdf(model: OsDocumentModel): Promise<Uint8Array> {
  const template = await loadLetterheadTemplate();
  const doc = await PDFDocument.create();

  doc.setTitle(`Ordem de Serviço ${model.number}`);
  // Subject identifica a empresa emissora; Producer/Creator, a aplicacao.
  doc.setSubject('Ordem de Serviço - Em Conta Ltda');
  doc.setProducer('O&M OS');
  doc.setCreator('O&M OS');

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  const embed = async (banner: typeof template.header): Promise<PDFImage | null> => {
    if (!banner) return null;
    return banner.contentType === 'image/jpeg'
      ? doc.embedJpg(banner.image)
      : doc.embedPng(banner.image);
  };

  const banners = { header: await embed(template.header), footer: await embed(template.footer) };
  const layout = new Layout(doc, template, banners, fonts);

  layout.text('ORDEM DE SERVIÇO', {
    size: SIZE.title,
    font: 'bold',
    color: COLOR.primary,
    align: 'center',
  });
  layout.gap(SIZE.title + 6);
  layout.text(model.numberLabel, {
    size: SIZE.number,
    font: 'bold',
    color: COLOR.secondary,
    align: 'center',
  });
  layout.gap(SIZE.number + 8);
  layout.line(layout.y + 4);
  layout.gap(4);

  for (const section of documentSections(model)) {
    if (section.kind === 'fields') {
      sectionHeading(layout, section.heading);
      drawFields(layout, fonts, section.rows, section.columns);
    } else if (section.kind === 'paragraph') {
      sectionHeading(layout, section.heading);
      layout.paragraph(section.text, { size: SIZE.value, leading: SIZE.value * 1.5 });
      layout.gap(4);
    } else if (section.kind === 'costs') {
      drawCosts(layout, model);
    } else {
      drawApproval(layout);
    }
  }

  // useObjectStreams: false mantem a estrutura do PDF em objetos simples, o que
  // maximiza a compatibilidade com leitores antigos e visualizadores embutidos
  // de e-mail - o documento e enviado ao cliente final.
  return doc.save({ useObjectStreams: false });
}
