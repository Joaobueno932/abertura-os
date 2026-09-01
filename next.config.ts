import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O template .docx e as imagens do timbrado sao lidos do disco em runtime.
  serverExternalPackages: ['@prisma/client', 'jszip', 'pdf-lib'],
  // O caminho do template so existe em runtime (env OS_DOCX_TEMPLATE), entao o
  // rastreador do Next nao tem como descobri-lo sozinho e o arquivo ficaria de
  // fora do bundle da funcao serverless - a geracao falharia em producao com
  // "Template do papel timbrado nao encontrado", mesmo funcionando local.
  // Declarar aqui obriga o .docx da raiz a ser empacotado com a rota.
  outputFileTracingIncludes: {
    '/api/os/[id]/documento': ['./*.docx'],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
