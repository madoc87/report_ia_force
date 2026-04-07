/**
 * Setup helper para testes do backend.
 * Inicializa um banco SQLite em memória e cria dados mock.
 */
import { app, initializeDatabase } from '../../index.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const jwtSecret = process.env.JWT_SECRET || 'secret123';

let db;

/**
 * Inicializa o banco e cria dados de teste
 */
export async function setupTestDB() {
  db = await initializeDatabase(':memory:');

  // Criar usuário admin de teste
  const adminHash = await bcrypt.hash('admin123', 10);
  await db.run(
    'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
    ['Admin Teste', 'admin@teste.com', adminHash, 'admin', 0]
  );

  // Criar usuário comum de teste
  const userHash = await bcrypt.hash('user123', 10);
  await db.run(
    'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
    ['Usuário Teste', 'user@teste.com', userHash, 'user', 0]
  );

  // Criar usuário gestor de teste
  const gestorHash = await bcrypt.hash('gestor123', 10);
  await db.run(
    'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
    ['Gestor Teste', 'gestor@teste.com', gestorHash, 'gestor', 0]
  );

  // Criar usuário que precisa trocar senha
  const forceHash = await bcrypt.hash('temp123', 10);
  await db.run(
    'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
    ['Novo Usuário', 'novo@teste.com', forceHash, 'user', 1]
  );

  // Criar campanha de teste
  await db.run(
    'INSERT INTO campaigns (name, date, time, reference_month, number, template_enviado) VALUES (?, ?, ?, ?, ?, ?)',
    ['Campanha Teste Jan', '2026-01-15', '09:00', 'Janeiro', 1, 'Template de teste']
  );

  return db;
}

/**
 * Gera um token JWT válido para o papel especificado
 */
export function generateToken(role = 'admin', overrides = {}) {
  const users = {
    admin: { id: 1, name: 'Admin Teste', email: 'admin@teste.com', role: 'admin' },
    user: { id: 2, name: 'Usuário Teste', email: 'user@teste.com', role: 'user' },
    gestor: { id: 3, name: 'Gestor Teste', email: 'gestor@teste.com', role: 'gestor' },
  };

  const payload = { ...users[role], ...overrides };
  return jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
}

/**
 * Gera um token JWT expirado
 */
export function generateExpiredToken() {
  const payload = { id: 1, name: 'Admin', email: 'admin@teste.com', role: 'admin' };
  return jwt.sign(payload, jwtSecret, { expiresIn: '-1s' });
}

/**
 * Limpa todas as tabelas do banco
 */
export async function cleanupTestDB() {
  if (db) {
    await db.run('DELETE FROM campaign_summaries');
    await db.run('DELETE FROM campaigns');
    await db.run('DELETE FROM users');
    await db.run('DELETE FROM settings');
    await db.run('DELETE FROM sys_logs');
    await db.close();
  }
}

export { app, db };
