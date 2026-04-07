/**
 * Testes de integração para as rotas de CRUD de campanhas.
 */
import request from 'supertest';
import { setupTestDB, cleanupTestDB, generateToken } from '../helpers/setup.js';
import { app } from '../../index.js';

let db;
let adminToken;
let userToken;
let gestorToken;

beforeAll(async () => {
  db = await setupTestDB();
  adminToken = generateToken('admin');
  userToken = generateToken('user');
  gestorToken = generateToken('gestor');
});

afterAll(async () => {
  await cleanupTestDB();
});

describe('GET /api/campaigns', () => {
  test('lista campanhas com autenticação', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('cada campanha tem campos formatados corretamente', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`);

    const campaign = res.body[0];
    expect(campaign.name).toBeDefined();
    expect(campaign.date).toBeDefined();
    expect(campaign.reference_month).toBeDefined();
    expect(campaign.number).toBeDefined();
    expect(campaign.month).toBeDefined(); // Campo calculado no formato D01-Jan
    expect(campaign.template_enviado).toBeDefined();
  });

  test('usuário comum pode listar campanhas', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/campaigns', () => {
  test('admin cria campanha com sucesso', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Nova Campanha Fev',
        date: '2026-02-15',
        time: '14:30',
        reference_month: 'Fevereiro',
        template_enviado: 'Template de teste'
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('sucesso');
    expect(res.body.id).toBeDefined();
  });

  test('usuário comum não pode criar campanha (403)', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Campanha User',
        date: '2026-02-15',
        time: '10:00',
        reference_month: 'Fevereiro'
      });

    expect(res.status).toBe(403);
  });

  test('gestor não pode criar campanha (403)', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        name: 'Campanha Gestor',
        date: '2026-02-15',
        time: '10:00',
        reference_month: 'Fevereiro'
      });

    expect(res.status).toBe(403);
  });

  test('retorna 400 sem nome da campanha', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-02-15',
        time: '10:00',
        reference_month: 'Fevereiro'
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('obrigatórios');
  });

  test('retorna 400 com hora em formato inválido', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Campanha Hora Errada',
        date: '2026-02-15',
        time: '25:99',
        reference_month: 'Fevereiro'
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('hora inválido');
  });

  test('auto-numera a campanha quando número não informado', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Campanha Auto Num',
        date: '2026-01-20',
        time: '08:00',
        reference_month: 'Janeiro'
      });

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/campaigns/:id', () => {
  test('admin atualiza campanha com sucesso', async () => {
    // Pegar uma campanha existente
    const list = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`);

    const campaignId = list.body[0].id;

    const res = await request(app)
      .put(`/api/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Campanha Atualizada',
        date: '2026-01-16',
        time: '10:30',
        reference_month: 'Janeiro',
        number: 1,
        template_enviado: 'Template atualizado'
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('atualizada');
  });

  test('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .put('/api/campaigns/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/campaigns/:id', () => {
  test('admin deleta campanha com sucesso', async () => {
    // Criar campanha para deletar
    const createRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Campanha Para Deletar',
        date: '2026-03-01',
        time: '12:00',
        reference_month: 'Março'
      });

    const campaignId = createRes.body.id;

    const res = await request(app)
      .delete(`/api/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('excluída');
  });

  test('usuário comum não pode deletar campanha', async () => {
    const res = await request(app)
      .delete('/api/campaigns/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});
