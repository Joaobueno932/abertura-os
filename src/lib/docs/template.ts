import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { env } from '@/lib/env';

/**
 * Leitura e analise do papel timbrado oficial (.docx) fornecido na raiz do
 * projeto. Nada aqui e hardcoded: pagina, margens, cabecalho, rodape, imagens e
 * posicionamentos sao extraidos do proprio arquivo. Se o timbrado for
 * substituido, tanto o DOCX quanto o PDF acompanham automaticamente.
 */

export const TWIPS_PER_POINT = 20;
export const EMU_PER_POINT = 12700;

export type BannerInfo = {
  /** Bytes da imagem do banner (cabecalho ou rodape). */
  image: Uint8Array;
  /** Nome da parte dentro do pacote, ex.: word/media/image1.png */
  imagePart: string;
  contentType: 'image/png' | 'image/jpeg';
  widthPt: number;
  heightPt: number;
  /** Recuo esquerdo do paragrafo que contem a imagem, em twips (pode ser negativo). */
  indentLeftTwips: number;
};

export type LetterheadTemplate = {
  /** Caminho absoluto do .docx usado como base. */
  sourcePath: string;
  /** Conteudo bruto do .docx, para servir de base na geracao. */
  raw: Buffer;
  pageWidthPt: number;
  pageHeightPt: number;
  marginTopPt: number;
  marginRightPt: number;
  marginBottomPt: number;
  marginLeftPt: number;
  /** Distancia da borda superior ate o topo do cabecalho, em pontos. */
  headerOffsetPt: number;
  /** Distancia da borda inferior ate a base do rodape, em pontos. */
  footerOffsetPt: number;
  /** XML completo de <w:sectPr> do template, reaproveitado sem alteracao. */
  sectPrXml: string;
  header: BannerInfo | null;
  footer: BannerInfo | null;
};

function attr(xml: string, tag: string, name: string): string | null {
  const element = new RegExp(`<${tag}\\b[^>]*>`).exec(xml);
  if (!element) return null;
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(element[0]);
  return match?.[1] ?? null;
}

function numberAttr(xml: string, tag: string, name: string, fallback: number): number {
  const value = attr(xml, tag, name);
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveRelationship(relsXml: string, id: string): string | null {
  const match = new RegExp(`<Relationship[^>]*Id="${id}"[^>]*>`).exec(relsXml);
  if (!match) return null;
  return /\bTarget="([^"]*)"/.exec(match[0])?.[1] ?? null;
}

function referenceId(sectPr: string, tag: 'headerReference' | 'footerReference', type: string): string | null {
  const match = new RegExp(`<w:${tag}[^>]*w:type="${type}"[^>]*>`).exec(sectPr);
  if (!match) return null;
  return /\br:id="([^"]*)"/.exec(match[0])?.[1] ?? null;
}

async function readBanner(
  zip: JSZip,
  partName: string,
): Promise<BannerInfo | null> {
  const file = zip.file(partName);
  if (!file) return null;
  const xml = await file.async('string');

  const extent = /<wp:extent\b[^>]*\/>/.exec(xml);
  const blip = /<a:blip[^>]*r:embed="([^"]+)"/.exec(xml);
  if (!extent || !blip) return null;

  const cx = Number(/\bcx="(\d+)"/.exec(extent[0])?.[1] ?? '0');
  const cy = Number(/\bcy="(\d+)"/.exec(extent[0])?.[1] ?? '0');
  if (!cx || !cy) return null;

  const dir = path.posix.dirname(partName);
  const base = path.posix.basename(partName);
  const relsPart = `${dir}/_rels/${base}.rels`;
  const relsFile = zip.file(relsPart);
  if (!relsFile) return null;
  const target = resolveRelationship(await relsFile.async('string'), blip[1] as string);
  if (!target) return null;

  const imagePart = path.posix.normalize(path.posix.join(dir, target));
  const imageFile = zip.file(imagePart);
  if (!imageFile) return null;
  const image = await imageFile.async('uint8array');

  const extension = path.posix.extname(imagePart).toLowerCase();
  const contentType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';

  // Recuo esquerdo do paragrafo que contem a imagem (define o X do banner).
  const indentMatch = /<w:ind\b[^>]*\/>/.exec(xml);
  const indentLeftTwips = indentMatch ? Number(/\bw:left="(-?\d+)"/.exec(indentMatch[0])?.[1] ?? '0') : 0;

  return {
    image,
    imagePart,
    contentType,
    widthPt: cx / EMU_PER_POINT,
    heightPt: cy / EMU_PER_POINT,
    indentLeftTwips: Number.isFinite(indentLeftTwips) ? indentLeftTwips : 0,
  };
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

async function parseTemplate(sourcePath: string): Promise<LetterheadTemplate> {
  let raw: Buffer;
  try {
    raw = await readFile(sourcePath);
  } catch {
    throw new TemplateError(
      `Template do papel timbrado não encontrado em "${sourcePath}". ` +
        'Verifique a variável de ambiente OS_DOCX_TEMPLATE.',
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(raw);
  } catch {
    throw new TemplateError('O template do papel timbrado não é um arquivo .docx válido.');
  }

  const documentFile = zip.file('word/document.xml');
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (!documentFile || !relsFile) {
    throw new TemplateError('Estrutura do .docx inválida: word/document.xml ausente.');
  }

  const documentXml = await documentFile.async('string');
  const relsXml = await relsFile.async('string');

  const sectPrMatch = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(documentXml);
  if (!sectPrMatch) {
    throw new TemplateError('Estrutura do .docx inválida: <w:sectPr> não encontrado.');
  }
  const sectPrXml = sectPrMatch[0];

  const pageWidthTw = numberAttr(sectPrXml, 'w:pgSz', 'w:w', 11906);
  const pageHeightTw = numberAttr(sectPrXml, 'w:pgSz', 'w:h', 16838);

  const headerId = referenceId(sectPrXml, 'headerReference', 'default');
  const footerId = referenceId(sectPrXml, 'footerReference', 'default');
  const headerTarget = headerId ? resolveRelationship(relsXml, headerId) : null;
  const footerTarget = footerId ? resolveRelationship(relsXml, footerId) : null;

  const header = headerTarget ? await readBanner(zip, `word/${headerTarget}`) : null;
  const footer = footerTarget ? await readBanner(zip, `word/${footerTarget}`) : null;

  return {
    sourcePath,
    raw,
    pageWidthPt: pageWidthTw / TWIPS_PER_POINT,
    pageHeightPt: pageHeightTw / TWIPS_PER_POINT,
    marginTopPt: numberAttr(sectPrXml, 'w:pgMar', 'w:top', 1440) / TWIPS_PER_POINT,
    marginRightPt: numberAttr(sectPrXml, 'w:pgMar', 'w:right', 1440) / TWIPS_PER_POINT,
    marginBottomPt: numberAttr(sectPrXml, 'w:pgMar', 'w:bottom', 1440) / TWIPS_PER_POINT,
    marginLeftPt: numberAttr(sectPrXml, 'w:pgMar', 'w:left', 1440) / TWIPS_PER_POINT,
    headerOffsetPt: numberAttr(sectPrXml, 'w:pgMar', 'w:header', 0) / TWIPS_PER_POINT,
    footerOffsetPt: numberAttr(sectPrXml, 'w:pgMar', 'w:footer', 0) / TWIPS_PER_POINT,
    sectPrXml,
    header,
    footer,
  };
}

type CacheEntry = { key: string; template: LetterheadTemplate };
let cache: CacheEntry | null = null;

/**
 * Carrega o template com cache invalidado por mtime/tamanho do arquivo, para
 * evitar reler e reprocessar o .docx a cada documento gerado.
 */
export async function loadLetterheadTemplate(
  sourcePath: string = env.docxTemplatePath,
): Promise<LetterheadTemplate> {
  let key = sourcePath;
  try {
    const info = await stat(sourcePath);
    key = `${sourcePath}:${info.size}:${info.mtimeMs}`;
  } catch {
    // stat falhou; parseTemplate produz o erro descritivo.
  }
  if (cache && cache.key === key) return cache.template;
  const template = await parseTemplate(sourcePath);
  cache = { key, template };
  return template;
}

export function clearTemplateCache(): void {
  cache = null;
}

/** Largura util do corpo, em pontos. */
export function contentWidthPt(template: LetterheadTemplate): number {
  return template.pageWidthPt - template.marginLeftPt - template.marginRightPt;
}

/**
 * Posicao X do banner na pagina, replicando o calculo do Word:
 * margem esquerda + recuo do paragrafo (que pode ser negativo).
 */
export function bannerXPt(template: LetterheadTemplate, banner: BannerInfo): number {
  return template.marginLeftPt + banner.indentLeftTwips / TWIPS_PER_POINT;
}
