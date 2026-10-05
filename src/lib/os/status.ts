export const OS_STATUSES = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDA', 'CANCELADA'] as const;
export type OsStatus = (typeof OS_STATUSES)[number];

export function isOsStatus(value: unknown): value is OsStatus {
  return typeof value === 'string' && (OS_STATUSES as readonly string[]).includes(value);
}

/** Rotulos amigaveis exibidos na interface e no documento. */
export const STATUS_LABEL: Record<OsStatus, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO: 'Aguardando',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Classes de cor por status, alinhadas a identidade visual do O&M OS. */
export const STATUS_TONE: Record<OsStatus, string> = {
  ABERTA: 'status-aberta',
  EM_ANDAMENTO: 'status-andamento',
  AGUARDANDO: 'status-aguardando',
  CONCLUIDA: 'status-concluida',
  CANCELADA: 'status-cancelada',
};

/** Status finais: OS encerrada, sem destaque de atraso e sem edicao livre. */
export const TERMINAL_STATUSES: readonly OsStatus[] = ['CONCLUIDA', 'CANCELADA'];

export function isTerminal(status: OsStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Fluxo permitido. Uma OS encerrada so pode ser reaberta por administrador
 * (validado em requireStatusTransition).
 */
const ALLOWED_TRANSITIONS: Record<OsStatus, readonly OsStatus[]> = {
  ABERTA: ['EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDA', 'CANCELADA'],
  EM_ANDAMENTO: ['ABERTA', 'AGUARDANDO', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO: ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: ['EM_ANDAMENTO', 'ABERTA'],
  CANCELADA: ['ABERTA'],
};

export function canTransition(from: OsStatus, to: OsStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Reabrir uma OS encerrada e uma acao administrativa. */
export function requiresAdminToTransition(from: OsStatus): boolean {
  return isTerminal(from);
}

/**
 * Cancelar exige sempre um motivo (escolhido entre os cadastrados).
 * Vale para OS e para chamados da concessionaria.
 */
export function requiresCancellationReason(to: OsStatus): boolean {
  return to === 'CANCELADA';
}

/**
 * Retroceder um registro encerrado (Concluida/Cancelada) exige justificativa
 * escrita, alem do perfil de administrador exigido por
 * requiresAdminToTransition. A justificativa vai para o historico.
 */
export function requiresReopenReason(from: OsStatus): boolean {
  return isTerminal(from);
}

/**
 * Concluir exige a observacao de finalizacao: o relato do que foi feito no
 * atendimento. Vale para todos os perfis e para os dois caminhos de conclusao
 * (quadro Kanban ou tela de detalhes) - nenhum registro e encerrado sem ela.
 */
export function requiresCompletionNote(to: OsStatus): boolean {
  return to === 'CONCLUIDA';
}

/** Tamanho minimo da justificativa de reabertura. */
export const MIN_REOPEN_REASON_LENGTH = 5;

/** Tamanho minimo e maximo da observacao de finalizacao. */
export const MIN_COMPLETION_NOTE_LENGTH = 5;
export const MAX_COMPLETION_NOTE_LENGTH = 1000;
