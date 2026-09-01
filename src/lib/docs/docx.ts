import JSZip from 'jszip';
import { loadLetterheadTemplate, TemplateError, TWIPS_PER_POINT } from './template';
import {
  APPROVAL_LINES,
  documentSections,
  type DocRow,
  type OsDocumentModel,
} from './model';
import { BRAND, cell, paragraph, row, run, spacer, table } from './ooxml';

/**
 * Geracao do DOCX da Ordem de Servico.
 *
 * O papel timbrado fornecido e usado como base literal: o pacote .docx original
 * e reaberto e apenas o corpo (word/document.xml) e substituido. Cabecalho,
 * rodape, imagens, tema, estilos, fontes, margens e dimensoes da pagina
 * permanecem exatamente como no arquivo oficial - inclusive o <w:sectPr>, que e
 * copiado sem alteracao.
 */

const TITLE_SIZE = 16;
const NUMBER_SIZE = 12;
const HEADING_SIZE = 9.5;
const LABEL_SIZE = 8.5;
const VALUE_SIZE = 10;
const TOTAL_SIZE = 14;

/** Faixa de secao: texto branco sobre o azul institucional. */
function sectionHeading(text: string): string {
  return paragraph(
    run(text, { bold: true, size: HEADING_SIZE, color: BRAND.white, spacingTwips: 12 }),
    {
      shading: BRAND.primary,
      spaceBefore: 220,
      spaceAfter: 90,
      indentLeft: 0,
      indentRight: 0,
      // Recuo apenas da primeira linha: afasta o texto da borda da faixa sem
      // encolher a area sombreada.
      firstLine: 120,
      keepNext: true,
    },
  );
}

function labelRun(text: string): string {
  return run(text.toLocaleUpperCase('pt-BR'), {
    bold: true,
    size: LABEL_SIZE,
    color: BRAND.muted,
    spacingTwips: 8,
  });
}

function valueRun(text: string): string {
  return run(text || '-', { size: VALUE_SIZE, color: BRAND.text });
}

/** Celula rotulo + valor empilhados, com filete inferior. */
function fieldCell(field: DocRow, widthTwips: number, colSpan = 1): string {
  return cell(
    paragraph(labelRun(field.label), { spaceAfter: 20 }) +
      paragraph(valueRun(field.value), { spaceAfter: 0 }),
    { widthTwips, borderBottom: BRAND.line, verticalAlign: 'top', colSpan },
  );
}

function fieldsTable(rows: DocRow[], columns: 1 | 2, contentWidth: number): string {
  if (columns === 1) {
    return table(
      rows.map((field) => row(fieldCell(field, contentWidth))).join(''),
      [contentWidth],
    );
  }
  const half = Math.floor(contentWidth / 2);
  const rest = contentWidth - half;
  const built: string[] = [];
  for (let index = 0; index < rows.length; index += 2) {
    const left = rows[index];
    const right = rows[index + 1];
    if (!left) break;
    built.push(
      row(
        fieldCell(left, half) +
          (right
            ? fieldCell(right, rest)
            : cell(paragraph(''), { widthTwips: rest, borderBottom: BRAND.line })),
      ),
    );
  }
  return table(built.join(''), [half, rest]);
}

/** Linha "rotulo .... valor" usada no detalhamento de custos. */
function costRow(label: string, value: string, widths: [number, number], strong = false): string {
  return row(
    cell(paragraph(run(label, { size: VALUE_SIZE, color: BRAND.text, bold: strong })), {
      widthTwips: widths[0],
      borderBottom: BRAND.line,
    }) +
      cell(
        paragraph(
          run(value, { size: VALUE_SIZE, color: strong ? BRAND.primary : BRAND.text, bold: strong }),
          { align: 'right' },
        ),
        { widthTwips: widths[1], borderBottom: BRAND.line },
      ),
  );
}

function costsBlock(model: OsDocumentModel, contentWidth: number): string {
  const valueWidth = Math.round(contentWidth * 0.32);
  const labelWidth = contentWidth - valueWidth;
  const widths: [number, number] = [labelWidth, valueWidth];
  const { costs } = model;

  const subHeading = (text: string) =>
    paragraph(run(text, { bold: true, size: HEADING_SIZE, color: BRAND.primary, spacingTwips: 10 }), {
      spaceBefore: 160,
      spaceAfter: 60,
      keepNext: true,
    });

  const memo = (text: string) =>
    paragraph(run(text, { italic: true, size: VALUE_SIZE, color: BRAND.secondary }), {
      spaceBefore: 70,
      spaceAfter: 40,
      shading: BRAND.band,
    });

  return [
    sectionHeading('CUSTOS DO ATENDIMENTO'),

    subHeading('SERVIÇO TÉCNICO'),
    table(
      [
        costRow('Quantidade de técnicos', costs.technicianCount, widths),
        costRow('Horas por técnico', costs.hoursPerTechnician, widths),
        costRow('Valor da hora técnica', costs.hourlyRate, widths),
      ].join(''),
      widths,
    ),
    memo(costs.technicalMemo),
    table(costRow('Subtotal das horas técnicas', costs.technicalSubtotal, widths, true), widths),

    subHeading('DESLOCAMENTO'),
    table(
      [
        costRow('Quilometragem de ida', costs.outboundKm, widths),
        costRow('Quilometragem de volta', costs.returnKm, widths),
        costRow('Quilometragem total', costs.totalKm, widths),
        costRow('Valor por quilômetro', costs.kmRate, widths),
      ].join(''),
      widths,
    ),
    memo(costs.travelMemo),
    table(costRow('Subtotal de deslocamento', costs.travelSubtotal, widths, true), widths),

    spacer(120),
    table(
      row(
        cell(
          paragraph(
            run('TOTAL DO ATENDIMENTO', {
              bold: true,
              size: HEADING_SIZE + 1,
              color: BRAND.white,
              spacingTwips: 14,
            }),
          ),
          { widthTwips: labelWidth, shading: BRAND.primary, paddingTwips: 140 },
        ) +
          cell(
            paragraph(run(costs.total, { bold: true, size: TOTAL_SIZE, color: BRAND.white }), {
              align: 'right',
            }),
            { widthTwips: valueWidth, shading: BRAND.primary, paddingTwips: 140 },
          ),
      ),
      widths,
    ),
  ].join('');
}

function approvalBlock(contentWidth: number): string {
  const labelWidth = Math.round(contentWidth * 0.32);
  const lineWidth = contentWidth - labelWidth;

  const lines = APPROVAL_LINES.map((field) =>
    row(
      cell(paragraph(run(`${field.label}:`, { size: VALUE_SIZE, color: BRAND.text })), {
        widthTwips: labelWidth,
        verticalAlign: 'bottom',
        paddingTwips: 130,
      }) +
        cell(
          field.value
            ? paragraph(run(field.value, { size: VALUE_SIZE, color: BRAND.text }))
            : paragraph(run('', { size: VALUE_SIZE })),
          {
            widthTwips: lineWidth,
            // Quando o campo ja traz a pauta (ex.: ____/____/________), a borda
            // da celula produziria uma segunda linha.
            ...(field.value ? {} : { borderBottom: BRAND.text }),
            verticalAlign: 'bottom',
            paddingTwips: 130,
          },
        ),
    ),
  ).join('');

  return (
    sectionHeading('APROVAÇÃO DO SERVIÇO') +
    paragraph(
      run(
        'Ao assinar, o cliente declara ciência e aprova a execução do serviço nas condições e valores acima.',
        { size: LABEL_SIZE + 0.5, color: BRAND.muted },
      ),
      { spaceAfter: 140 },
    ) +
    table(lines, [labelWidth, lineWidth])
  );
}

/** Monta o XML do corpo do documento a partir do modelo da OS. */
export function buildDocumentBody(model: OsDocumentModel, contentWidthTwips: number): string {
  const parts: string[] = [
    paragraph(run('ORDEM DE SERVIÇO', { bold: true, size: TITLE_SIZE, color: BRAND.primary, spacingTwips: 20 }), {
      align: 'center',
      spaceAfter: 40,
    }),
    paragraph(run(model.numberLabel, { bold: true, size: NUMBER_SIZE, color: BRAND.secondary }), {
      align: 'center',
      spaceAfter: 60,
      borderBottom: BRAND.line,
    }),
  ];

  for (const section of documentSections(model)) {
    if (section.kind === 'fields') {
      parts.push(sectionHeading(section.heading));
      parts.push(fieldsTable(section.rows, section.columns, contentWidthTwips));
    } else if (section.kind === 'paragraph') {
      parts.push(sectionHeading(section.heading));
      parts.push(
        paragraph(run(section.text, { size: VALUE_SIZE, color: BRAND.text }), {
          align: 'both',
          lineTwips: 280,
          spaceAfter: 60,
        }),
      );
    } else if (section.kind === 'costs') {
      parts.push(costsBlock(model, contentWidthTwips));
    } else {
      parts.push(approvalBlock(contentWidthTwips));
    }
  }

  return parts.join('');
}

/**
 * Gera o .docx da OS a partir do papel timbrado oficial.
 * Retorna os bytes do arquivo pronto para download.
 */
export async function generateOsDocx(model: OsDocumentModel): Promise<Uint8Array> {
  const template = await loadLetterheadTemplate();
  const zip = await JSZip.loadAsync(template.raw);

  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new TemplateError('Template invalido: word/document.xml ausente.');
  const original = await documentFile.async('string');

  const bodyOpen = original.indexOf('<w:body>');
  const sectPrStart = original.indexOf('<w:sectPr');
  if (bodyOpen < 0 || sectPrStart < 0 || sectPrStart < bodyOpen) {
    throw new TemplateError('Template invalido: nao foi possivel localizar o corpo do documento.');
  }

  const contentWidthTwips = Math.round(
    (template.pageWidthPt - template.marginLeftPt - template.marginRightPt) * TWIPS_PER_POINT,
  );

  // Preserva cabecalho do XML (namespaces) e todo o <w:sectPr> original.
  const head = original.slice(0, bodyOpen + '<w:body>'.length);
  const tail = original.slice(sectPrStart);
  const merged = head + buildDocumentBody(model, contentWidthTwips) + tail;

  zip.file('word/document.xml', merged);

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
