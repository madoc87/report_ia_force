/**
 * Testes de integração para as rotas de autenticação.
 */
import request from 'supertest';
import { setupTestDB, cleanupTestDB, generateToken, generateExpiredToken } from '../helpers/setup.js';
import { app } from '../../index.js';

let db;

beforeAll(async () => {
  db = await setupTestDB();
});

afterAll(async () => {
  await cleanupTestDB();
});

describe('POST /api/login', () => {
  test('retorna token JWT com credenciais válidas', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@teste.com', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('admin@teste.com');
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.name).toBe('Admin Teste');
  });

  test('retorna 401 com email inexistente', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'naoexiste@teste.com', password: 'admin123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Credenciais inválidas');
  });

  test('retorna 401 com senha errada', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@teste.com', password: 'senhaerrada' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Credenciais inválidas');
  });

  test('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('obrigatórios');
  });

  test('retorna 400 sem email', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ password: 'admin123' });

    expect(res.status).toBe(400);
  });

  test('retorna flag force_password_change para usuário novo', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'novo@teste.com', password: 'temp123' });

    expect(res.status).toBe(200);
    expect(res.body.user.force_password_change).toBe(true);
  });

  test('retorna tema do usuário no login', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@teste.com', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.user.theme).toBeDefined();
  });
});

describe('Middleware authenticateToken', () => {
  test('retorna 401 sem token de autenticação', async () => {
    const res = await request(app).get('/api/tags');

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Token');
  });

  test('retorna 403 com token inválido', async () => {
    const res = await request(app)
      .get('/api/tags')
      .set('Authorization', 'Bearer token_invalido_123');

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('inválido');
  });

  test('retorna 403 com token expirado', async () => {
    const expiredToken = generateExpiredToken();
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/change-password', () => {
  test('troca senha com sucesso e retorna novo token', async () => {
    const token = generateToken('user', { id: 2 });

    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'user123', newPassword: 'novaSenha456' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Senha modificada');
    expect(res.body.token).toBeDefined();
  });

  test('retorna 401 com senha atual incorreta', async () => {
    const token = generateToken('user', { id: 2 });

    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'senha_errada', newPassword: 'novaSenha456' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('não confere');
  });

  test('retorna 400 sem campos obrigatórios', async () => {
    const token = generateToken('user', { id: 2 });

    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('exigidas');
  });
});
