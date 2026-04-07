/**
 * Testes unitários para as funções calculateSummary e aggregateSummaries.
 * Essas funções contêm a lógica de negócio central de cálculo dos relatórios.
 */
import { calculateSummary, aggregateSummaries } from '../../index.js';

describe('calculateSummary', () => {
  test('retorna zeros quando recebe array vazio', () => {
    const result = calculateSummary([], 'Board Teste');
    
    expect(result.board).toBe('Board Teste');
    expect(result.totalClients).toBe(0);
    expect(result.totalPhones).toBe('0');
    expect(result.totalHabllaResponses).toBe('0');
    expect(result.salesIA).toBe(0);
    expect(result.salesManual).toBe(0);
    expect(result.notReceivedMsg).toBe(0);
    expect(result.dateRange).toBe('N/A');
    expect(result.campaignNames).toBe('N/A');
  });

  test('calcula total de clientes únicos corretamente', () => {
    const cards = [
      { name: 'João', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1', tags: [] },
      { name: 'Maria', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1', tags: [] },
      { name: 'João', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1', tags: [] }, // duplicado
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.totalClients).toBe(2); // João e Maria (nomes únicos)
    expect(result.totalPhones).toBe('3'); // 3 cards no total
  });

  test('conta vendas IA corretamente (Venda IA + Venda Manual tags)', () => {
    const cards = [
      {
        name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1',
        tags: [{ id: 'tag1', name: 'IA - Venda IA' }]
      },
      {
        name: 'Card2', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1',
        tags: [{ id: 'tag2', name: 'IA - Venda Manual' }]
      },
      {
        name: 'Card3', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1',
        tags: [{ id: 'tag3', name: 'Outra Tag' }]
      },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.salesIA).toBe(2); // Tag "Venda IA" + "Venda Manual"
  });

  test('conta vendas manuais (Venda Operador) corretamente', () => {
    const cards = [
      {
        name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1',
        tags: [{ id: 'tag1', name: 'IA - Venda Operador' }]
      },
      {
        name: 'Card2', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'list1',
        tags: [{ id: 'tag2', name: 'Outra Tag' }]
      },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.salesManual).toBe(1);
  });

  test('conta mensagens não recebidas corretamente', () => {
    const cards = [
      {
        name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z',
        list: '6852ca77894e7f357ac3ca09', // Lista "Tentativa de contato [IA]"
        status: 'lost',
        tags: [{ id: '689214de8385d506466c22ff', name: 'IA - Mgs não enviada' }]
      },
      {
        name: 'Card2', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z',
        list: '6852ca77894e7f357ac3ca09',
        status: 'in_attendance', // Status diferente de lost
        tags: [{ id: '689214de8385d506466c22ff', name: 'IA - Mgs não enviada' }]
      },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.notReceivedMsg).toBe(1); // Apenas o primeiro (status lost + lista correta + tag correta)
  });

  test('calcula total de respostas Hablla (excluindo listas específicas)', () => {
    const cards = [
      { name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'outra_lista', tags: [] },
      { name: 'Card2', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: '6852ca77894e7f357ac3ca09', tags: [] }, // excluída
      { name: 'Card3', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: '68641e2511228ce80a6c7729', tags: [] }, // excluída
      { name: 'Card4', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'outra_lista_2', tags: [] },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.totalHabllaResponses).toBe('2'); // Apenas Card1 e Card4
  });

  test('calcula custo total corretamente (phones - notReceived) * 0.1', () => {
    const cards = [
      { name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'outra', tags: [] },
      { name: 'Card2', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'outra', tags: [] },
      { name: 'Card3', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'outra', tags: [] },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    // 3 phones, 0 not received = (3 - 0) * 0.1 = R$ 0,30
    expect(result.totalCost).toContain('0,30');
  });

  test('formata dateRange corretamente com data única', () => {
    const cards = [
      { name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'l1', tags: [] },
      { name: 'Card2', campaign: 'Camp1', created_at: '2026-01-15T23:59:59Z', list: 'l1', tags: [] },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.dateRange).toBe('15/01/2026');
  });

  test('formata dateRange com intervalo de datas', () => {
    const cards = [
      { name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'l1', tags: [] },
      { name: 'Card2', campaign: 'Camp1', created_at: '2026-01-20T10:00:00Z', list: 'l1', tags: [] },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result.dateRange).toContain('15/01/2026');
    expect(result.dateRange).toContain('20/01/2026');
    expect(result.dateRange).toContain(' - ');
  });

  test('inclui campos _raw para agregação', () => {
    const cards = [
      { name: 'Card1', campaign: 'Camp1', created_at: '2026-01-15T10:00:00Z', list: 'l1', tags: [] },
    ];

    const result = calculateSummary(cards, 'Board Teste');
    expect(result._raw).toBeDefined();
    expect(result._raw.totalClients).toBe(1);
    expect(result._raw.totalPhones).toBe(1);
  });
});

describe('aggregateSummaries', () => {
  test('retorna null com array vazio', () => {
    const result = aggregateSummaries([]);
    expect(result).toBeNull();
  });

  test('retorna o próprio item quando array tem apenas 1 elemento', () => {
    const summary = {
      board: 'Board', campaignNames: 'Camp1', dateRange: '15/01/2026',
      totalClients: 10, totalPhones: '20', salesIA: 3, salesManual: 1,
      _raw: { totalClients: 10, totalPhones: 20, totalHabllaResponses: 15, salesIA: 3, salesManual: 1, notReceivedMsg: 2 }
    };

    const result = aggregateSummaries([summary]);
    expect(result).toBe(summary); // Retorna referência do mesmo objeto
  });

  test('soma valores absolutos corretamente com múltiplas campanhas', () => {
    const summaries = [
      {
        board: 'Board', campaignNames: 'Camp1', dateRange: '15/01/2026',
        totalClients: 10, totalPhones: '20', salesIA: 3, salesManual: 1,
        fromCache: true, lastUpdated: '2026-01-15',
        _raw: { totalClients: 10, totalPhones: 20, totalHabllaResponses: 15, salesIA: 3, salesManual: 1, notReceivedMsg: 2 }
      },
      {
        board: 'Board', campaignNames: 'Camp2', dateRange: '20/01/2026',
        totalClients: 5, totalPhones: '10', salesIA: 2, salesManual: 0,
        fromCache: true, lastUpdated: '2026-01-20',
        _raw: { totalClients: 5, totalPhones: 10, totalHabllaResponses: 8, salesIA: 2, salesManual: 0, notReceivedMsg: 1 }
      },
    ];

    const result = aggregateSummaries(summaries);
    
    expect(result.totalClients).toBe(15); // 10 + 5
    expect(result.totalPhones).toBe('30'); // 20 + 10
    expect(result.totalHabllaResponses).toBe('23'); // 15 + 8
    expect(result.salesIA).toBe(5); // 3 + 2
    expect(result.salesManual).toBe(1); // 1 + 0
    expect(result.notReceivedMsg).toBe(3); // 2 + 1
    expect(result.campaignNames).toBe('Camp1, Camp2');
  });

  test('recalcula taxas derivadas corretamente', () => {
    const summaries = [
      {
        board: 'Board', campaignNames: 'Camp1', dateRange: '15/01', fromCache: true, lastUpdated: '2026-01-15',
        _raw: { totalClients: 100, totalPhones: 200, totalHabllaResponses: 50, salesIA: 10, salesManual: 5, notReceivedMsg: 10 }
      },
      {
        board: 'Board', campaignNames: 'Camp2', dateRange: '20/01', fromCache: true, lastUpdated: '2026-01-20',
        _raw: { totalClients: 100, totalPhones: 100, totalHabllaResponses: 50, salesIA: 10, salesManual: 5, notReceivedMsg: 0 }
      },
    ];

    const result = aggregateSummaries(summaries);
    
    // Custo total: (300 phones - 10 notReceivedMsg) * 0.1 = 29
    expect(result.totalCost).toContain('29,00');
    
    // Response rate: (100 respostas / 200 clientes) * 100 = 50%
    expect(result.responseRate).toContain('50,00');
  });
});
