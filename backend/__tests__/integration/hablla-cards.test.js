/**
 * Testes da busca de cards na Hablla com uma API simulada:
 * divisão por período acima de 10.000 cards, filtro de etiquetas (todas obrigatórias)
 * e restrição de campanhas para analistas.
 */
import request from 'supertest';
import { setupTestDB, cleanupTestDB, generateToken } from '../helpers/setup.js';
import {
  app, fetchHabllaCards, filterCardsWithAllTags, parseTagList, setHabllaFetchForTests
} from '../../index.js';

const TAG_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TAG_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

// Simula a rota de cards da Hablla: 50 por página, limite de 200 páginas,
// filtro start_date/end_date pelo created_at e etiquetas com lógica "qualquer uma".
const createFakeHablla = (cards, { ignoreDates = false } = {}) => {
  const calls = [];
  const fakeFetch = async (url) => {
    const params = new URL(url).searchParams;
    calls.push(params);
    let list = cards;

    const start = params.get('start_date');
    const end = params.get('end_date');
    if (!ignoreDates && start && end) {
      list = list.filter(c => c.created_at >= start && c.created_at <= end);
    }
    const tags = params.getAll('tags');
    if (tags.length > 0) {
      list = list.filter(c => c.tags.some(t => tags.includes(t.id)));
    }

    const limit = Number(params.get('limit')) || 10;
    const page = Number(params.get('page')) || 1;
    const totalPages = Math.max(1, Math.ceil(list.length / limit));
    if (page > 200) {
      return { ok: false, status: 400, text: async () => '{"message":"Pagination too deep"}', headers: { get: () => null } };
    }
    const results = list.slice((page - 1) * limit, page * limit);
    return { ok: true, status: 200, json: async () => ({ results, totalPages }), headers: { get: () => null } };
  };
  return { fakeFetch, calls };
};

// Gera cards distribuídos no tempo (1 a cada 10 minutos a partir de 01/01/2026)
const makeCards = (count, campaign = 'HB Refil Venc JUN25.04') =>
  Array.from({ length: count }, (_, i) => ({
    id: `card-${i}`,
    campaign,
    name: `Cliente ${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 10 * 60 * 1000).toISOString(),
    tags: [],
  }));

let db;

beforeAll(async () => {
  db = await setupTestDB();
});

afterAll(async () => {
  setHabllaFetchForTests(null);
  await cleanupTestDB();
});

describe('fetchHabllaCards', () => {
  test('consulta pequena: busca direta, sem enviar filtro de data', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(120));
    setHabllaFetchForTests(fakeFetch);

    const cards = await fetchHabllaCards({ campaign: 'X' });

    expect(cards).toHaveLength(120);
    expect(calls).toHaveLength(3);
    expect(calls[0].get('start_date')).toBeNull();
    expect(calls[0].get('limit')).toBe('50');
  });

  test('acima de 10.000 cards: divide por período e traz todos, sem duplicados', async () => {
    const all = makeCards(23000);
    const { fakeFetch, calls } = createFakeHablla(all);
    setHabllaFetchForTests(fakeFetch);
    process.env.HABLLA_CARDS_START_DATE = '2025-12-01T00:00:00.000Z';

    const cards = await fetchHabllaCards({ campaign: 'X' });

    expect(cards).toHaveLength(23000);
    expect(new Set(cards.map(c => c.id)).size).toBe(23000);
    expect(calls.some(p => p.get('field_date') === 'created_at')).toBe(true);
    expect(calls.every(p => Number(p.get('page')) <= 200)).toBe(true);
    delete process.env.HABLLA_CARDS_START_DATE;
  });

  test('com período informado pelo usuário, envia start_date/end_date desde a 1ª chamada', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(300));
    setHabllaFetchForTests(fakeFetch);

    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T09:59:59.999Z');
    const cards = await fetchHabllaCards({ campaign: 'X' }, { start, end });

    expect(cards).toHaveLength(60); // 10 horas x 6 cards por hora
    expect(calls[0].get('start_date')).toBe(start.toISOString());
    expect(calls[0].get('end_date')).toBe(end.toISOString());
  });

  test('se a Hablla ignorar o filtro de data, interrompe com erro claro em vez de repetir consultas', async () => {
    const { fakeFetch } = createFakeHablla(makeCards(12000), { ignoreDates: true });
    setHabllaFetchForTests(fakeFetch);
    process.env.HABLLA_CARDS_START_DATE = '2025-12-01T00:00:00.000Z';

    await expect(fetchHabllaCards({ campaign: 'X' })).rejects.toMatchObject({ code: 'HABLLA_DATE_FILTER_IGNORED' });
    delete process.env.HABLLA_CARDS_START_DATE;
  });

  test('etiquetas são enviadas como parâmetros repetidos', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(10));
    setHabllaFetchForTests(fakeFetch);

    await fetchHabllaCards({ campaign: 'X', tags: [TAG_A, TAG_B] });

    expect(calls[0].getAll('tags')).toEqual([TAG_A, TAG_B]);
  });
});

describe('Filtro de etiquetas (todas obrigatórias)', () => {
  const cards = [
    { id: '1', tags: [{ id: TAG_A, name: 'IA - Venda Manual' }, { id: TAG_B, name: 'IA - Corrigir' }] },
    { id: '2', tags: [{ id: TAG_B, name: 'IA - Corrigir' }] },
    { id: '3', tags: [{ id: TAG_A }, { id: TAG_B }, { id: 'cccccccccccccccccccccccc' }] },
    { id: '4', tags: [] },
  ];

  test('mantém apenas cards com todas as etiquetas selecionadas (podem ter outras)', () => {
    expect(filterCardsWithAllTags(cards, [TAG_A, TAG_B]).map(c => c.id)).toEqual(['1', '3']);
  });

  test('sem etiquetas selecionadas, não filtra', () => {
    expect(filterCardsWithAllTags(cards, [])).toHaveLength(4);
  });

  test('aceita lista separada por vírgula e remove repetidas', () => {
    expect(parseTagList(`${TAG_A}, ${TAG_B},${TAG_A}`)).toEqual([TAG_A, TAG_B]);
  });

  test('GET /api/cards devolve só os cards com todas as etiquetas', async () => {
    const habllaCards = cards.map(c => ({ ...c, campaign: 'C', created_at: '2026-01-01T00:00:00.000Z' }));
    const { fakeFetch } = createFakeHablla(habllaCards);
    setHabllaFetchForTests(fakeFetch);

    const res = await request(app)
      .get('/api/cards')
      .query({ tags: `${TAG_A},${TAG_B}` })
      .set('Authorization', `Bearer ${generateToken('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.map(c => c.id)).toEqual(['1', '3']);
  });

  test('GET /api/cards rejeita período invertido', async () => {
    const res = await request(app)
      .get('/api/cards')
      .query({ startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-01-01T00:00:00.000Z' })
      .set('Authorization', `Bearer ${generateToken('admin')}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_DATE_RANGE');
  });
});

describe('Campanhas permitidas para analistas', () => {
  test('analista não consulta campanha não cadastrada', async () => {
    const res = await request(app)
      .get('/api/campaign-summary')
      .query({ campaign: 'Campanha Inventada' })
      .set('Authorization', `Bearer ${generateToken('user')}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CAMPAIGN_NOT_REGISTERED');
  });

  test('analista consulta campanha cadastrada', async () => {
    const { fakeFetch } = createFakeHablla(makeCards(5, 'Campanha Teste Jan'));
    setHabllaFetchForTests(fakeFetch);

    const res = await request(app)
      .get('/api/campaign-summary')
      .query({ campaign: 'Campanha Teste Jan' })
      .set('Authorization', `Bearer ${generateToken('user')}`);

    expect(res.status).toBe(200);
    expect(res.body.totalPhones).toBe('5');
  });
});
