import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { createServiceOrder, getServiceOrderDetail, type ServiceOrderDetail } from '@/lib/os/service';
import { changeServiceOrderStatus } from '@/lib/os/service';
import { createOsSchema } from '@/lib/validation/os';
import { buildOsDocumentModel, documentFileName } from '@/lib/docs/model';
import { generateOsDocx } from '@/lib/docs/docx';
import { generateOsPdf } from '@/lib/docs/pdf';
import { renderOsDocument } from '@/lib/docs';
import { loadLetterheadTemplate } from '@/lib/docs/template';
import { updateRates } from '@/lib/settings';
import { createUser, osPayload, resetDatabase, seedCatalog, seedRates } from './helpers';

let order: ServiceOrderDetail;
let docx: Uint8Array;
let pdf: Uint8Array;

/**
 * Extrai o texto visivel do PDF.
 *
 * Os fluxos de conteudo sao comprimidos com Flate, e o pdf-lib grava o texto
 * das fontes padrao como hex string (<48656c6c6f>), entao e preciso inflar os
 * fluxos e decodificar tanto os literais entre parenteses quanto os hexadecimais.
 */
function extractPdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const chunks: string[] = [raw];

  const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    const chunk = match[1];
    if (!chunk) continue;
    try {
      chunks.push(inflateSync(Buffer.from(chunk, 'latin1')).toString('latin1'));
    } catch {
      // Fluxo nao comprimido ou binario (imagem): nada a extrair.
    }
  }

  return chunks
    .join('\n')
    // Hex strings viram o texto correspondente.
    .replace(/<([0-9A-Fa-f\s]+)>/g, (whole, hex: string) => {
      const clean = hex.replace(/\s+/g, '');
      if (clean.length === 0 || clean.length % 2 !== 0) return whole;
      return Buffer.from(clean, 'hex').toString('latin1');
    })
    // Remove o escape de parenteses usado nos literais.
    .replace(/\\([()\\])/g, '$1');
}

beforeAll(async () => {
  await resetDatabase();
  await seedRates();
  const catalog = await seedCatalog();
  const actor = await createUser({ role: 'USER' });
  const created = await createServiceOrder(createOsSchema.parse(osPayload(catalog)), actor);
  order = (await getServiceOrderDetail(created.id))!;

  const model = buildOsDocumentModel(order);
  docx = await generateOsDocx(model);
  pdf = await generateOsPdf(model);
});

describe('modelo do documento', () => {
  it('monta a memoria de calculo exigida', () => {
    const model = buildOsDocumentModel(order);
    expect(model.costs.technicalMemo).toBe('2 técnicos × R$ 150,00 × 3 horas');
    expect(model.costs.travelMemo).toBe('400 km × R$ 1,50');
    expect(model.costs.technicalSubtotal).toBe('R$ 900,00');
    expect(model.costs.travelSubtotal).toBe('R$ 600,00');
    expect(model.costs.total).toBe('R$ 1.500,00');
    expect(model.costs.outboundKm).toBe('200 km');
    expect(model.costs.returnKm).toBe('200 km');
    expect(model.costs.totalKm).toBe('400 km');
  });

  it('usa o padrao de nome de arquivo previsivel', () => {
    const model = buildOsDocumentModel(order);
    expect(documentFileName(model, 'pdf')).toBe(`OS-${order.number}.pdf`);
    expect(documentFileName(model, 'docx')).toBe(`OS-${order.number}.docx`);
    expect(model.fileBaseName).toMatch(/^OS-\d{11}$/);
  });

  it('exibe a data de abertura no padrao brasileiro', () => {
    const model = buildOsDocumentModel(order);
    expect(model.openedDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(model.expectedDate).toBe('15/09/2026');
  });
});

describe('DOCX gerado a partir do papel timbrado', () => {
  it('e um pacote .docx valido', async () => {
    expect(docx.byteLength).toBeGreaterThan(20_000);
    // Assinatura de arquivo ZIP.
    expect(Buffer.from(docx.slice(0, 2)).toString('latin1')).toBe('PK');
    await expect(JSZip.loadAsync(Buffer.from(docx))).resolves.toBeDefined();
  });

  it('preserva cabecalho, rodape e imagens do template sem alteracao', async () => {
    const template = await loadLetterheadTemplate();
    const source = await JSZip.loadAsync(template.raw);
    const generated = await JSZip.loadAsync(Buffer.from(docx));

    const preserved = [
      'word/header2.xml',
      'word/footer2.xml',
      'word/media/image1.png',
      'word/media/image2.png',
      'word/styles.xml',
      'word/theme/theme1.xml',
      'word/_rels/document.xml.rels',
    ];

    for (const part of preserved) {
      const original = await source.file(part)!.async('uint8array');
      const copy = await generated.file(part)?.async('uint8array');
      expect(copy, `parte ausente no documento gerado: ${part}`).toBeDefined();
      expect(Buffer.from(copy!).equals(Buffer.from(original)), part).toBe(true);
    }
  });

  it('mantem intacto o <w:sectPr> (pagina, margens e referencias de timbrado)', async () => {
    const template = await loadLetterheadTemplate();
    const generated = await JSZip.loadAsync(Buffer.from(docx));
    const documentXml = await generated.file('word/document.xml')!.async('string');

    const sectPr = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(documentXml);
    expect(sectPr).not.toBeNull();
    expect(sectPr![0]).toBe(template.sectPrXml);

    // A4 com as margens do timbrado.
    expect(sectPr![0]).toContain('w:w="11906"');
    expect(sectPr![0]).toContain('w:h="16838"');
    expect(sectPr![0]).toContain('w:top="1560"');
  });

  it('contem os dados da OS, os valores e a memoria de calculo', async () => {
    const generated = await JSZip.loadAsync(Buffer.from(docx));
    const body = await generated.file('word/document.xml')!.async('string');

    expect(body).toContain('ORDEM DE SERVIÇO');
    expect(body).toContain(`Nº ${order.number}`);
    expect(body).toContain('manutenção preventiva');
    expect(body).toContain('FIEMS');
    expect(body).toContain('Usina Solar Campo Grande I');
    expect(body).toContain('Joao Pinheiro');
    expect(body).toContain('15/09/2026');
    expect(body).toContain('REALIZAR MANUTENÇÃO PREVENTIVA E INSPEÇÃO DOS EQUIPAMENTOS.');

    expect(body).toContain('R$ 150,00');
    expect(body).toContain('R$ 1,50');
    expect(body).toContain('R$ 900,00');
    expect(body).toContain('R$ 600,00');
    expect(body).toContain('R$ 1.500,00');

    expect(body).toContain('2 técnicos × R$ 150,00 × 3 horas');
    expect(body).toContain('400 km × R$ 1,50');
    expect(body).toContain('TOTAL DO ATENDIMENTO');
  });

  it('isola o valor do atendimento em uma pagina propria', async () => {
    const generated = await JSZip.loadAsync(Buffer.from(docx));
    const body = await generated.file('word/document.xml')!.async('string');

    expect(body).toContain('VALOR DO ATENDIMENTO');
    expect(body).not.toContain('CUSTOS DO ATENDIMENTO');

    // A quebra de pagina vem ANTES da faixa de valor, nunca depois.
    const pageBreakAt = body.indexOf('<w:br w:type="page"/>');
    expect(pageBreakAt).toBeGreaterThan(-1);
    expect(pageBreakAt).toBeLessThan(body.indexOf('VALOR DO ATENDIMENTO'));
    expect(body.indexOf('DESCRIÇÃO')).toBeLessThan(pageBreakAt);
  });

  it('lista os tecnicos do atendimento', async () => {
    const generated = await JSZip.loadAsync(Buffer.from(docx));
    const body = await generated.file('word/document.xml')!.async('string');
    expect(body).toContain('TÉCNICOS DO ATENDIMENTO');
    expect(body).toContain('Tecnico Um');
    expect(body).toContain('Tecnico Dois');
    expect(body).toContain('CLIENTE/INSTITUIÇÃO');
  });

  it('contem a area de aprovacao do cliente', async () => {
    const generated = await JSZip.loadAsync(Buffer.from(docx));
    const body = await generated.file('word/document.xml')!.async('string');
    expect(body).toContain('APROVAÇÃO DO SERVIÇO');
    expect(body).toContain('Nome do responsável');
    expect(body).toContain('Cargo/Função');
    expect(body).toContain('Assinatura');
  });

  it('escapa caracteres especiais em vez de quebrar o XML', async () => {
    const catalog = await prisma.plant.findFirstOrThrow();
    const institution = await prisma.institution.findFirstOrThrow();
    const responsible = await prisma.responsible.findFirstOrThrow();
    const actor = await createUser({ role: 'USER' });

    const created = await createServiceOrder(
      createOsSchema.parse(
        osPayload(
          { plant: catalog, institution, responsible },
          { title: 'teste <script> & "aspas"', description: 'a & b < c > d' },
        ),
      ),
      actor,
    );
    const detail = (await getServiceOrderDetail(created.id))!;
    const bytes = await generateOsDocx(buildOsDocumentModel(detail));
    const generated = await JSZip.loadAsync(Buffer.from(bytes));
    const body = await generated.file('word/document.xml')!.async('string');

    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('&amp;');
    expect(body).not.toContain('<script>');
  });
});

describe('PDF gerado', () => {
  it('nao esta corrompido', () => {
    const header = Buffer.from(pdf.slice(0, 8)).toString('latin1');
    expect(header.startsWith('%PDF-')).toBe(true);
    const tail = Buffer.from(pdf.slice(-1024)).toString('latin1');
    expect(tail).toContain('%%EOF');
    expect(pdf.byteLength).toBeGreaterThan(20_000);
  });

  it('usa a pagina e as margens lidas do template', async () => {
    const template = await loadLetterheadTemplate();
    // A4: 595.3 x 841.9 pt, exatamente como o <w:pgSz> do timbrado.
    expect(template.pageWidthPt).toBeCloseTo(595.3, 1);
    expect(template.pageHeightPt).toBeCloseTo(841.9, 1);

    const reloaded = await PDFDocument.load(pdf);
    for (const page of reloaded.getPages()) {
      const size = page.getSize();
      expect(size.width).toBeCloseTo(template.pageWidthPt, 1);
      expect(size.height).toBeCloseTo(template.pageHeightPt, 1);
    }
  });

  it('embute as duas imagens do papel timbrado, na resolucao original', () => {
    const raw = Buffer.from(pdf).toString('latin1');

    // O pdf-lib reencoda o PNG como XObject, entao a evidencia da origem sao as
    // dimensoes em pixels: image1 (cabecalho) 615x132 e image2 (rodape) 254x146.
    expect(raw).toMatch(/\/Width 615[\s\S]{0,300}?\/Height 132/);
    expect(raw).toMatch(/\/Width 254[\s\S]{0,300}?\/Height 146/);

    const images = raw.match(/\/Subtype \/Image/g) ?? [];
    expect(images.length).toBe(2);
  });

  it('desenha o cabecalho e o rodape em todas as paginas', async () => {
    const reloaded = await PDFDocument.load(pdf);
    const pageCount = reloaded.getPageCount();
    // O valor do atendimento comeca em pagina propria: sempre ha uma segunda.
    expect(pageCount).toBeGreaterThanOrEqual(2);

    // Uma invocacao de XObject por banner, por pagina.
    const content = extractPdfText(pdf);
    const draws = content.match(/\/Image-\d+ Do/g) ?? [];
    expect(draws.length).toBe(pageCount * 2);
  });

  it('contem o numero da OS, os dados e os valores', () => {
    const text = extractPdfText(pdf);
    expect(text).toContain(order.number);
    expect(text).toContain('ORDEM DE SERVI');
    expect(text).toContain('FIEMS');
    expect(text).toContain('15/09/2026');
    expect(text).toContain('R$ 900,00');
    expect(text).toContain('R$ 600,00');
    expect(text).toContain('R$ 1.500,00');
    expect(text).toContain('TOTAL DO ATENDIMENTO');
    expect(text).toContain('VALOR DO ATENDIMENTO');
    expect(text).toContain('APROVA');
  });

  it('mantem a memoria de calculo legivel', () => {
    const text = extractPdfText(pdf);
    expect(text).toContain('R$ 150,00');
    expect(text).toContain('R$ 1,50');
    expect(text).toContain('400 km');
  });

  it('lida com caracteres fora do WinAnsi sem falhar', async () => {
    const plant = await prisma.plant.findFirstOrThrow();
    const institution = await prisma.institution.findFirstOrThrow();
    const responsible = await prisma.responsible.findFirstOrThrow();
    const actor = await createUser({ role: 'USER' });

    const created = await createServiceOrder(
      createOsSchema.parse(
        osPayload(
          { plant, institution, responsible },
          { title: 'inspeção 🔧 térmica', description: 'verificar 温度 e vibração' },
        ),
      ),
      actor,
    );
    const detail = (await getServiceOrderDetail(created.id))!;
    const bytes = await generateOsPdf(buildOsDocumentModel(detail));
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });
});

describe('observacao de finalizacao no documento', () => {
  it('nao aparece enquanto a OS nao foi concluida', async () => {
    const model = buildOsDocumentModel(order);
    expect(model.completionNote).toBe('');

    const generated = await JSZip.loadAsync(Buffer.from(docx));
    const body = await generated.file('word/document.xml')!.async('string');
    expect(body).not.toContain('OBSERVAÇÃO DE FINALIZAÇÃO');
  });

  it('entra no DOCX e no PDF depois da conclusao, antes do valor', async () => {
    const plant = await prisma.plant.findFirstOrThrow();
    const institution = await prisma.institution.findFirstOrThrow();
    const responsible = await prisma.responsible.findFirstOrThrow();
    const actor = await createUser({ role: 'USER' });

    const created = await createServiceOrder(
      createOsSchema.parse(osPayload({ plant, institution, responsible })),
      actor,
    );
    await changeServiceOrderStatus(created.id, 'CONCLUIDA', actor, {
      completionNote: 'Inversor 2 substituído e geração conferida no local.',
    });

    const detail = (await getServiceOrderDetail(created.id))!;
    const model = buildOsDocumentModel(detail);
    expect(model.completionNote).toBe('Inversor 2 substituído e geração conferida no local.');

    const generated = await JSZip.loadAsync(Buffer.from(await generateOsDocx(model)));
    const body = await generated.file('word/document.xml')!.async('string');
    expect(body).toContain('OBSERVAÇÃO DE FINALIZAÇÃO');
    expect(body).toContain('Inversor 2 substituído e geração conferida no local.');

    // Entre a descricao e a quebra que isola o valor do atendimento.
    const noteAt = body.indexOf('OBSERVAÇÃO DE FINALIZAÇÃO');
    expect(body.indexOf('DESCRIÇÃO')).toBeLessThan(noteAt);
    expect(noteAt).toBeLessThan(body.indexOf('<w:br w:type="page"/>'));

    const text = extractPdfText(await generateOsPdf(model));
    expect(text).toContain('Inversor 2 substitu');
  });
});

describe('renderOsDocument', () => {
  it('entrega PDF com o nome e o tipo corretos', async () => {
    const result = await renderOsDocument(order, 'pdf');
    expect(result.fileName).toBe(`OS-${order.number}.pdf`);
    expect(result.contentType).toBe('application/pdf');
    expect(Buffer.from(result.bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('entrega DOCX com o nome e o tipo corretos', async () => {
    const result = await renderOsDocument(order, 'docx');
    expect(result.fileName).toBe(`OS-${order.number}.docx`);
    expect(result.contentType).toContain('wordprocessingml.document');
    expect(Buffer.from(result.bytes.slice(0, 2)).toString('latin1')).toBe('PK');
  });
});

describe('integridade historica no documento', () => {
  it('o documento de uma OS antiga mantem os valores originais', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await updateRates({ technicalHourlyRateCents: 17_000, kmRateCents: 170 }, admin.id);

    const stored = (await getServiceOrderDetail(order.id))!;
    const model = buildOsDocumentModel(stored);

    expect(model.costs.hourlyRate).toBe('R$ 150,00');
    expect(model.costs.kmRate).toBe('R$ 1,50');
    expect(model.costs.total).toBe('R$ 1.500,00');

    const generated = await JSZip.loadAsync(Buffer.from(await generateOsDocx(model)));
    const body = await generated.file('word/document.xml')!.async('string');
    expect(body).toContain('R$ 150,00');
    expect(body).not.toContain('R$ 170,00');
  });
});

describe('template do papel timbrado', () => {
  it('e lido do arquivo .docx presente na raiz do projeto', async () => {
    const template = await loadLetterheadTemplate();
    expect(template.sourcePath).toMatch(/\.docx$/i);
    await expect(readFile(template.sourcePath)).resolves.toBeDefined();

    expect(template.header).not.toBeNull();
    expect(template.footer).not.toBeNull();
    expect(template.header!.imagePart).toBe('word/media/image1.png');
    expect(template.footer!.imagePart).toBe('word/media/image2.png');
    expect(template.header!.contentType).toBe('image/png');

    // Margens do timbrado, em pontos (twips / 20).
    expect(template.marginLeftPt).toBeCloseTo(70.9, 1);
    expect(template.marginRightPt).toBeCloseTo(85.05, 2);
    expect(template.marginTopPt).toBeCloseTo(78, 1);
    expect(template.marginBottomPt).toBeCloseTo(92.15, 2);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
