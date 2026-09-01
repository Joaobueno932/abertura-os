export const EVENT_TYPES = [
  'CRIADA',
  'STATUS_ALTERADO',
  'RESPONSAVEL_ALTERADO',
  'PREVISAO_ALTERADA',
  'INFORMACOES_EDITADAS',
  'CUSTOS_ALTERADOS',
  'DOCUMENTO_GERADO',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABEL: Record<EventType, string> = {
  CRIADA: 'OS criada',
  STATUS_ALTERADO: 'Status alterado',
  RESPONSAVEL_ALTERADO: 'Responsável alterado',
  PREVISAO_ALTERADA: 'Previsão alterada',
  INFORMACOES_EDITADAS: 'Informações editadas',
  CUSTOS_ALTERADOS: 'Custos alterados',
  DOCUMENTO_GERADO: 'Documento gerado',
};

export type FieldChange = { field: string; label: string; from: string; to: string };

/**
 * Serializa as alteracoes do evento. Somente dados de negocio ja exibidos na
 * propria OS - nunca credenciais, tokens ou dados sensiveis.
 */
export function serializeChanges(changes: FieldChange[]): string | null {
  if (changes.length === 0) return null;
  return JSON.stringify(changes);
}

export function parseChanges(details: string | null): FieldChange[] {
  if (!details) return [];
  try {
    const parsed: unknown = JSON.parse(details);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FieldChange =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as FieldChange).label === 'string' &&
        typeof (item as FieldChange).from === 'string' &&
        typeof (item as FieldChange).to === 'string',
    );
  } catch {
    return [];
  }
}
