import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cron from 'node-cron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isTestEnv = process.env.NODE_ENV === 'test';

// --- Caminhos de dados ---
// O banco e os backups ficam no mesmo diretório persistente (ex.: volume /app/data no EasyPanel),
// assim os backups sobrevivem aos deploys e as cópias não cruzam sistemas de arquivos.
const DB_PATH = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite'));
const backupsDir = path.resolve(process.env.BACKUPS_PATH || path.join(path.dirname(DB_PATH), 'backups'));
const uploadsTmpDir = path.join(os.tmpdir(), 'report-ia-force-uploads');

for (const dir of [backupsDir, uploadsTmpDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DB_FILE_EXTENSIONS = ['.sqlite', '.sqlite3', '.db'];
const MAX_DB_UPLOAD_MB = Number(process.env.MAX_DB_UPLOAD_MB) || 200;

const upload = multer({
  dest: uploadsTmpDir,
  limits: { fileSize: MAX_DB_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!DB_FILE_EXTENSIONS.includes(ext)) {
      const err = new Error(`Extensão de arquivo não permitida. Use: ${DB_FILE_EXTENSIONS.join(', ')}`);
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  }
});

const app = express();
const port = process.env.PORT || 3005;

// Quantidade de proxies reversos confiáveis à frente do backend (Traefik do EasyPanel = 1).
// Necessário para obter o IP real do cliente (req.ip) no limite de tentativas de login e nos logs de acesso.
const parseTrustProxy = (value) => {
  if (value === undefined || value === '') return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
};
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

app.use(helmet());

// CORS: se CORS_ORIGIN estiver definido (lista separada por vírgula), apenas essas origens são aceitas.
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
if (corsOrigins.length === 0 && !isTestEnv) {
  console.warn('[Segurança] CORS_ORIGIN não definido: o backend aceitará requisições de qualquer origem.');
}
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : undefined));
app.use(express.json());

const HABLLA_API_URL = 'https://api.hablla.com';
const { WORKSPACE_ID_HABLLA, API_TOKEN_HABLLA, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

// ID do quadro padrão (IA Manutenção). Usuários não administradores só acessam este quadro.
const DEFAULT_BOARD_ID = process.env.BOARD_ID_HABLLA || '682251a6c5a42b757a5dbe79';
const HABLLA_ID_REGEX = /^[a-f0-9]{24}$/i;

// --- Validação de segredos obrigatórios ---
// Em produção a aplicação não sobe sem um JWT_SECRET forte, evitando um deploy mal configurado
// com uma chave previsível (qualquer pessoa poderia forjar um token de administrador).
const JWT_SECRET_MIN_LENGTH = 32;
const KNOWN_WEAK_SECRETS = ['secret123', 'chave_secreta_jwt_123', 'mock_secret', 'changeme', 'secret'];

const resolveJwtSecret = () => {
  if (isTestEnv) return JWT_SECRET || 'secret123';

  if (!JWT_SECRET) {
    console.error('[Segurança] JWT_SECRET não definido. Defina uma chave aleatória com no mínimo 32 caracteres. Encerrando.');
    process.exit(1);
  }
  if (JWT_SECRET.length < JWT_SECRET_MIN_LENGTH || KNOWN_WEAK_SECRETS.includes(JWT_SECRET)) {
    console.error(`[Segurança] JWT_SECRET fraco: use uma chave aleatória com no mínimo ${JWT_SECRET_MIN_LENGTH} caracteres. Encerrando.`);
    process.exit(1);
  }
  return JWT_SECRET;
};

const jwtSecret = resolveJwtSecret();
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN = '12h';

const VALID_ROLES = ['admin', 'gestor', 'user'];
const PASSWORD_MIN_LENGTH = 6;
const ADMIN_PASSWORD_MIN_LENGTH = 12;

// Log para verificar as variáveis de ambiente
console.log('Workspace ID:', WORKSPACE_ID_HABLLA ? 'Carregado' : 'Não encontrado');
console.log('API Token:', API_TOKEN_HABLLA ? 'Carregado' : 'Não encontrado');

// Resposta de erro padronizada: `code` permite identificar a causa exata, `message` é exibida ao usuário.
const sendError = (res, status, code, message, extra = {}) => res.status(status).json({ code, message, ...extra });

// Enquanto o banco é substituído (importação/restauração), as requisições recebem 503
// em vez de falharem com o banco fechado. A própria importação/restauração verifica a flag na rota.
let dbSwapInProgress = false;
app.use('/api', (req, res, next) => {
  if (dbSwapInProgress) {
    return sendError(res, 503, 'DB_MAINTENANCE', 'O banco de dados está sendo substituído. Tente novamente em alguns segundos.');
  }
  next();
});

// Monta o payload do token/usuário a partir do registro do banco.
// `tv` (token_version) é incrementado a cada troca/redefinição de senha, invalidando sessões antigas.
const buildUserPayload = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  theme: user.theme || 'dark',
  force_password_change: user.force_password_change === 1
});

const signUserToken = (user) =>
  jwt.sign({ ...buildUserPayload(user), tv: user.token_version || 0 }, jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN
  });

// Middleware de Autenticação
// O token só prova a identidade; papel, troca de senha obrigatória e validade da sessão
// são sempre conferidos no banco, então alterar o localStorage no navegador não concede acesso.
const authenticate = ({ allowPendingPasswordChange = false } = {}) => async (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || scheme !== 'Bearer') {
    return sendError(res, 401, 'TOKEN_MISSING', 'Token de autenticação não fornecido.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 401, 'TOKEN_EXPIRED', 'Sessão expirada. Por favor, faça login novamente.');
    }
    return sendError(res, 401, 'TOKEN_INVALID', 'Sessão inválida. Por favor, faça login novamente.');
  }

  try {
    const user = await db.get(
      'SELECT id, name, email, role, theme, force_password_change, token_version FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return sendError(res, 401, 'USER_NOT_FOUND', 'Usuário não encontrado ou removido. Faça login novamente.');
    }
    if ((decoded.tv || 0) !== (user.token_version || 0)) {
      return sendError(res, 401, 'SESSION_REVOKED', 'Sua senha foi alterada. Por favor, faça login novamente.');
    }

    req.user = buildUserPayload(user);

    if (req.user.force_password_change && !allowPendingPasswordChange) {
      return sendError(res, 403, 'PASSWORD_CHANGE_REQUIRED', 'É obrigatório trocar a senha antes de continuar.');
    }

    next();
  } catch (error) {
    console.error('Erro ao validar sessão:', error);
    return sendError(res, 500, 'AUTH_ERROR', 'Erro ao validar a sessão.');
  }
};

const authenticateToken = authenticate();

// Middleware de autorização por papel (admin, gestor, user)
const ROLE_LABELS = { admin: 'Administrador', gestor: 'Gestor', user: 'Analista' };
const authorizeRoles = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  const label = ROLE_LABELS[req.user?.role] || req.user?.role || 'desconhecido';
  return sendError(res, 403, 'FORBIDDEN_ROLE', `Acesso negado. O perfil ${label} não tem permissão para esta ação.`);
};

// Middleware para autorizar apenas administradores
const authorizeAdmin = authorizeRoles('admin');

// --- Limite de tentativas de login (no servidor, não depende do navegador) ---
// Bloqueia por combinação IP + e-mail e também por IP, para dificultar força bruta
// sem permitir que um atacante bloqueie a conta de outra pessoa a partir de outro IP.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS_PER_ACCOUNT = 5;
const LOGIN_MAX_FAILS_PER_IP = 20;
const loginAttempts = new Map();

const getAttempt = (key, now) => {
  const entry = loginAttempts.get(key);
  if (!entry || (entry.blockedUntil <= now && now - entry.firstFailAt > LOGIN_WINDOW_MS)) return null;
  return entry;
};

const registerLoginFailure = (key, maxFails, now) => {
  let entry = getAttempt(key, now);
  if (!entry || (entry.blockedUntil && entry.blockedUntil <= now)) {
    entry = { count: 0, firstFailAt: now, blockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= maxFails) entry.blockedUntil = now + LOGIN_WINDOW_MS;
  loginAttempts.set(key, entry);
  return entry;
};

const getLoginBlock = (keys, now) => {
  const blockedUntil = Math.max(0, ...keys.map(k => getAttempt(k, now)?.blockedUntil || 0));
  return blockedUntil > now ? blockedUntil : 0;
};

const resetLoginRateLimiter = () => loginAttempts.clear();

// Limpeza periódica para não acumular entradas em memória
setInterval(() => {
  const now = Date.now();
  for (const key of loginAttempts.keys()) {
    if (!getAttempt(key, now)) loginAttempts.delete(key);
  }
}, LOGIN_WINDOW_MS).unref();

// Hash fictício usado quando o e-mail não existe, para que o tempo de resposta
// não revele quais e-mails estão cadastrados.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

// Versão do backend (exibida para o administrador na tela de Configurações)
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;

// Rota de Teste de Status do Servidor
app.get('/test', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor backend do Report IA Force executando corretamente!' });
});

// Rota de Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return sendError(res, 400, 'MISSING_CREDENTIALS', 'E-mail e senha são obrigatórios.');
  }

  const now = Date.now();
  const ip = req.ip || 'unknown';
  const accountKey = `acct:${ip}|${email.trim().toLowerCase()}`;
  const ipKey = `ip:${ip}`;

  const blockedUntil = getLoginBlock([accountKey, ipKey], now);
  if (blockedUntil) {
    const retryAfterSeconds = Math.ceil((blockedUntil - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return sendError(res, 429, 'TOO_MANY_ATTEMPTS',
      `Muitas tentativas de login sem sucesso. Tente novamente em ${Math.ceil(retryAfterSeconds / 60)} minuto(s).`,
      { retryAfterSeconds });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    const passwordMatch = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatch) {
      const accountEntry = registerLoginFailure(accountKey, LOGIN_MAX_FAILS_PER_ACCOUNT, now);
      registerLoginFailure(ipKey, LOGIN_MAX_FAILS_PER_IP, now);

      const remaining = Math.max(0, LOGIN_MAX_FAILS_PER_ACCOUNT - accountEntry.count);
      let message = 'Credenciais inválidas.';
      if (remaining === 0) {
        message += ` Login bloqueado por ${LOGIN_WINDOW_MS / 60000} minutos.`;
      } else if (remaining <= 2) {
        message += ` Restam ${remaining} tentativa(s) antes do bloqueio temporário.`;
      }
      return sendError(res, 401, 'INVALID_CREDENTIALS', message, { remainingAttempts: remaining });
    }

    loginAttempts.delete(accountKey);

    let ipAddress = req.ip || req.socket?.remoteAddress || 'Desconhecido';
    if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
      ipAddress = '127.0.0.1 (Localhost)';
    }
    const userAgent = req.headers['user-agent'] || 'Desconhecido';

    try {
      await db.run(
        'INSERT INTO login_logs (user_id, user_email, user_name, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [user.id, user.email, user.name, ipAddress, userAgent]
      );
    } catch (logError) {
      console.error('Erro ao salvar log de login:', logError);
    }

    const token = signUserToken(user);
    res.status(200).json({ token, user: buildUserPayload(user) });
  } catch (error) {
    console.error('Erro de login:', error);
    sendError(res, 500, 'SERVER_ERROR', 'Erro no servidor.', { error: error.message });
  }
});

// --- SQLite Setup ---
let db;

// Função de inicialização do banco - exportada para uso em testes
const initializeDatabase = async (dbPath) => {
  db = await open({
    filename: dbPath || DB_PATH,
    driver: sqlite3.Database
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_name TEXT NOT NULL,
      board_id TEXT,
      board_name TEXT,
      date_range TEXT,
      total_clients INTEGER,
      total_phones INTEGER,
      total_hablla_responses INTEGER,
      sales_ia INTEGER,
      sales_manual INTEGER,
      not_received_msg INTEGER,
      total_cost TEXT,
      average_sold TEXT,
      response_rate TEXT,
      conversion_sales_clients TEXT,
      conversion_sales_responses TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_name, board_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      force_password_change INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Atualiza tabela antiga para adicionar coluna de tema, caso não exista
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'`);
  } catch (err) { }

  // Versão da sessão: incrementada ao trocar/redefinir senha para invalidar tokens antigos
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`);
  } catch (err) { }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT,
      time TEXT,
      reference_month TEXT,
      number INTEGER,
      template_enviado TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate template_enviado
  try {
    await db.exec(`ALTER TABLE campaigns ADD COLUMN template_enviado TEXT`);
    await db.exec(`UPDATE campaigns SET template_enviado = 'Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato' WHERE template_enviado IS NULL`);
  } catch (err) { }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sys_logs (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT,
      type TEXT,
      timestamp DATETIME,
      is_read INTEGER DEFAULT 0
    )
  `);

  // Detalhes técnicos (JSON) das notificações de sincronização
  try {
    await db.exec(`ALTER TABLE sys_logs ADD COLUMN details TEXT`);
  } catch (err) { }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT,
      user_name TEXT,
      ip_address TEXT,
      user_agent TEXT,
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
};

// Criação/recuperação do administrador via variáveis de ambiente.
// - Banco sem nenhum administrador: cria a conta ADMIN_EMAIL com ADMIN_PASSWORD (troca de senha obrigatória no 1º acesso).
// - ADMIN_RESET_PASSWORD=true: redefine a senha da conta ADMIN_EMAIL (uso pontual para recuperar acesso; remova depois).
// - Nos demais casos as variáveis são ignoradas, assim a senha escolhida pelo admin não é sobrescrita a cada reinício.
// Se não houver administrador e as variáveis não estiverem definidas, o servidor não sobe (nenhuma senha padrão é criada).
async function bootstrapAdmin() {
  const { count: adminCount } = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  const resetRequested = process.env.ADMIN_RESET_PASSWORD === 'true';
  const hasEnvCredentials = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

  if (hasEnvCredentials && (adminCount === 0 || resetRequested)) {
    if (ADMIN_PASSWORD.length < ADMIN_PASSWORD_MIN_LENGTH) {
      console.error(`[Segurança] ADMIN_PASSWORD deve ter no mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres. Conta administradora não foi criada/redefinida.`);
    } else {
      const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const existing = await db.get('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);

      if (existing) {
        await db.run(
          "UPDATE users SET password_hash = ?, role = 'admin', force_password_change = 1, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?",
          [adminHash, existing.id]
        );
        console.log(`[Segurança] Senha da conta administradora '${ADMIN_EMAIL}' redefinida via ADMIN_RESET_PASSWORD. Remova essa variável após o acesso.`);
      } else {
        await db.run(
          'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
          ['Admin do Sistema', ADMIN_EMAIL, adminHash, 'admin', 1]
        );
        console.log(`[Segurança] Conta administradora criada a partir das variáveis de ambiente: ${ADMIN_EMAIL}`);
      }
    }
  } else if (resetRequested && !hasEnvCredentials) {
    console.error('[Segurança] ADMIN_RESET_PASSWORD=true exige ADMIN_EMAIL e ADMIN_PASSWORD definidos.');
  }

  const { count: finalAdminCount } = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  if (finalAdminCount === 0) {
    console.error('[Segurança] Nenhum administrador cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) e reinicie. Encerrando.');
    process.exit(1);
  }
}

// Inicialização do servidor em produção (não roda em testes)
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      await initializeDatabase();
      await bootstrapAdmin();

      console.log('SQLite database initialized.');

      const server = app.listen(port, () => {
        console.log(`Servidor rodando na porta ${port}`);
        setupCronJob();
      });

      server.on('error', (err) => {
        console.error('Erro no servidor express:', err);
        process.exit(1);
      });

    } catch (error) {
      console.error('Failed to initialize SQLite:', error);
      process.exit(1);
    }
  })();
}

// --- Erros de sincronização ---
// Erro com código, mensagem resumida (exibida ao usuário) e detalhes técnicos (exibidos sob demanda).
// Os detalhes nunca incluem tokens ou credenciais.
class SyncError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.details = details;
  }
}

const HABLLA_REQUEST_TIMEOUT_MS = 30000;
const HABLLA_MAX_RETRIES = 3;
// A Hablla recusa páginas acima de ~200 ("Pagination too deep"): 200 páginas x 50 = 10.000 cards por consulta
const HABLLA_MAX_PAGES = 200;
const HABLLA_PAGE_LIMIT = 50;

const truncate = (text, max = 300) => {
  if (!text) return undefined;
  const str = String(text);
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

// Converte uma resposta HTTP de erro da Hablla em um SyncError com mensagem clara
const buildHabllaHttpError = (status, bodyText, ctx = {}) => {
  const details = { ...ctx, httpStatus: status, responseBody: truncate(bodyText) };

  if (/pagination too deep/i.test(bodyText || '')) {
    return new SyncError('HABLLA_PAGINATION_LIMIT',
      'A consulta passou do limite de 10.000 cards da Hablla.',
      { ...details, hint: 'Reduza o período ou divida a campanha em consultas menores.' });
  }
  // A Hablla responde token inválido também com HTTP 404 ("Invalid workspace token", errorCode 212)
  if (status === 401 || status === 403 || /invalid[\w\s]*token/i.test(bodyText || '')) {
    return new SyncError('HABLLA_AUTH',
      `A Hablla recusou o acesso (HTTP ${status}).`,
      { ...details, hint: 'Verifique as variáveis API_TOKEN_HABLLA e WORKSPACE_ID_HABLLA do backend.' });
  }
  if (status === 404) {
    return new SyncError('HABLLA_NOT_FOUND',
      'O recurso não foi encontrado na Hablla (HTTP 404).',
      { ...details, hint: 'Confira o ID do quadro (BOARD_ID_HABLLA) e do workspace.' });
  }
  if (status === 429) {
    return new SyncError('HABLLA_RATE_LIMIT',
      'A Hablla limitou o número de requisições (HTTP 429).',
      { ...details, hint: 'Aguarde alguns minutos e tente novamente.' });
  }
  if (status >= 500) {
    return new SyncError('HABLLA_SERVER_ERROR',
      `A Hablla está com instabilidade (HTTP ${status}).`,
      { ...details, hint: 'Erro no servidor da Hablla. Tente novamente mais tarde.' });
  }
  return new SyncError('HABLLA_BAD_REQUEST',
    `A Hablla rejeitou a consulta (HTTP ${status}).`,
    { ...details, hint: 'Verifique os filtros usados (datas, campanha, etiquetas).' });
};

// Converte falhas de rede/timeout em um SyncError
const buildHabllaNetworkError = (error, ctx = {}) => {
  const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  if (isTimeout) {
    return new SyncError('HABLLA_TIMEOUT',
      `A Hablla não respondeu em ${HABLLA_REQUEST_TIMEOUT_MS / 1000} segundos.`,
      { ...ctx, cause: error.message, hint: 'Tente novamente; se persistir, a Hablla pode estar fora do ar.' });
  }
  return new SyncError('HABLLA_UNREACHABLE',
    'Não foi possível conectar à Hablla.',
    { ...ctx, cause: error?.code || error?.message, hint: 'Verifique a conexão de rede do servidor e o status da Hablla.' });
};

const isRetriableHabllaError = (err) =>
  ['HABLLA_SERVER_ERROR', 'HABLLA_RATE_LIMIT', 'HABLLA_TIMEOUT', 'HABLLA_UNREACHABLE'].includes(err.code);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função de requisição HTTP usada nas chamadas à Hablla (substituível nos testes automatizados)
let habllaFetch = fetch;
const setHabllaFetchForTests = (fn) => { habllaFetch = fn || fetch; };

// Monta a URL da Hablla. Valores em lista viram parâmetros repetidos (ex.: tags=a&tags=b).
const buildHabllaUrl = (endpoint, queryParams = {}) => {
  const url = new URL(`${HABLLA_API_URL}${endpoint}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => {
        if (v) url.searchParams.append(key, v);
      });
    } else if (value) {
      url.searchParams.append(key, value);
    }
  });
  return url;
};

// Busca UMA página na Hablla, com tempo limite e novas tentativas. Devolve { results, totalPages }.
const fetchHabllaPage = async (endpoint, queryParams, page, extraCtx = {}) => {
  const url = buildHabllaUrl(endpoint, { ...queryParams, page });
  console.log(`Fetching URL: ${url}`);

  let attempt = 0;
  while (true) {
    attempt++;
    const ctx = { endpoint, page, attempts: attempt, ...extraCtx };
    try {
      let response;
      try {
        response = await habllaFetch(url, {
          headers: {
            'Authorization': API_TOKEN_HABLLA,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(HABLLA_REQUEST_TIMEOUT_MS),
        });
      } catch (networkError) {
        throw buildHabllaNetworkError(networkError, ctx);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`[Hablla] HTTP ${response.status} em ${endpoint} (página ${page}):`, truncate(errorBody));
        const httpError = buildHabllaHttpError(response.status, errorBody, ctx);
        if (httpError.code === 'HABLLA_RATE_LIMIT') {
          const retryAfter = Number(response.headers.get('retry-after'));
          httpError.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : null;
        }
        throw httpError;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new SyncError('HABLLA_INVALID_RESPONSE',
          'A Hablla devolveu uma resposta em formato inesperado.',
          { ...ctx, cause: parseError.message });
      }

      // Algumas rotas podem devolver a lista diretamente, sem paginação
      if (Array.isArray(data)) {
        data = { results: data, totalPages: 1 };
      }

      if (!Array.isArray(data?.results)) {
        throw new SyncError('HABLLA_INVALID_RESPONSE',
          'A Hablla devolveu uma resposta sem a lista de resultados.',
          { ...ctx, receivedKeys: data && typeof data === 'object' ? Object.keys(data).join(', ') : typeof data });
      }

      return { results: data.results, totalPages: Number(data.totalPages) || 1 };
    } catch (error) {
      if (isRetriableHabllaError(error) && attempt < HABLLA_MAX_RETRIES) {
        const waitMs = error.retryAfterMs || attempt * 1000;
        console.warn(`[Hablla] Tentativa ${attempt} falhou na página ${page} (${error.code}). Nova tentativa em ${waitMs}ms.`);
        await sleep(waitMs);
      } else {
        throw error;
      }
    }
  }
};

const paginationLimitError = (endpoint, totalPages, extra = {}) => new SyncError('HABLLA_PAGINATION_LIMIT',
  `A consulta tem cerca de ${(totalPages * HABLLA_PAGE_LIMIT).toLocaleString('pt-BR')} cards, acima do limite de 10.000 da Hablla.`,
  { endpoint, totalPages, maxPages: HABLLA_MAX_PAGES, hint: 'Reduza o período ou divida a campanha em consultas menores.', ...extra });

// Busca todas as páginas restantes a partir de uma 1ª página já obtida
const fetchRemainingPages = async (endpoint, queryParams, firstPage, extraCtx = {}) => {
  let results = [...firstPage.results];
  for (let page = 2; page <= firstPage.totalPages; page++) {
    const next = await fetchHabllaPage(endpoint, queryParams, page, { ...extraCtx, totalPages: firstPage.totalPages });
    results = results.concat(next.results);
  }
  return results;
};

// Busca todas as páginas de uma listagem (etiquetas, setores, listas...).
// A 1ª página informa o total: acima do limite da Hablla a consulta falha na hora.
const fetchHabllaAPI = async (endpoint, queryParams = {}) => {
  const firstPage = await fetchHabllaPage(endpoint, queryParams, 1);
  if (firstPage.totalPages > HABLLA_MAX_PAGES) {
    throw paginationLimitError(endpoint, firstPage.totalPages);
  }
  return fetchRemainingPages(endpoint, queryParams, firstPage);
};

// --- Busca de cards com divisão por período ---
// A Hablla não entrega mais de ~200 páginas (10.000 cards) por consulta, e a busca por campanha é por
// semelhança (ex.: "HB Refil Venc JUN25.04" também traz JUN25.01, JUL25.04...). Quando o resultado passa do
// limite, a consulta é dividida em janelas de data de criação (start_date/end_date/field_date=created_at),
// cada janela é dividida ao meio até caber no limite, e os resultados são unidos sem duplicados.
const CARDS_ENDPOINT = () => `/v3/workspaces/${WORKSPACE_ID_HABLLA}/cards`;
const MIN_WINDOW_MS = 60 * 60 * 1000; // janelas menores que 1 hora não são mais divididas
const MAX_SEGMENTED_REQUESTS = 2000; // proteção contra consultas excessivas à Hablla

// Data inicial padrão da divisão: criação do workspace (extraída do próprio ID, formato ObjectId)
const getDefaultCardsStartDate = () => {
  if (process.env.HABLLA_CARDS_START_DATE) {
    const configured = new Date(process.env.HABLLA_CARDS_START_DATE);
    if (!isNaN(configured.getTime())) return configured;
  }
  if (isValidHabllaId(WORKSPACE_ID_HABLLA || '')) {
    return new Date(parseInt(WORKSPACE_ID_HABLLA.slice(0, 8), 16) * 1000);
  }
  return new Date('2020-01-01T00:00:00.000Z');
};

const getCardId = (card) => card?.id || card?._id;

const dedupeCards = (cards) => {
  const seen = new Set();
  return cards.filter(card => {
    const id = getCardId(card);
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

// queryParams: filtros da Hablla (board, campaign, tags, source...).
// dateRange: { start, end } opcional (Date); quando informado, é sempre enviado como start_date/end_date.
const fetchHabllaCards = async (queryParams, dateRange = null) => {
  const endpoint = CARDS_ENDPOINT();
  const baseParams = { ...queryParams, limit: HABLLA_PAGE_LIMIT };
  const windowParams = (start, end) => ({
    ...baseParams,
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    field_date: 'created_at',
    // Ordenação estável durante a coleta, para não pular nem repetir cards entre páginas
    order: 'created_at',
    direction_order: 'asc',
  });

  // 1ª tentativa: consulta direta (com o período, se o usuário filtrou por data)
  const directParams = dateRange ? windowParams(dateRange.start, dateRange.end) : baseParams;
  const firstPage = await fetchHabllaPage(endpoint, directParams, 1);
  if (firstPage.totalPages <= HABLLA_MAX_PAGES) {
    return fetchRemainingPages(endpoint, directParams, firstPage);
  }

  // Acima do limite: divide o período em janelas
  const rootStart = dateRange ? dateRange.start : getDefaultCardsStartDate();
  const rootEnd = dateRange ? dateRange.end : new Date(Date.now() + 24 * 60 * 60 * 1000);
  console.warn(`[Hablla] ${firstPage.totalPages} páginas na consulta (limite ${HABLLA_MAX_PAGES}). Dividindo por período de ${rootStart.toISOString()} a ${rootEnd.toISOString()}.`);

  let requestCount = 1;
  const countRequests = (n) => {
    requestCount += n;
    if (requestCount > MAX_SEGMENTED_REQUESTS) {
      throw new SyncError('HABLLA_TOO_MANY_REQUESTS',
        `A consulta precisaria de mais de ${MAX_SEGMENTED_REQUESTS} requisições à Hablla e foi interrompida.`,
        { endpoint, hint: 'Use um filtro de período menor ou um nome de campanha mais específico.' });
    }
  };

  // Busca a 1ª página de uma janela
  const probeWindow = async (start, end) => {
    countRequests(1);
    const params = windowParams(start, end);
    const page = await fetchHabllaPage(endpoint, params, 1, { window: `${start.toISOString()} → ${end.toISOString()}` });
    return { start, end, params, page };
  };

  // Resolve uma janela: se couber no limite, busca as páginas; senão, divide ao meio
  const resolveWindow = async (win) => {
    if (win.page.totalPages <= HABLLA_MAX_PAGES) {
      countRequests(Math.max(0, win.page.totalPages - 1));
      return fetchRemainingPages(endpoint, win.params, win.page, { window: `${win.start.toISOString()} → ${win.end.toISOString()}` });
    }

    const span = win.end.getTime() - win.start.getTime();
    if (span <= MIN_WINDOW_MS) {
      throw paginationLimitError(endpoint, win.page.totalPages, {
        window: `${win.start.toISOString()} → ${win.end.toISOString()}`,
        hint: 'Há cards demais criados em menos de 1 hora. Use um nome de campanha mais específico.'
      });
    }

    const mid = new Date(win.start.getTime() + Math.floor(span / 2));
    const left = await probeWindow(win.start, mid);
    const right = await probeWindow(mid, win.end);

    // Se a Hablla ignorasse o filtro de data, as duas metades teriam o mesmo total da janela inteira
    if (left.page.totalPages + right.page.totalPages > win.page.totalPages * 1.5 + 1) {
      throw new SyncError('HABLLA_DATE_FILTER_IGNORED',
        'A Hablla não aplicou o filtro de data, então não foi possível dividir a consulta acima de 10.000 cards.',
        {
          endpoint, totalPages: win.page.totalPages, leftPages: left.page.totalPages, rightPages: right.page.totalPages,
          hint: 'Informe ao suporte técnico: os parâmetros start_date/end_date não foram aceitos pela Hablla.'
        });
    }

    const leftCards = await resolveWindow(left);
    const rightCards = await resolveWindow(right);
    return leftCards.concat(rightCards);
  };

  const root = await probeWindow(rootStart, rootEnd);
  const cards = dedupeCards(await resolveWindow(root));
  console.log(`[Hablla] Consulta dividida concluída: ${cards.length} cards em ${requestCount} requisições.`);
  return cards;
};

// --- Filtro de etiquetas ---
// A Hablla devolve cards com QUALQUER uma das etiquetas pedidas; a aplicação mantém só os que têm TODAS.
const MAX_TAGS_PER_REQUEST = 50;

const parseTagList = (tags) => {
  if (!tags) return [];
  const list = (Array.isArray(tags) ? tags : String(tags).split(','))
    .map(t => String(t).trim())
    .filter(Boolean);
  return [...new Set(list)];
};

const getCardTagIds = (card) => (card?.tags || []).map(t => (typeof t === 'string' ? t : (t?.id || t?._id))).filter(Boolean);

const filterCardsWithAllTags = (cards, requiredTagIds) => {
  if (!requiredTagIds || requiredTagIds.length === 0) return cards;
  return cards.filter(card => {
    const cardTags = new Set(getCardTagIds(card));
    return requiredTagIds.every(id => cardTags.has(id));
  });
};

// Converte as datas recebidas do frontend (ISO) em período { start, end } validado
const parseDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return { range: null };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: 'Período inválido: datas em formato não reconhecido.' };
  }
  if (start > end) {
    return { error: 'Período inválido: a data de início é posterior à data de fim.' };
  }
  return { range: { start, end } };
};

// Adiciona campanha/etapa ao erro e converte erros inesperados em SyncError
const withSyncContext = (error, context) => {
  if (error instanceof SyncError) {
    error.details = { ...context, ...error.details };
    return error;
  }
  return new SyncError('UNEXPECTED_ERROR', 'Erro inesperado durante a sincronização.', {
    ...context,
    cause: error?.message
  });
};

// Resposta HTTP padronizada para falhas de sincronização
const sendSyncError = (res, error, fallbackMessage) => {
  const syncError = withSyncContext(error, {});
  const status = syncError.code.startsWith('HABLLA_') ? 502 : 500;
  console.error(`[Sync] ${fallbackMessage}:`, syncError.code, syncError.message, syncError.details);
  return sendError(res, status, syncError.code, syncError.message, {
    details: { ...syncError.details, timestamp: new Date().toISOString() }
  });
};


// --- Helper: Calculate Summary ---
const calculateSummary = (cards, boardName) => {
  const campaignNames = [...new Set(cards.map(c => c.campaign).filter(Boolean))].join(', ') || 'N/A';

  const dates = cards.map(c => new Date(c.created_at).getTime());
  let dateRange = 'N/A';
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const minDateStr = minDate.toLocaleDateString('pt-BR');
    const maxDateStr = maxDate.toLocaleDateString('pt-BR');
    dateRange = minDateStr === maxDateStr ? minDateStr : `${minDateStr} - ${maxDateStr}`;
  }

  const totalClients = new Set(cards.map(c => c.name)).size;
  const totalPhones = cards.length;

  const totalHabllaResponses = cards.filter(c =>
    c.list !== "6852ca77894e7f357ac3ca09" &&
    c.list !== "68641e2511228ce80a6c7729"
  ).length;

  const salesIA = cards.filter(c =>
    c.tags?.some(t => t.name === "IA - Venda IA" || t.name === "IA - Venda Manual")
  ).length;

  const salesManual = cards.filter(c => c.tags?.some(t => t.name === "IA - Venda Operador")).length;

  const notReceivedMsg = cards.filter(c =>
    c.list === "6852ca77894e7f357ac3ca09" &&
    c.status?.toLowerCase() === 'lost' &&
    c.tags?.some(t => t.id === "689214de8385d506466c22ff")
  ).length;

  // Return raw numbers for easier aggregation later if needed, alongside formatted strings
  // But to keep it simple for now, we just recalculate in the aggregation step.
  const totalCostVal = (totalPhones - notReceivedMsg) * 0.1;
  const averageSoldVal = (salesIA + salesManual) * 149.9;
  const responseRateVal = totalClients > 0 ? (Number(totalHabllaResponses) / totalClients) * 100 : 0;
  const conversionSalesClientsVal = totalClients > 0 ? ((salesIA + salesManual) / totalClients) * 100 : 0;
  const conversionSalesResponsesVal = Number(totalHabllaResponses) > 0 ? ((salesIA + salesManual) / Number(totalHabllaResponses)) * 100 : 0;

  const formatCurrency = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatPercent = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

  return {
    board: boardName,
    campaignNames,
    dateRange,
    totalClients,
    totalPhones: String(totalPhones),
    totalRead: "(Dado não disponível)",
    totalDelivered: "(Dado não disponível)",
    totalHabllaResponses: String(totalHabllaResponses),
    salesIA,
    salesManual,
    notReceivedMsg,
    totalCost: formatCurrency(totalCostVal),
    averageSold: formatCurrency(averageSoldVal),
    responseRate: formatPercent(responseRateVal),
    conversionSalesClients: formatPercent(conversionSalesClientsVal),
    conversionSalesResponses: formatPercent(conversionSalesResponsesVal),
    // Hidden raw fields for aggregation
    _raw: {
      totalClients,
      totalPhones,
      totalHabllaResponses,
      salesIA,
      salesManual,
      notReceivedMsg
    }
  };
};

// --- Helper: Process Single Campaign (Fetch/Cache) ---
// O cache (campaign_summaries) guarda sempre o resultado COMPLETO da campanha, que alimenta o Dashboard.
// Consultas com filtros (período, fonte, etiquetas) são calculadas na hora e nunca gravadas no cache,
// para não substituir o total da campanha por um recorte parcial.
const DEFAULT_BOARD_NAME = 'IA Manutenção';

// filters: { dateRange?: {start, end}, source?: string, tags?: string[] }
const processCampaign = async (campaignName, boardId, boardName, filters = {}, forceRefresh = false) => {
  const { dateRange = null, tags: requiredTags = [], ...habllaFilters } = filters;
  const hasFilters = Boolean(dateRange) || requiredTags.length > 0 || Object.keys(habllaFilters).length > 0;
  const resolvedBoardName = boardName || (boardId === DEFAULT_BOARD_ID ? DEFAULT_BOARD_NAME : `Quadro ${boardId}`);
  const context = { campaign: campaignName, boardId };

  if (!forceRefresh && !hasFilters) {
    const cached = await db.get(
      'SELECT * FROM campaign_summaries WHERE campaign_name = ? AND board_id = ?',
      [campaignName, boardId]
    );

    if (cached) {
      console.log(`Returning cached summary for campaign: ${campaignName}`);
      return {
        board: cached.board_name,
        campaignNames: cached.campaign_name,
        dateRange: cached.date_range,
        totalClients: cached.total_clients,
        totalPhones: String(cached.total_phones),
        totalRead: "(Dado não disponível)",
        totalDelivered: "(Dado não disponível)",
        totalHabllaResponses: String(cached.total_hablla_responses),
        salesIA: cached.sales_ia,
        salesManual: cached.sales_manual,
        notReceivedMsg: cached.not_received_msg,
        totalCost: cached.total_cost,
        averageSold: cached.average_sold,
        responseRate: cached.response_rate,
        conversionSalesClients: cached.conversion_sales_clients,
        conversionSalesResponses: cached.conversion_sales_responses,
        lastUpdated: cached.last_updated,
        fromCache: true,
        _raw: {
          totalClients: cached.total_clients,
          totalPhones: cached.total_phones,
          totalHabllaResponses: cached.total_hablla_responses,
          salesIA: cached.sales_ia,
          salesManual: cached.sales_manual,
          notReceivedMsg: cached.not_received_msg
        }
      };
    }
  }

  console.log(`${hasFilters ? 'Filtered query' : (forceRefresh ? 'Refreshing' : 'Cache miss')} for campaign: ${campaignName}. Fetching from API...`);

  const queryParams = {
    board: boardId,
    campaign: campaignName,
    ...habllaFilters,
    ...(requiredTags.length > 0 ? { tags: requiredTags } : {})
  };

  let cards;
  try {
    cards = await fetchHabllaCards(queryParams, dateRange);
  } catch (error) {
    throw withSyncContext(error, { ...context, stage: 'Busca dos cards na Hablla' });
  }

  let summary;
  try {
    // A busca da Hablla é por semelhança: mantém só a campanha exata e, se houver, os cards com TODAS as etiquetas
    const filteredCards = filterCardsWithAllTags(cards.filter(c => c && c.campaign === campaignName), requiredTags);
    summary = calculateSummary(filteredCards, resolvedBoardName);
  } catch (error) {
    throw withSyncContext(error, { ...context, stage: 'Cálculo do resumo', cardsReceived: cards.length });
  }

  if (!hasFilters) {
    try {
      await db.run(
        `INSERT OR REPLACE INTO campaign_summaries (
          campaign_name, board_id, board_name, date_range, total_clients, total_phones,
          total_hablla_responses, sales_ia, sales_manual, not_received_msg,
          total_cost, average_sold, response_rate, conversion_sales_clients,
          conversion_sales_responses, last_updated
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [
          campaignName, boardId, summary.board, summary.dateRange,
          summary._raw.totalClients, summary._raw.totalPhones,
          summary._raw.totalHabllaResponses, summary._raw.salesIA,
          summary._raw.salesManual, summary._raw.notReceivedMsg,
          summary.totalCost, summary.averageSold, summary.responseRate,
          summary.conversionSalesClients, summary.conversionSalesResponses
        ]
      );
    } catch (error) {
      throw new SyncError('DB_WRITE_ERROR', 'Os dados foram obtidos, mas não puderam ser salvos no banco.', {
        ...context, stage: 'Gravação no banco de dados', cause: error.message
      });
    }
  }

  return {
    ...summary,
    lastUpdated: new Date().toISOString(),
    fromCache: false,
    filtered: hasFilters
  };
};


// --- Helper: Aggregate Summaries ---
const aggregateSummaries = (summaries) => {
  if (summaries.length === 0) return null;
  if (summaries.length === 1) return summaries[0];

  const aggregated = {
    board: summaries[0].board, // Assume same board
    campaignNames: summaries.map(s => s.campaignNames).join(', '),
    dateRange: summaries.map(s => s.dateRange).join(' | '), // Simplistic join
    _raw: {
      totalClients: 0,
      totalPhones: 0,
      totalHabllaResponses: 0,
      salesIA: 0,
      salesManual: 0,
      notReceivedMsg: 0
    }
  };

  // Sum raw values
  summaries.forEach(s => {
    // If _raw exists (newly generated), use it. If not (old cache), parse strings.
    // For safety, let's assume _raw is available because we updated calculateSummary.
    // If old cache doesn't have _raw, we might have an issue. 
    // To be safe, we parse if _raw is missing.
    const raw = s._raw || {
      totalClients: s.totalClients,
      totalPhones: Number(s.totalPhones),
      totalHabllaResponses: Number(s.totalHabllaResponses),
      salesIA: s.salesIA,
      salesManual: s.salesManual,
      notReceivedMsg: s.notReceivedMsg
    };

    aggregated._raw.totalClients += raw.totalClients;
    aggregated._raw.totalPhones += raw.totalPhones;
    aggregated._raw.totalHabllaResponses += raw.totalHabllaResponses;
    aggregated._raw.salesIA += raw.salesIA;
    aggregated._raw.salesManual += raw.salesManual;
    aggregated._raw.notReceivedMsg += raw.notReceivedMsg;
  });

  // Recalculate derived fields
  const totalCostVal = (aggregated._raw.totalPhones - aggregated._raw.notReceivedMsg) * 0.1;
  const averageSoldVal = (aggregated._raw.salesIA + aggregated._raw.salesManual) * 149.9;
  const responseRateVal = aggregated._raw.totalClients > 0 ? (aggregated._raw.totalHabllaResponses / aggregated._raw.totalClients) * 100 : 0;
  const conversionSalesClientsVal = aggregated._raw.totalClients > 0 ? ((aggregated._raw.salesIA + aggregated._raw.salesManual) / aggregated._raw.totalClients) * 100 : 0;
  const conversionSalesResponsesVal = aggregated._raw.totalHabllaResponses > 0 ? ((aggregated._raw.salesIA + aggregated._raw.salesManual) / aggregated._raw.totalHabllaResponses) * 100 : 0;

  const formatCurrency = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatPercent = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

  return {
    board: aggregated.board,
    campaignNames: aggregated.campaignNames,
    dateRange: aggregated.dateRange,
    totalClients: aggregated._raw.totalClients,
    totalPhones: String(aggregated._raw.totalPhones),
    totalRead: "(Dado não disponível)",
    totalDelivered: "(Dado não disponível)",
    totalHabllaResponses: String(aggregated._raw.totalHabllaResponses),
    salesIA: aggregated._raw.salesIA,
    salesManual: aggregated._raw.salesManual,
    notReceivedMsg: aggregated._raw.notReceivedMsg,
    totalCost: formatCurrency(totalCostVal),
    averageSold: formatCurrency(averageSoldVal),
    responseRate: formatPercent(responseRateVal),
    conversionSalesClients: formatPercent(conversionSalesClientsVal),
    conversionSalesResponses: formatPercent(conversionSalesResponsesVal),
    lastUpdated: summaries[0].lastUpdated, // Just pick one or finding the min/max?
    fromCache: summaries.every(s => s.fromCache)
  };
};


// --- Validação de parâmetros enviados à API da Hablla ---
// IDs de quadro entram no caminho da URL da Hablla; aceitar apenas o formato de ID evita que um usuário
// monte caminhos (ex.: "x/../../outro-endpoint") e acesse outros recursos com o token do servidor.
const isValidHabllaId = (value) => typeof value === 'string' && HABLLA_ID_REGEX.test(value);

const MAX_CAMPAIGNS_PER_REQUEST = 100;
const MAX_CAMPAIGN_NAME_LENGTH = 200;

const parseCampaignList = (campaign) => {
  if (typeof campaign !== 'string') return null;
  const list = campaign.split(',').map(c => c.trim()).filter(Boolean);
  if (list.length === 0 || list.length > MAX_CAMPAIGNS_PER_REQUEST) return null;
  if (list.some(c => c.length > MAX_CAMPAIGN_NAME_LENGTH)) return null;
  return list;
};

// Valida a lista de etiquetas (IDs da Hablla) enviada pelo frontend
const resolveTagFilter = (tags) => {
  const tagList = parseTagList(tags);
  if (tagList.length > MAX_TAGS_PER_REQUEST || tagList.some(t => !isValidHabllaId(t))) {
    return { error: { status: 400, code: 'INVALID_TAGS', message: `Etiquetas inválidas (máximo de ${MAX_TAGS_PER_REQUEST}).` } };
  }
  return { tagList };
};

// Administradores podem escolher quadro e filtros; demais perfis usam sempre o quadro padrão, sem filtros
// (espelha o que a interface permite para cada perfil). Analistas só consultam campanhas cadastradas.
const resolveSummaryRequest = async (req, params) => {
  const { campaign, board, boardName, startDate, endDate, source, tags } = params;
  const campaignList = parseCampaignList(campaign);
  if (!campaignList) {
    return { error: { status: 400, code: 'INVALID_CAMPAIGN', message: `Informe de 1 a ${MAX_CAMPAIGNS_PER_REQUEST} campanhas válidas.` } };
  }

  if (req.user.role === 'user') {
    const placeholders = campaignList.map(() => '?').join(',');
    const registered = await db.all(`SELECT name FROM campaigns WHERE TRIM(name) IN (${placeholders})`, campaignList);
    const registeredNames = new Set(registered.map(r => r.name.trim()));
    const notRegistered = campaignList.filter(c => !registeredNames.has(c));
    if (notRegistered.length > 0) {
      return {
        error: {
          status: 403, code: 'CAMPAIGN_NOT_REGISTERED',
          message: `Campanha não cadastrada: ${notRegistered.slice(0, 5).join(', ')}${notRegistered.length > 5 ? '…' : ''}. Solicite o cadastro a um administrador.`
        }
      };
    }
  }

  const isAdmin = req.user.role === 'admin';
  const boardId = isAdmin && board ? board : DEFAULT_BOARD_ID;
  if (!isValidHabllaId(boardId)) {
    return { error: { status: 400, code: 'INVALID_BOARD', message: 'ID de quadro inválido.' } };
  }

  const filters = {};
  if (isAdmin) {
    const { range, error: dateError } = parseDateRange(startDate, endDate);
    if (dateError) return { error: { status: 400, code: 'INVALID_DATE_RANGE', message: dateError } };
    if (range) filters.dateRange = range;

    if (source) filters.source = source;

    const { tagList, error: tagError } = resolveTagFilter(tags);
    if (tagError) return { error: tagError };
    if (tagList.length > 0) filters.tags = tagList;
  }

  return { campaignList, boardId, boardName: typeof boardName === 'string' ? boardName.slice(0, 100) : undefined, filters };
};

app.get('/api/cards', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    // O quadro 'IA Manutenção' é o padrão, mas permite que seja sobrescrito pela query
    const boardId = req.query.board || DEFAULT_BOARD_ID;
    if (!isValidHabllaId(boardId)) {
      return sendError(res, 400, 'INVALID_BOARD', 'ID de quadro inválido.');
    }
    const { tags, startDate, endDate, campaign, source } = req.query;

    const { range, error: dateError } = parseDateRange(startDate, endDate);
    if (dateError) return sendError(res, 400, 'INVALID_DATE_RANGE', dateError);

    const { tagList, error: tagError } = resolveTagFilter(tags);
    if (tagError) return sendError(res, tagError.status, tagError.code, tagError.message);

    const queryParams = {
      board: boardId,
      campaign,
      source,
      ...(tagList.length > 0 ? { tags: tagList } : {}),
    };
    const cards = await fetchHabllaCards(queryParams, range);
    // A Hablla devolve cards com qualquer uma das etiquetas; aqui ficam só os que têm todas
    res.status(200).json(filterCardsWithAllTags(cards, tagList));
  } catch (error) {
    sendSyncError(res, withSyncContext(error, { stage: 'Busca de cards na Hablla' }), 'Erro ao buscar cards');
  }
});

app.get('/api/tags', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/tags`);
    res.status(200).json(data);
  } catch (error) {
    sendSyncError(res, withSyncContext(error, { stage: 'Busca de etiquetas na Hablla' }), 'Erro ao buscar etiquetas');
  }
});

app.get('/api/sectors', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/sectors`);
    res.status(200).json(data);
  } catch (error) {
    sendSyncError(res, withSyncContext(error, { stage: 'Busca de setores na Hablla' }), 'Erro ao buscar setores');
  }
});

app.get('/api/lists', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const boardId = req.query.board || DEFAULT_BOARD_ID;
    if (!isValidHabllaId(boardId)) {
      return sendError(res, 400, 'INVALID_BOARD', 'ID de quadro inválido.');
    }
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/boards/${encodeURIComponent(boardId)}/lists`);
    res.status(200).json(data);
  } catch (error) {
    sendSyncError(res, withSyncContext(error, { stage: 'Busca de listas na Hablla' }), 'Erro ao buscar listas');
  }
});

// --- New Endpoints for Campaign Summary ---

app.get('/api/dashboard-data', authenticateToken, async (req, res) => {
  try {
    // Por enquanto o Dashboard considera apenas o quadro padrão (IA Manutenção)
    const data = await db.all('SELECT * FROM campaign_summaries WHERE board_id = ? ORDER BY last_updated DESC', [DEFAULT_BOARD_ID]);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
  }
});

// Get Summary (Cache-first) - Supports multiple campaigns (comma separated)
app.get('/api/campaign-summary', authenticateToken, async (req, res) => {
  if (!req.query.campaign) {
    return sendError(res, 400, 'INVALID_CAMPAIGN', 'Campaign name is required for summary.');
  }

  const resolved = await resolveSummaryRequest(req, req.query);
  if (resolved.error) {
    return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
  }
  const { campaignList, boardId, boardName, filters } = resolved;

  try {
    const summaries = [];
    for (const campName of campaignList) {
      const summary = await processCampaign(campName.trim(), boardId, boardName, filters, false);
      summaries.push(summary);
    }

    const finalSummary = aggregateSummaries(summaries);
    res.status(200).json(finalSummary);

  } catch (error) {
    sendSyncError(res, error, 'Erro ao gerar resumo da campanha');
  }
});

// Refresh Summary (Force Update) - Supports multiple campaigns
app.post('/api/campaign-summary/refresh', authenticateToken, authorizeRoles('admin', 'gestor'), async (req, res) => {
  if (!req.body?.campaign) {
    return sendError(res, 400, 'INVALID_CAMPAIGN', 'Campaign name is required.');
  }

  const resolved = await resolveSummaryRequest(req, req.body);
  if (resolved.error) {
    return sendError(res, resolved.error.status, resolved.error.code, resolved.error.message);
  }
  const { campaignList, boardId, boardName, filters } = resolved;

  try {
    const summaries = [];
    for (const campName of campaignList) {
      const summary = await processCampaign(campName.trim(), boardId, boardName, filters, true);
      summaries.push(summary);
    }

    const finalSummary = aggregateSummaries(summaries);
    res.status(200).json(finalSummary);

  } catch (error) {
    sendSyncError(res, error, 'Erro ao atualizar campanha');
  }
});

// --- Campaigns Administration Endpoints ---

app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const campaigns = await db.all('SELECT * FROM campaigns ORDER BY id DESC');
    // Mapear para o formato esperado pelo frontend (se for compativel com CampaignOption)
    const formattedCampaigns = campaigns.map(c => {
      const numStr = c.number < 10 ? `0${c.number}` : `${c.number}`;
      return {
        id: c.id,
        name: c.name,
        date: `${c.date} ${c.time}`,
        date_only: c.date,
        time_only: c.time,
        reference_month: c.reference_month,
        number: c.number,
        template_enviado: c.template_enviado || 'Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato',
        month: `D${numStr}-${c.reference_month.substring(0, 3)}` // ex: D01-Jan
      };
    });
    res.status(200).json(formattedCampaigns);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar campanhas', error: error.message });
  }
});

app.post('/api/campaigns', authenticateToken, authorizeAdmin, async (req, res) => {
  let { name, date, time, reference_month, number, template_enviado } = req.body;
  if (!name || !name.trim() || !reference_month) {
    return res.status(400).json({ message: 'O nome e o mês de referência são obrigatórios.' });
  }

  if (time && time.trim()) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      return res.status(400).json({ message: 'Formato de hora inválido (esperado HH:MM).' });
    }
  }

  try {
    if (!number) {
      const result = await db.get('SELECT COUNT(*) as count FROM campaigns WHERE reference_month = ?', [reference_month]);
      number = result.count + 1;
    }

    const { lastID } = await db.run(
      'INSERT INTO campaigns (name, date, time, reference_month, number, template_enviado) VALUES (?, ?, ?, ?, ?, ?)',
      [name, date, time, reference_month, number, template_enviado]
    );

    res.status(201).json({ message: 'Campanha criada com sucesso', id: lastID });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao criar campanha', error: error.message });
  }
});

app.put('/api/campaigns/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { name, date, time, reference_month, number, template_enviado } = req.body;
  if (!name || !name.trim() || !reference_month || !number) {
    return res.status(400).json({ message: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }

  if (time && time.trim()) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      return res.status(400).json({ message: 'Formato de hora inválido (esperado HH:MM).' });
    }
  }

  try {
    await db.run(
      'UPDATE campaigns SET name = ?, date = ?, time = ?, reference_month = ?, number = ?, template_enviado = ? WHERE id = ?',
      [name, date, time, reference_month, number, template_enviado, req.params.id]
    );
    res.status(200).json({ message: 'Campanha atualizada com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar campanha', error: error.message });
  }
});

app.delete('/api/campaigns/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Campanha excluída com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao excluir campanha', error: error.message });
  }
});

// --- User Management Endpoints ---

// Obter usuários (apenas Admin)
app.get('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, email, role, force_password_change, created_at FROM users');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar usuários', error: error.message });
  }
});

// Obter logs de login (apenas Admin)
app.get('/api/login-logs', authenticateToken, authorizeAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  try {
    const totalResult = await db.get('SELECT COUNT(*) as count FROM login_logs');
    const total = totalResult.count;
    const totalPages = Math.ceil(total / limit);

    const logs = await db.all('SELECT * FROM login_logs ORDER BY login_time DESC LIMIT ? OFFSET ?', [limit, offset]);
    res.status(200).json({ logs, totalPages, page, total });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar logs de login', error: error.message });
  }
});

// Adicionar um novo usuário (apenas Admin)
app.post('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
  const { name, email, password, role = 'user' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
  if (!VALID_ROLES.includes(role)) {
    return sendError(res, 400, 'INVALID_ROLE', `Perfil inválido. Valores aceitos: ${VALID_ROLES.join(', ')}.`);
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return sendError(res, 400, 'WEAK_PASSWORD', `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
  }

  try {
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, 1)',
      [name, email, hash, role]
    );

    res.status(201).json({ message: 'Usuário cadastrado com sucesso', id: result.lastID });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao cadastrar usuário', error: error.message });
  }
});

// Admin força a troca de senha (definição de nova senha temporária pelo admin)
app.put('/api/users/:id/reset-password', authenticateToken, authorizeAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Preencha a nova senha.' });
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return sendError(res, 400, 'WEAK_PASSWORD', `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    // Incrementar token_version encerra as sessões abertas do usuário
    await db.run(
      'UPDATE users SET password_hash = ?, force_password_change = 1, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
      [hash, req.params.id]
    );
    res.status(200).json({ message: 'Senha atualizada. O usuário será forçado a trocá-la no próximo acesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao resetar a senha', error: error.message });
  }
});

// Admin exclui um usuário
app.delete('/api/users/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ message: 'Você não pode excluir a sua própria conta.' });
  }
  try {
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.status(200).json({ message: 'Usuário removido com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar usuário', error: error.message });
  }
});

// --- Database Management Endpoints ---

const getLocalTimestamp = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

// Nomes de backup aceitos: apenas letras, números, ponto, hífen e sublinhado, com extensão de banco SQLite.
// Impede caminhos como "../index.js" (o Express decodifica %2F nos parâmetros da URL).
const BACKUP_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(sqlite|sqlite3|db)$/;

const resolveBackupPath = (filename) => {
  if (typeof filename !== 'string' || !BACKUP_NAME_REGEX.test(filename) || filename.includes('..')) return null;
  const resolved = path.resolve(backupsDir, filename);
  if (path.dirname(resolved) !== backupsDir) return null;
  return resolved;
};

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');
const REQUIRED_TABLES = ['users', 'campaign_summaries'];

// Valida se o arquivo é realmente um banco SQLite íntegro e compatível com o sistema,
// e não apenas um arquivo com a extensão esperada.
const validateDatabaseFile = async (filePath) => {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    if (bytesRead < header.length || !header.equals(SQLITE_HEADER)) {
      return { ok: false, reason: 'O arquivo enviado não é um banco de dados SQLite válido.' };
    }
  } catch (err) {
    return { ok: false, reason: 'Não foi possível ler o arquivo enviado.' };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  let candidate;
  try {
    candidate = await open({ filename: filePath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });

    const integrity = await candidate.get('PRAGMA quick_check');
    if (!integrity || Object.values(integrity)[0] !== 'ok') {
      return { ok: false, reason: 'O banco de dados enviado está corrompido.' };
    }

    const tables = (await candidate.all("SELECT name FROM sqlite_master WHERE type = 'table'")).map(t => t.name);
    const missing = REQUIRED_TABLES.filter(t => !tables.includes(t));
    if (missing.length > 0) {
      return { ok: false, reason: `O banco de dados não pertence a esta aplicação (tabelas ausentes: ${missing.join(', ')}).` };
    }

    // A aplicação não usa triggers; um banco com triggers pode executar SQL inesperado nas gravações.
    const { count: triggerCount } = await candidate.get("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'trigger'");
    if (triggerCount > 0) {
      return { ok: false, reason: 'O banco de dados contém triggers, que não são permitidos.' };
    }

    const userColumns = (await candidate.all('PRAGMA table_info(users)')).map(c => c.name);
    if (!['email', 'password_hash', 'role'].every(c => userColumns.includes(c))) {
      return { ok: false, reason: 'A tabela de usuários do banco enviado é incompatível.' };
    }

    const { count: adminCount } = await candidate.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    if (adminCount === 0) {
      return { ok: false, reason: 'O banco de dados não possui nenhum administrador; restaurá-lo bloquearia o acesso ao sistema.' };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'O arquivo enviado não é um banco de dados SQLite válido.' };
  } finally {
    if (candidate) await candidate.close().catch(() => { });
  }
};

// Substitui o banco atual por outro arquivo já validado.
// Usa cópia (e não rename) para funcionar mesmo entre volumes diferentes, guarda o banco atual em backups
// e, se algo falhar, volta ao banco anterior.
const swapDatabase = async (sourcePath) => {
  const safetyBackupPath = path.join(backupsDir, `database_${getLocalTimestamp()}.sqlite`);
  const hadCurrentDb = fs.existsSync(DB_PATH);

  if (db) await db.close();

  try {
    if (hadCurrentDb) fs.copyFileSync(DB_PATH, safetyBackupPath);
    fs.copyFileSync(sourcePath, DB_PATH);
    await initializeDatabase(DB_PATH);
  } catch (error) {
    console.error('Erro ao substituir o banco de dados, restaurando o anterior:', error);
    try {
      if (hadCurrentDb && fs.existsSync(safetyBackupPath)) fs.copyFileSync(safetyBackupPath, DB_PATH);
      await initializeDatabase(DB_PATH);
    } catch (restoreError) {
      console.error('Falha ao restaurar o banco anterior:', restoreError);
    }
    throw error;
  }
};

const removeTempFile = (filePath) => {
  if (filePath) fs.promises.unlink(filePath).catch(() => { });
};

app.get('/api/database/export', authenticateToken, authorizeAdmin, (req, res) => {
  if (fs.existsSync(DB_PATH)) {
    const nowStr = getLocalTimestamp();
    res.download(DB_PATH, `database_reportiaforce_${nowStr}.sqlite`);
  } else {
    sendError(res, 404, 'DB_NOT_FOUND', 'Arquivo do banco de dados não encontrado.');
  }
});

// Executa o upload do multer devolvendo erros de tamanho/extensão em formato padronizado
const handleDatabaseUpload = (req, res, next) => {
  upload.single('database')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, 'FILE_TOO_LARGE', `O arquivo excede o limite de ${MAX_DB_UPLOAD_MB} MB.`);
    }
    if (err.code === 'INVALID_FILE_TYPE') {
      return sendError(res, 400, 'INVALID_FILE_TYPE', err.message);
    }
    return sendError(res, 400, 'UPLOAD_ERROR', 'Falha no envio do arquivo.', { error: err.message });
  });
};

app.post('/api/database/import', authenticateToken, authorizeAdmin, handleDatabaseUpload, async (req, res) => {
  if (!req.file) {
    return sendError(res, 400, 'NO_FILE', 'Nenhum arquivo enviado.');
  }

  if (dbSwapInProgress) {
    removeTempFile(req.file.path);
    return sendError(res, 409, 'DB_SWAP_IN_PROGRESS', 'Já existe uma importação/restauração em andamento.');
  }

  dbSwapInProgress = true;
  try {
    const validation = await validateDatabaseFile(req.file.path);
    if (!validation.ok) {
      return sendError(res, 400, 'INVALID_DATABASE', validation.reason);
    }

    await swapDatabase(req.file.path);
    res.status(200).json({ message: 'Banco de dados importado com sucesso.' });
  } catch (error) {
    console.error('Erro ao importar banco de dados:', error);
    sendError(res, 500, 'DB_IMPORT_ERROR', 'Erro interno ao importar o banco.', { error: error.message });
  } finally {
    dbSwapInProgress = false;
    removeTempFile(req.file.path);
  }
});

// Listar todos os backups
app.get('/api/database/backups', authenticateToken, authorizeAdmin, (req, res) => {
  try {
    if (!fs.existsSync(backupsDir)) {
      return res.status(200).json([]);
    }
    const files = fs.readdirSync(backupsDir).filter(f => resolveBackupPath(f) !== null);
    const backups = files.map(file => {
      const stats = fs.statSync(path.join(backupsDir, file));
      return {
        filename: file,
        size: stats.size,
        createdAt: stats.birthtime || stats.mtime
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.status(200).json(backups);
  } catch (error) {
    console.error('Erro ao listar backups:', error);
    sendError(res, 500, 'BACKUP_LIST_ERROR', 'Erro interno ao listar backups.', { error: error.message });
  }
});

// Restaurar um backup especifico
app.post('/api/database/backups/:filename/restore', authenticateToken, authorizeAdmin, async (req, res) => {
  const backupFilePath = resolveBackupPath(req.params.filename);
  if (!backupFilePath) {
    return sendError(res, 400, 'INVALID_BACKUP_NAME', 'Nome de arquivo de backup inválido.');
  }
  if (!fs.existsSync(backupFilePath)) {
    return sendError(res, 404, 'BACKUP_NOT_FOUND', 'Arquivo de backup não encontrado.');
  }
  if (dbSwapInProgress) {
    return sendError(res, 409, 'DB_SWAP_IN_PROGRESS', 'Já existe uma importação/restauração em andamento.');
  }

  dbSwapInProgress = true;
  try {
    const validation = await validateDatabaseFile(backupFilePath);
    if (!validation.ok) {
      return sendError(res, 400, 'INVALID_DATABASE', validation.reason);
    }

    await swapDatabase(backupFilePath);
    res.status(200).json({ message: 'Backup restaurado com sucesso.' });
  } catch (error) {
    console.error('Erro ao restaurar backup:', error);
    sendError(res, 500, 'DB_RESTORE_ERROR', 'Erro interno ao restaurar o backup.', { error: error.message });
  } finally {
    dbSwapInProgress = false;
  }
});

// Excluir um backup especifico
app.delete('/api/database/backups/:filename', authenticateToken, authorizeAdmin, (req, res) => {
  const backupFilePath = resolveBackupPath(req.params.filename);
  if (!backupFilePath) {
    return sendError(res, 400, 'INVALID_BACKUP_NAME', 'Nome de arquivo de backup inválido.');
  }
  if (!fs.existsSync(backupFilePath)) {
    return sendError(res, 404, 'BACKUP_NOT_FOUND', 'Arquivo de backup não encontrado.');
  }

  try {
    fs.unlinkSync(backupFilePath);
    res.status(200).json({ message: 'Backup excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir backup:', error);
    sendError(res, 500, 'BACKUP_DELETE_ERROR', 'Erro interno ao excluir o backup.', { error: error.message });
  }
});

// --- Integração: envio do resumo de campanha para webhook externo (ex.: n8n → Telegram) ---
// Habilitada apenas quando WEBHOOK_REPORT_URL estiver definida. A chamada é feita pelo servidor,
// então a URL e o token opcional (WEBHOOK_REPORT_TOKEN) nunca chegam ao navegador.
const WEBHOOK_REPORT_URL = (() => {
  const raw = (process.env.WEBHOOK_REPORT_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocolo inválido');
    return url.toString();
  } catch (err) {
    console.error('[Webhook] WEBHOOK_REPORT_URL inválida; integração desabilitada.');
    return null;
  }
})();
const WEBHOOK_TIMEOUT_MS = 10000;
const WEBHOOK_FIELDS = [
  'board', 'campanha', 'dt_envio', 'total_clientes', 'total_tel', 'nao_receberam_mgs', 'total_lida',
  'total_entregue', 'total_respostas', 'venda_ia', 'venda_manual', 'mgs_enviada'
];

app.get('/api/version', authenticateToken, authorizeAdmin, (req, res) => {
  res.status(200).json({ version: APP_VERSION });
});

app.get('/api/integrations/webhook', authenticateToken, authorizeAdmin, (req, res) => {
  res.status(200).json({ enabled: Boolean(WEBHOOK_REPORT_URL) });
});

app.post('/api/integrations/webhook/report', authenticateToken, authorizeAdmin, async (req, res) => {
  if (!WEBHOOK_REPORT_URL) {
    return sendError(res, 503, 'WEBHOOK_DISABLED', 'O envio por webhook não está habilitado neste servidor.');
  }

  // Repassa apenas os campos conhecidos do resumo, com tamanho limitado
  const payload = { origem: 'report_ia_force' };
  for (const field of WEBHOOK_FIELDS) {
    const value = req.body?.[field];
    if (value === undefined || value === null) continue;
    payload[field] = typeof value === 'string' ? value.slice(0, 5000) : (typeof value === 'number' ? value : String(value).slice(0, 5000));
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.WEBHOOK_REPORT_TOKEN) headers['Authorization'] = `Bearer ${process.env.WEBHOOK_REPORT_TOKEN}`;

    const response = await fetch(WEBHOOK_REPORT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    });

    if (!response.ok) {
      console.error(`[Webhook] Resposta ${response.status} ao enviar resumo.`);
      return sendError(res, 502, 'WEBHOOK_FAILED', `O webhook respondeu com erro (${response.status}).`);
    }
    res.status(200).json({ message: 'Resumo enviado com sucesso.' });
  } catch (error) {
    console.error('[Webhook] Falha ao enviar resumo:', error.message);
    sendError(res, 502, 'WEBHOOK_UNREACHABLE', 'Não foi possível contatar o webhook configurado.');
  }
});


// --- Configurações / Cronjob Endpoints ---

let currentCronJobs = [];

const pushLog = async (title, message, type, details = null) => {
  const id = Math.random().toString(36).substring(7);
  try {
    await db.run(
      "INSERT INTO sys_logs (id, title, message, type, timestamp, is_read, details) VALUES (?, ?, ?, ?, datetime('now', 'localtime'), 0, ?)",
      [id, title, message, type, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Erro ao salvar log no banco:', err);
  }
};

const CRON_TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;
const CRON_TIMEZONE = process.env.TZ || 'America/Sao_Paulo';
const MAX_FAILURES_IN_LOG = 50;

// Atualiza todas as campanhas cadastradas e registra uma notificação com o resultado.
// Em caso de falha, a notificação traz um resumo e a lista de campanhas com o motivo de cada erro.
// Evita duas sincronizações simultâneas (ex.: horários próximos com uma execução ainda em andamento)
let syncInProgress = false;

const runScheduledSync = async (scheduledTime) => {
  if (syncInProgress) {
    console.warn(`[Cron] Sincronização das ${scheduledTime} ignorada: a anterior ainda está em andamento.`);
    await pushLog('Agendamento Automático (Ignorado)', `A sincronização das ${scheduledTime} não foi iniciada porque a anterior ainda estava em andamento.`, 'warning');
    return;
  }
  syncInProgress = true;
  try {
    await runScheduledSyncNow(scheduledTime);
  } finally {
    syncInProgress = false;
  }
};

const runScheduledSyncNow = async (scheduledTime) => {
  console.log('[Cron] Iniciando atualização de campanhas agendada...');
  const startedAt = new Date().toISOString();

  try {
    const campaigns = (await db.all('SELECT * FROM campaigns')).filter(c => c.name && c.name.trim());
    let updatedCount = 0;
    const failures = [];
    let abortReason = null;

    for (const camp of campaigns) {
      const campaignName = camp.name.trim();
      if (abortReason) {
        failures.push({ campaign: campaignName, code: 'SKIPPED', message: 'Não processada: a sincronização foi interrompida.' });
        continue;
      }
      try {
        await processCampaign(campaignName, DEFAULT_BOARD_ID, undefined, {}, true);
        updatedCount++;
      } catch (e) {
        const err = withSyncContext(e, { campaign: campaignName });
        console.error(`[Cron] Erro ao atualizar a campanha ${campaignName}:`, err.code, err.message, err.details);
        failures.push({ campaign: campaignName, code: err.code, message: err.message, details: err.details });
        // Erro de credencial afeta todas as campanhas: interrompe para não repetir chamadas inúteis
        if (err.code === 'HABLLA_AUTH') abortReason = err.message;
      }
    }

    if (failures.length > 0) {
      const failedCount = failures.filter(f => f.code !== 'SKIPPED').length;
      const skippedCount = failures.length - failedCount;
      const mainCause = failures.find(f => f.code !== 'SKIPPED')?.message || '';
      let message = `${updatedCount} de ${campaigns.length} campanhas atualizadas; ${failedCount} com erro`;
      if (skippedCount > 0) message += ` e ${skippedCount} não processadas`;
      message += `. Principal causa: ${mainCause} (Horário: ${scheduledTime}).`;

      await pushLog(
        updatedCount === 0 ? 'Agendamento Automático (Falhou)' : 'Agendamento Automático (Concluído com Alertas)',
        message,
        updatedCount === 0 ? 'error' : 'warning',
        { startedAt, scheduledTime, total: campaigns.length, updated: updatedCount, failures: failures.slice(0, MAX_FAILURES_IN_LOG) }
      );
    } else if (updatedCount > 0) {
      await pushLog('Agendamento Automático (Sucesso)', `As campanhas (${updatedCount}) foram sincronizadas corretamente às ${scheduledTime}.`, 'success');
    }
    console.log(`[Cron] Atualização concluída. ${updatedCount} campanhas atualizadas, ${failures.length} com falha (Horário agendado: ${scheduledTime}).`);
  } catch (error) {
    console.error('[Cron] Falha ao executar tarefa agendada:', error);
    await pushLog('Erro Crítico no Agendamento', `A sincronização agendada não pôde ser executada: ${error.message} (Horário: ${scheduledTime})`, 'error', {
      startedAt, scheduledTime, code: error.code || 'CRON_ERROR', cause: error.message
    });
  }
};

const setupCronJob = async () => {
  try {
    const row = await db.get('SELECT value FROM settings WHERE id = ?', ['cron_config']);
    const config = row ? JSON.parse(row.value) : { enabled: true, time: ['00:00'], frequency: '1x por dia' };
    
    currentCronJobs.forEach(job => job.stop());
    currentCronJobs = [];

    if (config.enabled && config.time) {
      let times = Array.isArray(config.time) ? config.time : [config.time];
      
      times.forEach(t => {
        if (!t) return;
        if (!CRON_TIME_REGEX.test(t)) {
          console.error(`[Cron] Horário inválido ignorado: "${t}" (esperado HH:MM).`);
          return;
        }
        const [hour, minute] = t.split(':').map(Number);
        const cronExpression = `${minute} ${hour} * * *`; // Roda diariamente no minuto e hora marcados
        
        console.log(`[Cron] Agendado para rodar às ${t} (${CRON_TIMEZONE}, frequência: ${config.frequency}).`);
        const job = cron.schedule(cronExpression, () => runScheduledSync(t), { timezone: CRON_TIMEZONE });
        currentCronJobs.push(job);
      });
    }
  } catch (error) {
    console.error('[Cron] Falha ao configurar a tarefa agendada:', error);
  }
};

app.get('/api/settings/cronjob', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const row = await db.get('SELECT value FROM settings WHERE id = ?', ['cron_config']);
    const config = row ? JSON.parse(row.value) : { enabled: true, time: ['00:00'], frequency: '1x por dia' };
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar configurações', error: error.message });
  }
});

app.post('/api/settings/cronjob', authenticateToken, authorizeAdmin, async (req, res) => {
  const { enabled, time, frequency } = req.body;
  
  if (!time) {
    return res.status(400).json({ message: 'O horário é obrigatório.' });
  }
  const timeList = Array.isArray(time) ? time : [time];
  const invalidTimes = timeList.filter(t => typeof t !== 'string' || !CRON_TIME_REGEX.test(t));
  if (invalidTimes.length > 0) {
    return sendError(res, 400, 'INVALID_CRON_TIME', `Horário inválido: ${invalidTimes.join(', ')} (use o formato HH:MM).`);
  }

  try {
    const config = JSON.stringify({ enabled: !!enabled, time, frequency: frequency || '1x por dia' });
    await db.run(
      'INSERT INTO settings (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      ['cron_config', config]
    );
    await setupCronJob(); // Reconfigura o cron com o novo horário
    res.status(200).json({ message: 'Configuração definida com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao salvar configuração', error: error.message });
  }
});

// Admin system logs/notifications
app.get('/api/sys-logs', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const logs = await db.all('SELECT * FROM sys_logs WHERE is_read = 0 ORDER BY timestamp DESC');
    res.status(200).json(logs.map(log => {
      let details = null;
      try { details = log.details ? JSON.parse(log.details) : null; } catch (e) { }
      return { ...log, details };
    }));
  } catch (error) {
    res.status(500).json([]);
  }
});

app.post('/api/sys-logs/mark-read', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0 && ids.length <= 500) {
      const placeholders = ids.map(() => '?').join(',');
      await db.run(`UPDATE sys_logs SET is_read = 1 WHERE id IN (${placeholders})`, ids);
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});
// Usuário escolhe a própria senha nova (forçado ou não).
// É a única rota de negócio liberada enquanto a troca de senha obrigatória estiver pendente.
app.post('/api/change-password', authenticate({ allowPendingPasswordChange: true }), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return sendError(res, 400, 'MISSING_PASSWORD', 'Ambas as senhas são exigidas.');
  if (typeof newPassword !== 'string' || newPassword.length < PASSWORD_MIN_LENGTH) {
    return sendError(res, 400, 'WEAK_PASSWORD', `A nova senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (newPassword === currentPassword) {
    return sendError(res, 400, 'PASSWORD_REUSED', 'A nova senha deve ser diferente da senha atual.');
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return sendError(res, 404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return sendError(res, 400, 'WRONG_CURRENT_PASSWORD', 'Senha atual não confere.');

    const hash = await bcrypt.hash(newPassword, 10);
    // Incrementar token_version encerra as outras sessões abertas com a senha antiga
    await db.run(
      'UPDATE users SET password_hash = ?, force_password_change = 0, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
      [hash, req.user.id]
    );

    const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const token = signUserToken(updatedUser);

    res.status(200).json({ message: 'Senha modificada com sucesso!', token, user: buildUserPayload(updatedUser) });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno.', error: error.message });
  }
});

// Atualiza o prefixo do tema do usuário (preferência visual, liberada mesmo com troca de senha pendente)
app.put('/api/users/theme', authenticate({ allowPendingPasswordChange: true }), async (req, res) => {
  const { theme } = req.body;
  if (!['light', 'dark', 'system'].includes(theme)) return res.status(400).json({ message: 'Tema inválido.' });

  try {
    await db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, req.user.id]);
    res.status(200).json({ message: 'Tema atualizado com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar tema:', error);
    res.status(500).json({ message: 'Erro no servidor.', error: error.message });
  }
});

// --- Exportações para testes ---
export {
  app, initializeDatabase, calculateSummary, aggregateSummaries, resetLoginRateLimiter, validateDatabaseFile, resolveBackupPath,
  SyncError, buildHabllaHttpError, buildHabllaNetworkError, withSyncContext, processCampaign,
  fetchHabllaCards, filterCardsWithAllTags, parseTagList, setHabllaFetchForTests
};