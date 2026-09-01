import { describe, expect, it } from 'vitest';
import { normalizeDescription, normalizeText, sanitizeFileNamePart } from '@/lib/text';
import { businessDayKey, formatDateBR, formatDateOnlyBR, formatDateTimeBR, isOverdue, parseDateOnly, toDateInputValue } from '@/lib/datetime';

describe('normalizacao de campos textuais', () => {
  it('preserva a capitalizacao escolhida pelo usuario', () => {
    expect(normalizeText('manutenção preventiva')).toBe('manutenção preventiva');
    expect(normalizeText('Usina Solar Campo Grande I')).toBe('Usina Solar Campo Grande I');
  });

  it('nao capitaliza automaticamente a primeira letra', () => {
    expect(normalizeText('manutenção preventiva')).not.toBe('Manutenção preventiva');
  });

  it('desfaz texto digitado inteiramente em caixa alta', () => {
    expect(normalizeText('MANUTENÇÃO PREVENTIVA')).toBe('manutenção preventiva');
  });

  it('preserva siglas conhecidas mesmo em texto todo maiusculo', () => {
    expect(normalizeText('ATENDIMENTO FIEMS')).toBe('atendimento FIEMS');
    expect(normalizeText('VISITA SESI E SENAI')).toBe('visita SESI e SENAI');
  });

  it('preserva tokens com numeros', () => {
    expect(normalizeText('USINA 2 SETOR A1')).toBe('usina 2 setor A1');
  });

  it('preserva siglas quando o texto nao esta todo em maiusculas', () => {
    expect(normalizeText('Atendimento na FIEMS')).toBe('Atendimento na FIEMS');
  });

  it('normaliza espacos em excesso', () => {
    expect(normalizeText('  manutenção   preventiva  ')).toBe('manutenção preventiva');
  });
});

describe('normalizacao da descricao', () => {
  it('grava sempre em caixa alta', () => {
    expect(normalizeDescription('Realizar manutenção preventiva no inversor da usina.')).toBe(
      'REALIZAR MANUTENÇÃO PREVENTIVA NO INVERSOR DA USINA.',
    );
  });

  it('mantem em caixa alta o texto ja maiusculo', () => {
    expect(normalizeDescription('JÁ ESTÁ EM CAIXA ALTA')).toBe('JÁ ESTÁ EM CAIXA ALTA');
  });

  it('preserva acentos ao converter', () => {
    expect(normalizeDescription('inspeção e manutenção')).toBe('INSPEÇÃO E MANUTENÇÃO');
  });
});

describe('sanitizacao de nome de arquivo', () => {
  it('mantem o padrao esperado', () => {
    expect(sanitizeFileNamePart('OS-20260831001')).toBe('OS-20260831001');
  });

  it('neutraliza tentativas de path traversal', () => {
    expect(sanitizeFileNamePart('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeFileNamePart('..\\..\\windows\\system32')).toBe('windows-system32');
  });

  it('remove acentos e caracteres invalidos', () => {
    expect(sanitizeFileNamePart('Ordem de Serviço "2026"')).toBe('Ordem-de-Servico-2026');
  });

  it('nunca devolve string vazia', () => {
    expect(sanitizeFileNamePart('///')).toBe('documento');
  });
});

describe('datas no padrao brasileiro', () => {
  it('formata data e data com hora', () => {
    const instant = new Date('2026-08-31T17:30:00.000Z'); // 13:30 em Campo Grande (UTC-4)
    expect(formatDateBR(instant)).toBe('31/08/2026');
    expect(formatDateTimeBR(instant)).toBe('31/08/2026 13:30');
  });

  it('converte AAAA-MM-DD para data ancorada ao meio-dia UTC', () => {
    const parsed = parseDateOnly('2026-09-15');
    expect(parsed).not.toBeNull();
    expect(parsed!.toISOString()).toBe('2026-09-15T12:00:00.000Z');
    expect(formatDateOnlyBR(parsed!)).toBe('15/09/2026');
    expect(toDateInputValue(parsed!)).toBe('2026-09-15');
  });

  it('rejeita datas invalidas', () => {
    expect(parseDateOnly('2026-02-31')).toBeNull();
    expect(parseDateOnly('31/08/2026')).toBeNull();
    expect(parseDateOnly('2026-13-01')).toBeNull();
  });

  it('usa o dia do fuso de negocio', () => {
    // 01/09/2026 02:00 UTC ainda e 31/08 em America/Campo_Grande.
    expect(businessDayKey(new Date('2026-09-01T02:00:00.000Z'))).toBe('20260831');
    expect(businessDayKey(new Date('2026-09-01T05:00:00.000Z'))).toBe('20260901');
  });

  it('identifica previsao atrasada', () => {
    const now = new Date('2026-09-10T15:00:00.000Z');
    expect(isOverdue(parseDateOnly('2026-09-09')!, now)).toBe(true);
    expect(isOverdue(parseDateOnly('2026-09-10')!, now)).toBe(false);
    expect(isOverdue(parseDateOnly('2026-09-11')!, now)).toBe(false);
  });
});
