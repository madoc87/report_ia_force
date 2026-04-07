/**
 * Testes de integração para as rotas de gerenciamento de usuários.
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

describe('GET /api/users', () => {
  test('admin lista usuários com sucesso', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('retorno não contém password_hash', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    const user = res.body[0];
    expect(user.password_hash).toBeUndefined();
    expect(user.id).toBeDefined();
    expect(user.name).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.role).toBeDefined();
  });

  test('usuário comum não pode listar usuários (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Acesso negado');
  });
});

describe('POST /api/users', () => {
  test('admin cria novo usuário com sucesso', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Novo Operador',
        email: 'operador@teste.com',
        password: 'senha123',
        role: 'user'
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('sucesso');
    expect(res.body.id).toBeDefined();
  });

  test('retorna 400 com email duplicado', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Admin Duplicado',
        email: 'admin@teste.com',
        password: 'senha123'
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('já está cadastrado');
  });

  test('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Incompleto' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('obrigatórios');
  });

  test('usuário comum não pode criar usuários (403)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Tentativa',
        email: 'tentativa@teste.com',
        password: 'senha123'
      });

    expect(res.status).toBe(403);
  });

  test('cria usuário com force_password_change = 1', async () => {
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Force Change',
        email: 'forcechange@teste.com',
        password: 'temporaria123',
        role: 'user'
      });

    expect(createRes.status).toBe(201);

    // Login e verificar flag
    const loginRes = await request(app)
      .post('/api/login')
      .send({ email: 'forcechange@teste.com', password: 'temporaria123' });

    expect(loginRes.body.user.force_password_change).toBe(true);
  });
});

describe('PUT /api/users/:id/reset-password', () => {
  test('admin reseta senha com sucesso', async () => {
    const res = await request(app)
      .put('/api/users/2/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'novaSenha123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('atualizada');
  });

  test('retorna 400 sem senha', async () => {
    const res = await request(app)
      .put('/api/users/2/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/users/:id', () => {
  test('admin deleta outro usuário com sucesso', async () => {
    // Criar usuário para deletar
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Para Deletar',
        email: 'deleteme@teste.com',
        password: 'senha123'
      });

    const userId = createRes.body.id;

    const res = await request(app)
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('removido');
  });

  test('admin não pode deletar a si mesmo (400)', async () => {
    const res = await request(app)
      .delete('/api/users/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('própria conta');
  });
});

describe('PUT /api/users/theme', () => {
  test('atualiza tema com valor válido (dark)', async () => {
    const res = await request(app)
      .put('/api/users/theme')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ theme: 'dark' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Tema atualizado');
  });

  test('atualiza tema com valor válido (light)', async () => {
    const res = await request(app)
      .put('/api/users/theme')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ theme: 'light' });

    expect(res.status).toBe(200);
  });

  test('atualiza tema com valor válido (system)', async () => {
    const res = await request(app)
      .put('/api/users/theme')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ theme: 'system' });

    expect(res.status).toBe(200);
  });

  test('retorna 400 com tema inválido', async () => {
    const res = await request(app)
      .put('/api/users/theme')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ theme: 'azul-neon' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('inválido');
  });
});
