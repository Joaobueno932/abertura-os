import { divideRound } from '@/lib/money';

/** Entradas brutas do calculo, todas em inteiros. */
export type CostInput = {
  /** Quantidade de tecnicos (inteiro > 0). */
  technicianCount: number;
  /** Horas por tecnico em centesimos (3,5 h => 350). Deve ser > 0. */
  hoursPerTechnicianCenti: number;
  /** Quilometragem de ida em centesimos de km (200 km => 20000). >= 0. */
  outboundKmCenti: number;
  /** Quilometragem de volta em centesimos de km. >= 0. */
  returnKmCenti: number;
  /** Valor da hora tecnica em centavos (R$ 150,00 => 15000). >= 0. */
  technicalHourlyRateCents: number;
  /** Valor do km em centavos (R$ 1,50 => 150). >= 0. */
  kmRateCents: number;
};

export type CostBreakdown = CostInput & {
  totalKmCenti: number;
  technicalSubtotalCents: number;
  travelSubtotalCents: number;
  totalCents: number;
};

export class CostValidationError extends Error {
  constructor(
    message: string,
    readonly field: keyof CostInput,
  ) {
    super(message);
    this.name = 'CostValidationError';
  }
}

function assertInteger(value: number, field: keyof CostInput, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new CostValidationError(`${label} deve ser um número válido.`, field);
  }
}

/**
 * Recalcula integralmente os custos do atendimento a partir dos dados basicos.
 * O backend NUNCA confia em subtotais ou total enviados pelo cliente.
 *
 *   horas tecnicas  = qtdTecnicos x valorHora x horasPorTecnico
 *   deslocamento    = (kmIda + kmVolta) x valorKm
 *   total           = horas tecnicas + deslocamento
 *
 * Toda a aritmetica e inteira: os produtos ficam em "centavos x centesimos" e
 * sao reduzidos a centavos com arredondamento meio-para-cima.
 */
export function calculateCosts(input: CostInput): CostBreakdown {
  const {
    technicianCount,
    hoursPerTechnicianCenti,
    outboundKmCenti,
    returnKmCenti,
    technicalHourlyRateCents,
    kmRateCents,
  } = input;

  assertInteger(technicianCount, 'technicianCount', 'Quantidade de técnicos');
  assertInteger(hoursPerTechnicianCenti, 'hoursPerTechnicianCenti', 'Horas por técnico');
  assertInteger(outboundKmCenti, 'outboundKmCenti', 'Quilometragem de ida');
  assertInteger(returnKmCenti, 'returnKmCenti', 'Quilometragem de volta');
  assertInteger(technicalHourlyRateCents, 'technicalHourlyRateCents', 'Valor da hora técnica');
  assertInteger(kmRateCents, 'kmRateCents', 'Valor do quilômetro');

  if (technicianCount <= 0) {
    throw new CostValidationError('Quantidade de técnicos deve ser um inteiro maior que zero.', 'technicianCount');
  }
  if (hoursPerTechnicianCenti <= 0) {
    throw new CostValidationError('Horas por técnico deve ser maior que zero.', 'hoursPerTechnicianCenti');
  }
  if (outboundKmCenti < 0) {
    throw new CostValidationError('Quilometragem de ida não pode ser negativa.', 'outboundKmCenti');
  }
  if (returnKmCenti < 0) {
    throw new CostValidationError('Quilometragem de volta não pode ser negativa.', 'returnKmCenti');
  }
  if (technicalHourlyRateCents < 0) {
    throw new CostValidationError('Valor da hora técnica não pode ser negativo.', 'technicalHourlyRateCents');
  }
  if (kmRateCents < 0) {
    throw new CostValidationError('Valor do quilômetro não pode ser negativo.', 'kmRateCents');
  }

  const technicalSubtotalCents = divideRound(
    technicianCount * technicalHourlyRateCents * hoursPerTechnicianCenti,
    100,
  );
  const totalKmCenti = outboundKmCenti + returnKmCenti;
  const travelSubtotalCents = divideRound(totalKmCenti * kmRateCents, 100);

  return {
    ...input,
    totalKmCenti,
    technicalSubtotalCents,
    travelSubtotalCents,
    totalCents: technicalSubtotalCents + travelSubtotalCents,
  };
}
