/**
 * Valores unitarios do atendimento. Constantes puras, sem acesso a banco, para
 * poderem ser reutilizadas pelo seed, pelos testes e pela camada de dados.
 *
 * Os valores vigentes ficam no banco (tabela Setting) e sao editaveis por um
 * administrador em /admin/configuracoes - estes sao apenas os padroes de
 * fabrica usados quando ainda nao ha configuracao gravada.
 */

export const SETTING_KEYS = {
  technicalHourlyRateCents: 'costs.technicalHourlyRateCents',
  kmRateCents: 'costs.kmRateCents',
} as const;

/** R$ 150,00 por hora tecnica por tecnico e R$ 1,50 por quilometro rodado. */
export const DEFAULT_RATES = {
  technicalHourlyRateCents: 15_000,
  kmRateCents: 150,
} as const;

export type Rates = { technicalHourlyRateCents: number; kmRateCents: number };

export function parseCents(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
