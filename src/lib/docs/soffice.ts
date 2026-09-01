import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '@/lib/env';

const run = promisify(execFile);

/**
 * Conversao opcional DOCX -> PDF via LibreOffice.
 *
 * NAO e o caminho padrao. O PDF entregue ao cliente e renderizado nativamente
 * (src/lib/docs/pdf.ts), sem qualquer dependencia de sistema operacional, para
 * funcionar igual em desenvolvimento e em producao/container.
 *
 * Quando SOFFICE_PATH aponta para um LibreOffice instalado, esta rota e usada
 * no lugar da nativa e o PDF passa a ser a conversao literal do DOCX. Se a
 * conversao falhar por qualquer motivo, o chamador volta para o renderizador
 * nativo - a geracao do documento nunca fica indisponivel por causa disso.
 */

export const isSofficeConfigured = (): boolean => env.sofficePath.length > 0;

const CONVERT_TIMEOUT_MS = 60_000;

export async function convertDocxToPdfWithSoffice(docx: Uint8Array): Promise<Uint8Array> {
  if (!isSofficeConfigured()) {
    throw new Error('SOFFICE_PATH nao configurado.');
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'emconta-os-'));
  const input = path.join(workDir, 'documento.docx');
  const output = path.join(workDir, 'documento.pdf');

  try {
    await writeFile(input, docx);
    await run(
      env.sofficePath,
      [
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        workDir,
        input,
      ],
      { timeout: CONVERT_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    return await readFile(output);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
