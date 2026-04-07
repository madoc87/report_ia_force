/**
 * Testes de integração para rota de saúde, configurações de cronjob e sys_logs.
 */
import request from 'supertest';
import { setupTestDB, cleanupTestDB, generateToken } from '../helpers/setup.js';
import { app } from '../../index.js';

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

describe('GET /test (Health Check)', () => {
  test('retorna status ok sem autenticação', async () => {
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.message).toBeDefined();
  });
});

describe('GET /api/settings/cronjob', () => {
  test('admin acessa configurações de cronjob', async () => {
    const res = await request(app)
      .get('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBeDefined();
    expect(res.body.time).toBeDefined();
  });

  test('retorna config padrão quando nunca configurado', async () => {
    const res = await request(app)
      .get('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.time).toEqual(['00:00']);
    expect(res.body.frequency).toBe('1x por dia');
  });

  test('usuário comum não pode acessar configurações (403)', async () => {
    const res = await request(app)
      .get('/api/settings/cronjob')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/settings/cronjob', () => {
  test('admin salva configuração de cronjob com sucesso', async () => {
    const res = await request(app)
      .post('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enabled: true,
        time: ['08:00', '18:00'],
        frequency: '2x por dia'
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('sucesso');
  });

  test('configuração salva persiste na leitura', async () => {
    // Salva
    await request(app)
      .post('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enabled: false,
        time: ['12:00'],
        frequency: '1x por dia'
      });

    // Lê
    const res = await request(app)
      .get('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.enabled).toBe(false);
    expect(res.body.time).toEqual(['12:00']);
  });

  test('retorna 400 sem horário', async () => {
    const res = await request(app)
      .post('/api/settings/cronjob')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enabled: true,
        frequency: '1x por dia'
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('obrigatório');
  });
});

describe('GET /api/sys-logs', () => {
  test('retorna array de logs (pode ser vazio)', async () => {
    const res = await request(app)
      .get('/api/sys-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/sys-logs/mark-read', () => {
  test('marca logs como lidos com sucesso', async () => {
    // Inserir log de teste diretamente no banco
    await db.run(
      'INSERT INTO sys_logs (id, title, message, type, timestamp, is_read) VALUES (?, ?, ?, ?, datetime("now"), 0)',
      ['test-log-1', 'Teste', 'Mensagem de teste', 'info']
    );

    const res = await request(app)
      .post('/api/sys-logs/mark-read')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: ['test-log-1'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verificar que não aparece mais nos não lidos
    const logsRes = await request(app)
      .get('/api/sys-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    const testLog = logsRes.body.find(l => l.id === 'test-log-1');
    expect(testLog).toBeUndefined(); // Não deveria aparecer pois está marcado como lido
  });
});

describe('GET /api/dashboard-data', () => {
  test('retorna dados do dashboard com autenticação', async () => {
    const res = await request(app)
      .get('/api/dashboard-data')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/dashboard-data');

    expect(res.status).toBe(401);
  });
});
