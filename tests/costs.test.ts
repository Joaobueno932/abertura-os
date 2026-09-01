import { describe, expect, it } from 'vitest';
import { calculateCosts, CostValidationError } from '@/lib/os/costs';
import { formatBRL, formatCenti, parseToCenti } from '@/lib/money';

const RATES = { technicalHourlyRateCents: 15_000, kmRateCents: 150 };

function calc(overrides: Partial<Parameters<typeof calculateCosts>[0]> = {}) {
  return calculateCosts({
    technicianCount: 2,
    hoursPerTechnicianCenti: 300,
    outboundKmCenti: 20_000,
    returnKmCenti: 20_000,
    ...RATES,
    ...overrides,
  });
}

describe('cenario obrigatorio de validacao', () => {
  const result = calc();

  it('2 tecnicos x R$ 150,00 x 3 horas = R$ 900,00', () => {
    expect(result.technicalSubtotalCents).toBe(90_000);
    expect(formatBRL(result.technicalSubtotalCents)).toBe('R$ 900,00');
  });

  it('(200 + 200) km x R$ 1,50 = R$ 600,00', () => {
    expect(result.totalKmCenti).toBe(40_000);
    expect(result.travelSubtotalCents).toBe(60_000);
    expect(formatBRL(result.travelSubtotalCents)).toBe('R$ 600,00');
  });

  it('total do atendimento = R$ 1.500,00', () => {
    expect(result.totalCents).toBe(150_000);
    expect(formatBRL(result.totalCents)).toBe('R$ 1.500,00');
  });
});

describe('valores decimais', () => {
  it('3,5 horas por tecnico', () => {
    const result = calc({ technicianCount: 1, hoursPerTechnicianCenti: 350 });
    expect(result.technicalSubtotalCents).toBe(52_500);
    expect(formatBRL(result.technicalSubtotalCents)).toBe('R$ 525,00');
  });

  it('quilometragem com casas decimais', () => {
    const result = calc({ outboundKmCenti: 12_050, returnKmCenti: 12_050 });
    // 120,50 km de ida + 120,50 km de volta = 241 km; 241 x R$ 1,50 = R$ 361,50
    expect(result.totalKmCenti).toBe(24_100);
    expect(result.travelSubtotalCents).toBe(36_150);
    expect(formatBRL(result.travelSubtotalCents)).toBe('R$ 361,50');
  });

  it('arredonda meio-para-cima ao reduzir para centavos', () => {
    // 1 tecnico x R$ 0,01 x 0,05 h = 0,0005 -> 0,01 centavo -> arredonda para 1
    const result = calc({
      technicianCount: 1,
      hoursPerTechnicianCenti: 50,
      technicalHourlyRateCents: 1,
      outboundKmCenti: 0,
      returnKmCenti: 0,
    });
    expect(result.technicalSubtotalCents).toBe(1);
  });
});

describe('zero e limites', () => {
  it('aceita quilometragem zerada', () => {
    const result = calc({ outboundKmCenti: 0, returnKmCenti: 0 });
    expect(result.travelSubtotalCents).toBe(0);
    expect(result.totalCents).toBe(90_000);
  });

  it('rejeita zero tecnicos', () => {
    expect(() => calc({ technicianCount: 0 })).toThrow(CostValidationError);
  });

  it('rejeita zero horas', () => {
    expect(() => calc({ hoursPerTechnicianCenti: 0 })).toThrow(CostValidationError);
  });
});

describe('valores invalidos', () => {
  it('rejeita quantidade negativa de tecnicos', () => {
    expect(() => calc({ technicianCount: -2 })).toThrow(/maior que zero/);
  });

  it('rejeita quilometragem negativa de ida', () => {
    expect(() => calc({ outboundKmCenti: -100 })).toThrow(/não pode ser negativa/);
  });

  it('rejeita quilometragem negativa de volta', () => {
    expect(() => calc({ returnKmCenti: -1 })).toThrow(/não pode ser negativa/);
  });

  it('rejeita valores nao inteiros (evita ponto flutuante)', () => {
    expect(() => calc({ hoursPerTechnicianCenti: 3.5 })).toThrow(CostValidationError);
    expect(() => calc({ technicianCount: Number.NaN })).toThrow(CostValidationError);
  });

  it('identifica o campo com problema', () => {
    try {
      calc({ returnKmCenti: -5 });
      expect.unreachable('deveria ter lancado');
    } catch (error) {
      expect(error).toBeInstanceOf(CostValidationError);
      expect((error as CostValidationError).field).toBe('returnKmCenti');
    }
  });
});

describe('formatacao monetaria brasileira', () => {
  it.each([
    [0, 'R$ 0,00'],
    [150, 'R$ 1,50'],
    [15_000, 'R$ 150,00'],
    [90_000, 'R$ 900,00'],
    [150_000, 'R$ 1.500,00'],
    [123_456_789, 'R$ 1.234.567,89'],
  ])('%i centavos => %s', (cents, expected) => {
    expect(formatBRL(cents)).toBe(expected);
  });
});

describe('conversao de decimais para centesimos', () => {
  it.each([
    ['3', 300],
    ['3,5', 350],
    ['3.5', 350],
    ['200', 20_000],
    ['0', 0],
    ['0,05', 5],
    ['-2,5', -250],
  ])('%s => %i', (input, expected) => {
    expect(parseToCenti(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,234', '1.2.3', '1e5', ' '])('rejeita %j', (input) => {
    expect(parseToCenti(input)).toBeNull();
  });

  it('formata centesimos de volta para texto', () => {
    expect(formatCenti(300)).toBe('3');
    expect(formatCenti(350)).toBe('3,5');
    expect(formatCenti(305)).toBe('3,05');
    expect(formatCenti(20_000)).toBe('200');
  });
});
