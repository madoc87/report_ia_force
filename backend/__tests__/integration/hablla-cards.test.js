/**
 * Testes da busca de cards na Hablla com uma API simulada:
 * consultas acima de 10.000 cards, filtro de etiquetas (todas obrigatórias)
 * e restrição de campanhas para analistas.
 */
import request from 'supertest';
import { setupTestDB, cleanupTestDB, generateToken } from '../helpers/setup.js';
import {
  app, fetchHabllaCards, filterCardsWithAllTags, parseTagList, setHabllaFetchForTests
} from '../../index.js';

const TAG_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TAG_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

// Simula a rota de cards da Hablla como ela se comporta de fato:
// - v3: aplica campaign (aqui, "contém"), status, order/direction_order; IGNORA start_date/end_date
// - v1: aplica start_date/end_date (exige field_date); IGNORA campaign
// - 50 por página, "Pagination too deep" acima da página 201; etiquetas com lógica "qualquer uma"
const createFakeHablla = (cards) => {
  const calls = [];
  const fakeFetch = async (url) => {
    const parsed = new URL(url);
    const version = parsed.pathname.split('/')[1];
    const params = parsed.searchParams;
    calls.push({ version, params });
    let list = cards;

    const campaign = params.get('campaign');
    if (version === 'v3' && campaign) {
      list = list.filter(c => c.campaign.includes(campaign));
    }
    const start = params.get('start_date');
    const end = params.get('end_date');
    if (version === 'v1' && start && end) {
      if (!params.get('field_date')) {
        return { ok: false, status: 500, text: async () => '{"statusCode":500}', headers: { get: () => null } };
      }
      list = list.filter(c => c.created_at >= start && c.created_at <= end);
    }
    const status = params.get('status');
    if (status) list = list.filter(c => c.status === status);
    const tags = params.getAll('tags');
    if (tags.length > 0) {
      list = list.filter(c => c.tags.some(t => tags.includes(t.id)));
    }
    if (params.get('order') === 'created_at') {
      const dir = params.get('direction_order') === 'desc' ? -1 : 1;
      list = [...list].sort((a, b) => (a.created_at < b.created_at ? -dir : a.created_at > b.created_at ? dir : 0));
    }

    const limit = Number(params.get('limit')) || 10;
    const page = Number(params.get('page')) || 1;
    const totalPages = Math.ceil(list.length / limit);
    if (page > 201) {
      return { ok: false, status: 400, text: async () => '{"message":"Pagination too deep"}', headers: { get: () => null } };
    }
    const results = list.slice((page - 1) * limit, page * limit);
    return { ok: true, status: 200, json: async () => ({ results, totalItems: list.length, totalPages }), headers: { get: () => null } };
  };
  return { fakeFetch, calls };
};

const STATUSES = ['lost', 'lost', 'lost', 'won', 'in_attendance'];

// Gera cards distribuídos no tempo (1 a cada 10 minutos a partir de 01/01/2026)
const makeCards = (count, campaign = 'HB Refil Venc JUN25.04') =>
  Array.from({ length: count }, (_, i) => ({
    id: `card-${i}`,
    campaign,
    name: `Cliente ${i}`,
    status: STATUSES[i % STATUSES.length],
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
  test('consulta pequena: busca direta na v3, sem filtro de data', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(120));
    setHabllaFetchForTests(fakeFetch);

    const cards = await fetchHabllaCards({ campaign: 'JUN25' });

    expect(cards).toHaveLength(120);
    expect(calls).toHaveLength(3);
    expect(calls[0].version).toBe('v3');
    expect(calls[0].params.get('start_date')).toBeNull();
    expect(calls[0].params.get('limit')).toBe('50');
  });

  test('acima de 10.000 cards: divide por status, lê nos dois sentidos e traz todos sem duplicados', async () => {
    // 3/5 são "lost": 15.000 cards só nesse status (acima de 201 páginas)
    const { fakeFetch, calls } = createFakeHablla(makeCards(25000));
    setHabllaFetchForTests(fakeFetch);

    const cards = await fetchHabllaCards({ campaign: 'JUN25' });

    expect(cards).toHaveLength(25000);
    expect(new Set(cards.map(c => c.id)).size).toBe(25000);
    expect(calls.every(c => c.version === 'v3')).toBe(true);
    expect(calls.every(c => Number(c.params.get('page')) <= 201)).toBe(true);
    expect(calls.some(c => c.params.get('status') === 'lost' && c.params.get('direction_order') === 'desc')).toBe(true);
  });

  test('status com mais de ~20.000 cards: interrompe com erro claro', async () => {
    const all = makeCards(21000).map(c => ({ ...c, status: 'lost' }));
    const { fakeFetch } = createFakeHablla(all);
    setHabllaFetchForTests(fakeFetch);

    await expect(fetchHabllaCards({ campaign: 'JUN25' })).rejects.toMatchObject({ code: 'HABLLA_PAGINATION_LIMIT' });
  });

  test('cards com status fora dos conhecidos: falha em vez de mostrar números incompletos', async () => {
    const all = makeCards(11000).map((c, i) => (i % 100 === 0 ? { ...c, status: 'outro' } : c));
    const { fakeFetch } = createFakeHablla(all);
    setHabllaFetchForTests(fakeFetch);

    await expect(fetchHabllaCards({ campaign: 'JUN25' })).rejects.toMatchObject({ code: 'HABLLA_INCOMPLETE_RESULT' });
  });

  test('transform descarta cards de outras campanhas página a página, inclusive na consulta dividida', async () => {
    // Busca por semelhança: metade dos cards é de outra campanha parecida
    const all = makeCards(23000).map((c, i) => ({ ...c, campaign: i % 2 ? 'HB X.02' : 'HB X.01', extra: 'x'.repeat(100) }));
    const { fakeFetch } = createFakeHablla(all);
    setHabllaFetchForTests(fakeFetch);

    const cards = await fetchHabllaCards({ campaign: 'HB X' }, null, {
      transform: (c) => (c.campaign === 'HB X.01' ? { id: c.id } : null)
    });

    expect(cards).toHaveLength(11500);
    expect(cards.every(c => Object.keys(c).length === 1)).toBe(true);
  });

  test('com campanha e período: a v3 ignora as datas, então o período é aplicado pela aplicação', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(300));
    setHabllaFetchForTests(fakeFetch);

    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T09:59:59.999Z');
    const cards = await fetchHabllaCards({ campaign: 'JUN25' }, { start, end });

    expect(cards).toHaveLength(60); // 10 horas x 6 cards por hora
    expect(calls[0].version).toBe('v3');
  });

  test('sem campanha e com período: usa a v1 (que aplica as datas) e divide o período acima do limite', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(23000));
    setHabllaFetchForTests(fakeFetch);

    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-12-31T23:59:59.999Z');
    const cards = await fetchHabllaCards({ board: 'b' }, { start, end });

    expect(cards).toHaveLength(23000);
    expect(new Set(cards.map(c => c.id)).size).toBe(23000);
    expect(calls.every(c => c.version === 'v1' && c.params.get('field_date') === 'created_at')).toBe(true);
    expect(calls.every(c => Number(c.params.get('page')) <= 201)).toBe(true);
  });

  test('etiquetas são enviadas como parâmetros repetidos', async () => {
    const { fakeFetch, calls } = createFakeHablla(makeCards(10));
    setHabllaFetchForTests(fakeFetch);

    await fetchHabllaCards({ campaign: 'X', tags: [TAG_A, TAG_B] });

    expect(calls[0].params.getAll('tags')).toEqual([TAG_A, TAG_B]);
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
