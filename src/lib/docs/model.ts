import { formatBRL, formatCenti } from '@/lib/money';
import { formatDateOnlyBR, formatDateTimeBR } from '@/lib/datetime';
import { STATUS_LABEL, type OsStatus } from '@/lib/os/status';
import { sanitizeFileNamePart } from '@/lib/text';
import type { ServiceOrderDetail } from '@/lib/os/service';

/** Sinal de multiplicacao usado na memoria de calculo (presente no WinAnsi). */
const TIMES = '×';

function plural(value: number, singular: string, pluralForm: string): string {
  return value === 1 ? singular : pluralForm;
}

export type OsDocumentCosts = {
  technicianCount: string;
  hoursPerTechnician: string;
  hourlyRate: string;
  technicalMemo: string;
  technicalSubtotal: string;
  outboundKm: string;
  returnKm: string;
  totalKm: string;
  kmRate: string;
  travelMemo: string;
  travelSubtotal: string;
  total: string;
};

export type OsDocumentModel = {
  number: string;
  numberLabel: string;
  openedAt: string;
  openedDate: string;
  statusLabel: string;
  title: string;
  plant: string;
  institution: string;
  responsible: string;
  /** Tecnicos que executam o atendimento, ja formatados em uma linha. */
  technicians: string;
  expectedDate: string;
  location: string;
  description: string;
  /** Observacao de finalizacao. Vazia enquanto a OS nao foi concluida. */
  completionNote: string;
  costs: OsDocumentCosts;
  /** Base do nome de arquivo, ja sanitizada: OS-20260831001 */
  fileBaseName: string;
};

/**
 * Converte a OS persistida no modelo apresentado no documento. Usa
 * exclusivamente os valores gravados na propria OS (incluindo os valores
 * unitarios do momento do calculo), garantindo integridade historica: alterar
 * as configuracoes hoje nao muda o documento de uma OS antiga.
 */
export function buildOsDocumentModel(order: ServiceOrderDetail): OsDocumentModel {
  const technicianCount = order.technicianCount;
  const hoursText = formatCenti(order.hoursPerTechnicianCenti);
  const hoursValue = order.hoursPerTechnicianCenti / 100;
  const hourlyRate = formatBRL(order.technicalHourlyRateCents);
  const kmRate = formatBRL(order.kmRateCents);
  const outboundKm = formatCenti(order.outboundKmCenti);
  const returnKm = formatCenti(order.returnKmCenti);
  const totalKm = formatCenti(order.outboundKmCenti + order.returnKmCenti);

  return {
    number: order.number,
    numberLabel: `N${'º'} ${order.number}`,
    openedAt: formatDateTimeBR(order.openedAt),
    openedDate: formatDateOnlyBR(
      new Date(
        Date.UTC(
          order.openedAt.getUTCFullYear(),
          order.openedAt.getUTCMonth(),
          order.openedAt.getUTCDate(),
          12,
        ),
      ),
    ),
    statusLabel: STATUS_LABEL[order.status as OsStatus] ?? order.status,
    title: order.title,
    plant: order.plant.name,
    institution: order.institution.name,
    responsible: order.responsible.name,
    technicians: order.technicians.map((technician) => technician.name).join(' · '),
    expectedDate: formatDateOnlyBR(order.expectedDate),
    location: order.location,
    description: order.description,
    completionNote: order.completionNote ?? '',
    costs: {
      technicianCount: String(technicianCount),
      hoursPerTechnician: hoursText,
      hourlyRate,
      technicalMemo:
        `${technicianCount} ${plural(technicianCount, 'técnico', 'técnicos')} ${TIMES} ${hourlyRate} ` +
        `${TIMES} ${hoursText} ${plural(hoursValue, 'hora', 'horas')}`,
      technicalSubtotal: formatBRL(order.technicalSubtotalCents),
      outboundKm: `${outboundKm} km`,
      returnKm: `${returnKm} km`,
      totalKm: `${totalKm} km`,
      kmRate,
      travelMemo: `${totalKm} km ${TIMES} ${kmRate}`,
      travelSubtotal: formatBRL(order.travelSubtotalCents),
      total: formatBRL(order.totalCents),
    },
    fileBaseName: sanitizeFileNamePart(`OS-${order.number}`),
  };
}

/** Nome final do arquivo entregue ao cliente. */
export function documentFileName(model: OsDocumentModel, extension: 'pdf' | 'docx'): string {
  return `${model.fileBaseName}.${extension}`;
}

/**
 * Estrutura logica do documento, compartilhada por DOCX e PDF para que os dois
 * formatos apresentem exatamente o mesmo conteudo.
 */
export type DocRow = { label: string; value: string };
export type DocSection =
  | { kind: 'fields'; heading: string; columns: 1 | 2; rows: DocRow[] }
  | { kind: 'paragraph'; heading: string; text: string }
  /** Quebra forcada: o valor do atendimento comeca sempre em pagina propria. */
  | { kind: 'pageBreak' }
  | { kind: 'costs' }
  | { kind: 'approval' };

export function documentSections(model: OsDocumentModel): DocSection[] {
  return [
    {
      kind: 'fields',
      heading: 'IDENTIFICAÇÃO',
      columns: 2,
      rows: [
        { label: 'Número da OS', value: model.number },
        { label: 'Status', value: model.statusLabel },
        { label: 'Data de abertura', value: model.openedDate },
        { label: 'Previsão de execução', value: model.expectedDate },
      ],
    },
    {
      kind: 'fields',
      heading: 'ATENDIMENTO',
      columns: 1,
      rows: [
        { label: 'Título', value: model.title },
        { label: 'Usina', value: model.plant },
        { label: 'Cliente/Instituição', value: model.institution },
        { label: 'Responsável pela OS', value: model.responsible },
        { label: 'Técnicos do atendimento', value: model.technicians },
        { label: 'Local de atendimento', value: model.location },
      ],
    },
    { kind: 'paragraph', heading: 'DESCRIÇÃO', text: model.description },
    // O que foi pedido e o que foi feito ficam lado a lado. A secao so existe
    // quando a OS foi concluida: antes disso nao ha nada a relatar.
    ...(model.completionNote
      ? [
          {
            kind: 'paragraph' as const,
            heading: 'OBSERVAÇÃO DE FINALIZAÇÃO',
            text: model.completionNote,
          },
        ]
      : []),
    // O valor fica visualmente separado do restante: mesmo que a OS termine no
    // meio da primeira pagina, esta parte comeca na pagina seguinte.
    { kind: 'pageBreak' },
    { kind: 'costs' },
    { kind: 'approval' },
  ];
}

export const APPROVAL_LINES: DocRow[] = [
  { label: 'Nome do responsável', value: '' },
  { label: 'Cargo/Função', value: '' },
  { label: 'Data', value: '____/____/________' },
  { label: 'Assinatura', value: '' },
];
