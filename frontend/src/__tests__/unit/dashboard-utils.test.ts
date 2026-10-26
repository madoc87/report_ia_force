import { describe, it, expect } from 'vitest';
import {
  buildShotDayOptions, computeConversions, formatMonthKey, getCommercialMonthKey, getFiscalMonthKey,
  getPreviousMonthKey, normalizeShotDate, parseCurrency, parseShotDate
} from '@/lib/dashboard-utils';

describe('datas de disparo', () => {
  it('interpreta datas dd/MM/yyyy e rejeita formatos inválidos', () => {
    expect(parseShotDate('22/10/2026')).toEqual({ day: 22, month: 10, year: 2026 });
    expect(parseShotDate('2026-10-22')).toBeNull();
    expect(parseShotDate('')).toBeNull();
    expect(parseShotDate(undefined)).toBeNull();
    expect(parseShotDate('10/13/2026')).toBeNull();
  });

  it('normaliza dia e mês com zero à esquerda', () => {
    expect(normalizeShotDate('5/3/2026')).toBe('05/03/2026');
  });

  it('mês fiscal considera o ano', () => {
    expect(getFiscalMonthKey('15/10/2025')).toBe('2025-10');
    expect(getFiscalMonthKey('15/10/2026')).toBe('2026-10');
  });

  it('mês comercial avança a partir do dia 21, inclusive na virada do ano', () => {
    expect(getCommercialMonthKey('20/10/2026')).toBe('2026-10');
    expect(getCommercialMonthKey('21/10/2026')).toBe('2026-11');
    expect(getCommercialMonthKey('22/12/2025')).toBe('2026-01');
  });

  it('formata a chave do mês e calcula o mês de calendário anterior', () => {
    expect(formatMonthKey('2026-10')).toBe('Out/2026');
    expect(getPreviousMonthKey('2026-03')).toBe('2026-02');
    expect(getPreviousMonthKey('2026-01')).toBe('2025-12');
  });
});

describe('buildShotDayOptions', () => {
  it('lista os dias de disparo únicos, mais recentes primeiro, com a quantidade de campanhas', () => {
    const options = buildShotDayOptions([
      { date_only: '21/10/2026' },
      { date_only: '22/10/2026' },
      { date_only: '22/10/2026' },
      { date_only: '' },
      { date_only: null },
    ]);

    expect(options.map(o => o.name)).toEqual(['22/10/2026', '21/10/2026']);
    expect(options[0].month).toBe('2 campanhas');
    expect(options[1].month).toBe('1 campanha');
    expect(options[0].date).toBe('quinta-feira');
  });
});

describe('métricas', () => {
  it('conversões usam (Vendas IA + Vendas Manual) sobre clientes e respostas', () => {
    expect(computeConversions(10, 200, 50)).toEqual({ conversionSalesClients: 5, conversionSalesResponses: 20 });
    expect(computeConversions(5, 0, 0)).toEqual({ conversionSalesClients: 0, conversionSalesResponses: 0 });
  });

  it('converte valores monetários em texto pt-BR', () => {
    expect(parseCurrency('R$ 1.234,50')).toBe(1234.5);
    expect(parseCurrency('R$ 18,00')).toBe(18);
    expect(parseCurrency(12.5)).toBe(12.5);
    expect(parseCurrency(undefined)).toBe(0);
  });
});
