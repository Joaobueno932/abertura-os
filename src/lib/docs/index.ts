import type { ServiceOrderDetail } from '@/lib/os/service';
import { buildOsDocumentModel, documentFileName } from './model';
import { generateOsDocx } from './docx';
import { generateOsPdf } from './pdf';
import { convertDocxToPdfWithSoffice, isSofficeConfigured } from './soffice';
import { TemplateError } from './template';

export type DocumentFormat = 'pdf' | 'docx';

export const DOCUMENT_MIME: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export type GeneratedDocument = {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
};

export class DocumentGenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DocumentGenerationError';
  }
}

/**
 * Fluxo do documento:
 *
 *   template .docx (papel timbrado)
 *        -> preenchimento com os dados da OS
 *        -> DOCX da OS
 *        -> PDF
 *
 * O DOCX e sempre o timbrado oficial com o corpo preenchido. O PDF, por padrao,
 * e renderizado nativamente reaproveitando as mesmas imagens e a mesma
 * geometria do template (sem dependencia de SO). Se LibreOffice estiver
 * configurado via SOFFICE_PATH, o PDF passa a ser a conversao do proprio DOCX.
 */
export async function renderOsDocument(
  order: ServiceOrderDetail,
  format: DocumentFormat,
): Promise<GeneratedDocument> {
  const model = buildOsDocumentModel(order);

  try {
    if (format === 'docx') {
      return {
        bytes: await generateOsDocx(model),
        fileName: documentFileName(model, 'docx'),
        contentType: DOCUMENT_MIME.docx,
      };
    }

    let bytes: Uint8Array | null = null;
    if (isSofficeConfigured()) {
      try {
        bytes = await convertDocxToPdfWithSoffice(await generateOsDocx(model));
      } catch (error) {
        console.warn(
          '[docs] conversao via LibreOffice falhou; usando o renderizador nativo.',
          error,
        );
      }
    }
    if (!bytes) bytes = await generateOsPdf(model);

    return {
      bytes,
      fileName: documentFileName(model, 'pdf'),
      contentType: DOCUMENT_MIME.pdf,
    };
  } catch (error) {
    if (error instanceof TemplateError) {
      throw new DocumentGenerationError(error.message, error);
    }
    throw new DocumentGenerationError(
      'Não foi possível gerar o documento da Ordem de Serviço.',
      error,
    );
  }
}

export { buildOsDocumentModel, documentFileName };
