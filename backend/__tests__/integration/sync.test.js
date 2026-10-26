/**
 * Testes de erros de sincronização, cache do Dashboard, notificações detalhadas e versão.
 */
import request from 'supertest';
import { setupTestDB, cleanupTestDB, generateToken } from '../helpers/setup.js';
import {
  app, SyncError, buildHabllaHttpError, buildHabllaNetworkError, withSyncContext, processCampaign
} from '../../index.js';

const DEFAULT_BOARD = process.env.BOARD_ID_HABLLA || '682251a6c5a42b757a5dbe79';

let db;
let adminToken;
let userToken;

beforeAll(async () => {
  db = await setupTestDB();
  adminToken = generateToken('admin');
  userToken = generateToken('user');
});

afterAll(async () => {
  await cleanupTestDB();
});

const insertSummary = (campaign, boardId) => db.run(
  `INSERT INTO campaign_summaries (campaign_name, board_id, board_name, date_range, total_clients, total_phones,
    total_hablla_responses, sales_ia, sales_manual, not_received_msg, total_cost, average_sold, response_rate,
    conversion_sales_clients, conversion_sales_responses)
   VALUES (?, ?, 'Quadro', '01/01/2026', 10, 20, 5, 1, 1, 0, 'R$ 2,00', 'R$ 299,80', '50,00%', '20,00%', '40,00%')`,
  [campaign, boardId]
);

describe('Classificação de erros da Hablla', () => {
  test.each([
    [401, '', 'HABLLA_AUTH'],
    [403, '', 'HABLLA_AUTH'],
    [404, '', 'HABLLA_NOT_FOUND'],
    [429, '', 'HABLLA_RATE_LIMIT'],
    [503, '', 'HABLLA_SERVER_ERROR'],
    [400, '{"message":"invalid"}', 'HABLLA_BAD_REQUEST'],
    [400, '{"message":"Pagination too deep"}', 'HABLLA_PAGINATION_LIMIT'],
    // Token inválido chega como 404 na Hablla
    [404, '{"errorCode":212,"message":"Invalid workspace token"}', 'HABLLA_AUTH'],
  ])('HTTP %i gera o código correto', (status, body, code) => {
    const err = buildHabllaHttpError(status, body, { endpoint: '/v3/x', page: 2 });

    expect(err).toBeInstanceOf(SyncError);
    expect(err.code).toBe(code);
    expect(err.details.page).toBe(2);
    expect(err.details.hint).toBeDefined();
  });

  test('resposta longa da Hablla é truncada nos detalhes', () => {
    const err = buildHabllaHttpError(500, 'x'.repeat(1000));
    expect(err.details.responseBody.length).toBeLessThanOrEqual(301);
  });

  test('timeout e falha de rede geram códigos distintos', () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    expect(buildHabllaNetworkError(timeout).code).toBe('HABLLA_TIMEOUT');

    const network = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const err = buildHabllaNetworkError(network);
    expect(err.code).toBe('HABLLA_UNREACHABLE');
    expect(err.details.cause).toBe('ENOTFOUND');
  });

  test('withSyncContext adiciona campanha/etapa e converte erros inesperados', () => {
    const wrapped = withSyncContext(new TypeError('x is undefined'), { campaign: 'C1', stage: 'Cálculo' });
    expect(wrapped.code).toBe('UNEXPECTED_ERROR');
    expect(wrapped.details).toMatchObject({ campaign: 'C1', stage: 'Cálculo', cause: 'x is undefined' });

    const original = new SyncError('HABLLA_AUTH', 'Recusado', { httpStatus: 401 });
    const enriched = withSyncContext(original, { campaign: 'C2' });
    expect(enriched).toBe(original);
    expect(enriched.details).toMatchObject({ campaign: 'C2', httpStatus: 401 });
  });
});

describe('Cache de resumos', () => {
  test('sem filtros, devolve o resumo salvo sem consultar a Hablla', async () => {
    await insertSummary('Campanha Cache', DEFAULT_BOARD);

    const summary = await processCampaign('Campanha Cache', DEFAULT_BOARD, undefined, {}, false);
    expect(summary.fromCache).toBe(true);
    expect(summary.totalClients).toBe(10);
  });
});

describe('GET /api/dashboard-data', () => {
  test('retorna apenas campanhas do quadro padrão', async () => {
    await insertSummary('Campanha Padrao', DEFAULT_BOARD);
    await insertSummary('Campanha Outro Quadro', 'aaaaaaaaaaaaaaaaaaaaaaaa');

    const res = await request(app).get('/api/dashboard-data').set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const names = res.body.map(r => r.campaign_name);
    expect(names).toContain('Campanha Padrao');
    expect(names).not.toContain('Campanha Outro Quadro');
  });
});

describe('Notificações com detalhes', () => {
  test('sys-logs devolve os detalhes técnicos já convertidos em objeto', async () => {
    await db.run(
      "INSERT INTO sys_logs (id, title, message, type, timestamp, is_read, details) VALUES ('log1', 'T', 'M', 'warning', datetime('now'), 0, ?)",
      [JSON.stringify({ failures: [{ campaign: 'C1', code: 'HABLLA_AUTH' }] })]
    );

    const res = await request(app).get('/api/sys-logs').set('Authorization', `Bearer ${adminToken}`);
    const log = res.body.find(l => l.id === 'log1');

    expect(log.details.failures[0].code).toBe('HABLLA_AUTH');
  });
});

describe('Configuração do agendamento', () => {
  test('rejeita horário inválido', async () => {
    const res = await request(app)
      .post('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, time: ['25:99'], frequency: '1x por dia' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CRON_TIME');
  });
});

describe('GET /api/version', () => {
  test('administrador recebe a versão do backend', async () => {
    const res = await request(app).get('/api/version').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('analista não tem acesso', async () => {
    const res = await request(app).get('/api/version').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
