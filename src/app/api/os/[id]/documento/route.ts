import { requireUser } from '@/lib/auth/guard';
import { clientKey, rateLimit } from '@/lib/auth/rate-limit';
import { AppError, badRequest, notFound, toErrorResponse, tooManyRequests } from '@/lib/http';
import { getServiceOrderDetail, recordDocumentGenerated } from '@/lib/os/service';
import { DocumentGenerationError, renderOsDocument, type DocumentFormat } from '@/lib/docs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const FORMATS: readonly DocumentFormat[] = ['pdf', 'docx'];

/**
 * Geracao e download do documento oficial da OS.
 *
 * Exige sessao valida (o documento nunca fica acessivel por URL publica), aplica
 * rate limit por usuario e monta o nome do arquivo a partir do numero da OS ja
 * sanitizado (OS-20260831001.pdf).
 */
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireUser();

    const limit = rateLimit(`doc:${actor.id}:${clientKey(request)}`, 30, 60_000);
    if (!limit.allowed) {
      throw tooManyRequests('Muitas gerações de documento seguidas. Aguarde um instante.');
    }

    const url = new URL(request.url);
    const requested = (url.searchParams.get('formato') ?? 'pdf').toLowerCase();
    if (!FORMATS.includes(requested as DocumentFormat)) {
      throw badRequest('Formato inválido. Use "pdf" ou "docx".');
    }
    const format = requested as DocumentFormat;
    const inline = url.searchParams.get('inline') === '1' && format === 'pdf';

    const { id } = await context.params;
    const order = await getServiceOrderDetail(id);
    if (!order) throw notFound('Ordem de Serviço não encontrada.');

    const document = await renderOsDocument(order, format);
    await recordDocumentGenerated(order.id, document.fileName, actor);

    // Nome do arquivo ja sanitizado; o encodeURIComponent protege o header.
    const disposition =
      `${inline ? 'inline' : 'attachment'}; filename="${document.fileName}"; ` +
      `filename*=UTF-8''${encodeURIComponent(document.fileName)}`;

    const body = new Uint8Array(document.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': document.contentType,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': disposition,
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof DocumentGenerationError) {
      console.error('[documento] falha na geracao:', error.cause ?? error);
      return toErrorResponse(new AppError(error.message, 500, 'DOCUMENT_ERROR'));
    }
    return toErrorResponse(error);
  }
}
