/**
 * Testes de integração das proteções de segurança:
 * permissões por perfil, troca de senha obrigatória, sessão revogada,
 * limite de tentativas de login, validação de IDs e de arquivos de banco/backup.
 */
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { setupTestDB, cleanupTestDB, generateToken } from '../helpers/setup.js';
import { app, resetLoginRateLimiter, validateDatabaseFile, resolveBackupPath } from '../../index.js';

let db;
let adminToken;
let userToken;
let gestorToken;
let tmpDir;

beforeAll(async () => {
  db = await setupTestDB();
  adminToken = generateToken('admin');
  userToken = generateToken('user');
  gestorToken = generateToken('gestor');
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ia-force-test-'));
});

afterAll(async () => {
  await cleanupTestDB();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetLoginRateLimiter();
});

describe('Permissões por perfil (validadas no backend)', () => {
  test.each([
    ['get', '/api/tags'],
    ['get', '/api/sectors'],
    ['get', '/api/lists'],
    ['get', '/api/cards'],
    ['get', '/api/sys-logs'],
    ['post', '/api/sys-logs/mark-read'],
    ['get', '/api/integrations/webhook'],
  ])('analista recebe 403 FORBIDDEN_ROLE em %s %s', async (method, url) => {
    const res = await request(app)[method](url).set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  test('analista não pode forçar atualização de campanha', async () => {
    const res = await request(app)
      .post('/api/campaign-summary/refresh')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ campaign: 'Campanha Teste Jan' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  test('gestor passa pela autorização da atualização de campanha', async () => {
    const res = await request(app)
      .post('/api/campaign-summary/refresh')
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({});

    // 400 = passou da autorização e falhou na validação (sem chamar a Hablla)
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CAMPAIGN');
  });

  test('alterar o papel dentro do token não concede acesso (papel vem do banco)', async () => {
    const forged = generateToken('user', { role: 'admin' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  test('rota quebrada /api/all-summaries foi removida', async () => {
    const res = await request(app).get('/api/all-summaries').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  test('cadastro de usuário rejeita perfil inexistente', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', email: 'x@teste.com', password: 'senha123', role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ROLE');
  });
});

describe('Sessão e troca de senha obrigatória', () => {
  test('usuário com troca pendente é bloqueado nas rotas comuns', async () => {
    const token = generateToken('user', { id: 4, email: 'novo@teste.com', force_password_change: false });
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('usuário com troca pendente consegue trocar a senha e depois acessar', async () => {
    const token = generateToken('user', { id: 4, email: 'novo@teste.com' });

    const change = await request(app)
      .post('/api/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'temp123', newPassword: 'definitiva123' });
    expect(change.status).toBe(200);
    expect(change.body.user.force_password_change).toBe(false);

    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${change.body.token}`);
    expect(res.status).toBe(200);
  });

  test('token de usuário removido é rejeitado com 401', async () => {
    const token = generateToken('user', { id: 999 });
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('cabeçalho sem o esquema Bearer é rejeitado', async () => {
    const res = await request(app).get('/api/campaigns').set('Authorization', adminToken);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });
});

describe('Limite de tentativas de login', () => {
  test('bloqueia após 5 senhas erradas e informa o tempo de espera', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/login').send({ email: 'gestor@teste.com', password: 'errada' });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post('/api/login').send({ email: 'gestor@teste.com', password: 'gestor123' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  test('avisa quando restam poucas tentativas', async () => {
    let last;
    for (let i = 0; i < 3; i++) {
      last = await request(app).post('/api/login').send({ email: 'gestor@teste.com', password: 'errada' });
    }
    expect(last.body.remainingAttempts).toBe(2);
    expect(last.body.message).toContain('Restam 2');
  });

  test('login correto antes do bloqueio zera o contador da conta', async () => {
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/login').send({ email: 'gestor@teste.com', password: 'errada' });
    }
    const ok = await request(app).post('/api/login').send({ email: 'gestor@teste.com', password: 'gestor123' });
    expect(ok.status).toBe(200);

    const again = await request(app).post('/api/login').send({ email: 'gestor@teste.com', password: 'errada' });
    expect(again.body.remainingAttempts).toBe(4);
  });
});

describe('Validação de IDs enviados à Hablla', () => {
  test('quadro com caminho manipulado é rejeitado', async () => {
    const res = await request(app)
      .get('/api/lists')
      .query({ board: '../../../v1/workspaces' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BOARD');
  });

  test('lista de campanhas acima do limite é rejeitada', async () => {
    const campaign = Array.from({ length: 101 }, (_, i) => `C${i}`).join(',');
    const res = await request(app)
      .get('/api/campaign-summary')
      .query({ campaign })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CAMPAIGN');
  });
});

describe('Backups e importação de banco', () => {
  test.each([
    '..%2Findex.js',
    '..%2F..%2Fetc%2Fpasswd',
    'backup.txt',
    '.hidden.sqlite',
  ])('rejeita nome de backup inválido: %s', async (name) => {
    const del = await request(app)
      .delete(`/api/database/backups/${name}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(400);
    expect(del.body.code).toBe('INVALID_BACKUP_NAME');

    const restore = await request(app)
      .post(`/api/database/backups/${name}/restore`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(restore.status).toBe(400);
  });

  test('resolveBackupPath aceita apenas arquivos dentro da pasta de backups', () => {
    expect(resolveBackupPath('database_2026-01-01_10-00-00.sqlite')).not.toBeNull();
    expect(resolveBackupPath('../database.sqlite')).toBeNull();
    expect(resolveBackupPath('sub/dir.sqlite')).toBeNull();
  });

  test('importação rejeita extensão não permitida', async () => {
    const res = await request(app)
      .post('/api/database/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('database', Buffer.from('conteudo'), 'banco.txt');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  test('importação rejeita arquivo com extensão correta mas conteúdo inválido', async () => {
    const res = await request(app)
      .post('/api/database/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('database', Buffer.from('isto não é um banco sqlite'), 'banco.sqlite');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_DATABASE');
  });

  test('analista não pode importar banco', async () => {
    const res = await request(app)
      .post('/api/database/import')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('database', Buffer.from('x'), 'banco.sqlite');

    expect(res.status).toBe(403);
  });

  const createDb = async (file, setup) => {
    const candidate = await open({ filename: file, driver: sqlite3.Database });
    await candidate.exec(setup);
    await candidate.close();
  };

  test('validateDatabaseFile aceita banco compatível com administrador', async () => {
    const file = path.join(tmpDir, 'valido.sqlite');
    await createDb(file, `
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT);
      CREATE TABLE campaign_summaries (id INTEGER PRIMARY KEY);
      INSERT INTO users (email, password_hash, role) VALUES ('a@a.com', 'x', 'admin');
    `);

    await expect(validateDatabaseFile(file)).resolves.toEqual({ ok: true });
  });

  test('validateDatabaseFile rejeita banco SQLite de outra aplicação', async () => {
    const file = path.join(tmpDir, 'outro.sqlite');
    await createDb(file, 'CREATE TABLE produtos (id INTEGER PRIMARY KEY);');

    const result = await validateDatabaseFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('tabelas ausentes');
  });

  test('validateDatabaseFile rejeita banco sem administrador', async () => {
    const file = path.join(tmpDir, 'sem-admin.sqlite');
    await createDb(file, `
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT);
      CREATE TABLE campaign_summaries (id INTEGER PRIMARY KEY);
    `);

    const result = await validateDatabaseFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('administrador');
  });

  test('validateDatabaseFile rejeita banco com triggers', async () => {
    const file = path.join(tmpDir, 'trigger.sqlite');
    await createDb(file, `
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT);
      CREATE TABLE campaign_summaries (id INTEGER PRIMARY KEY);
      INSERT INTO users (email, password_hash, role) VALUES ('a@a.com', 'x', 'admin');
      CREATE TRIGGER t AFTER INSERT ON campaign_summaries BEGIN DELETE FROM users; END;
    `);

    const result = await validateDatabaseFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('triggers');
  });
});

describe('Webhook de relatório', () => {
  test('informa que a integração está desabilitada sem WEBHOOK_REPORT_URL', async () => {
    const status = await request(app)
      .get('/api/integrations/webhook')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(false);

    const send = await request(app)
      .post('/api/integrations/webhook/report')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ campanha: 'X' });
    expect(send.status).toBe(503);
    expect(send.body.code).toBe('WEBHOOK_DISABLED');
  });
});
