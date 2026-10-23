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

const fetchHabllaAPI = async (endpoint, queryParams = {}) => {
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

  let allResults = [];
  let page = 1;
  let totalPages = 1;

  do {
    url.searchParams.set('page', page);
    console.log(`Fetching URL: ${url}`);

    let attempt = 0;
    let success = false;
    const maxRetries = 3;

    while (attempt < maxRetries && !success) {
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': API_TOKEN_HABLLA,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          // Se for erro de servidor (5xx) ou Rate Limit (429), lança erro para cair no catch e tentar de novo
          if (response.status >= 500 || response.status === 429) {
            throw new Error(`Server error: ${response.status}`);
          }

          // Se for erro 4xx (exceto 429), é erro definitivo (ex: 400, 401), não adianta tentar de novo
          const errorBody = await response.text();
          console.error('API Error Body:', errorBody);
          throw new Error(`API request failed with status ${response.status}: ${errorBody} (Non-retriable)`);
        }

        const data = await response.json();
        allResults = allResults.concat(data.results);
        totalPages = data.totalPages;
        success = true; // Sai do loop de tentativas

      } catch (error) {
        attempt++;
        const isRetriable = error.message.includes('ECONNRESET') ||
          error.message.includes('socket hang up') ||
          error.message.includes('Server error') ||
          error.code === 'ECONNRESET';

        if (isRetriable && attempt < maxRetries) {
          console.warn(`Attempt ${attempt} failed for page ${page}. Retrying in 1s... Error: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Se esgotou as tentativas ou não é erro de rede, repassa o erro para parar o processo
          throw error;
        }
      }
    }

    page++;
  } while (page <= totalPages);

  return allResults;
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
const processCampaign = async (campaignName, boardId, boardName, filters, forceRefresh = false) => {
  if (!forceRefresh) {
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

  console.log(`${forceRefresh ? 'Refreshing' : 'Cache miss'} for campaign: ${campaignName}. Fetching from API...`);

  const queryParams = {
    board: boardId,
    limit: 50,
    campaign: campaignName,
    ...filters
  };

  const cards = await fetchHabllaAPI(`/v3/workspaces/${WORKSPACE_ID_HABLLA}/cards`, queryParams);
  const filteredCards = cards.filter(c => c.campaign === campaignName);
  const summary = calculateSummary(filteredCards, boardName || 'Unknown Board');

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

  return {
    ...summary,
    lastUpdated: new Date().toISOString(),
    fromCache: false
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

// Administradores podem escolher quadro e filtros; demais perfis usam sempre o quadro padrão, sem filtros
// (espelha o que a interface permite para cada perfil).
const resolveSummaryRequest = (req, params) => {
  const { campaign, board, boardName, startDate, endDate, source, tags } = params;
  const campaignList = parseCampaignList(campaign);
  if (!campaignList) {
    return { error: { status: 400, code: 'INVALID_CAMPAIGN', message: `Informe de 1 a ${MAX_CAMPAIGNS_PER_REQUEST} campanhas válidas.` } };
  }

  const isAdmin = req.user.role === 'admin';
  const boardId = isAdmin && board ? board : DEFAULT_BOARD_ID;
  if (!isValidHabllaId(boardId)) {
    return { error: { status: 400, code: 'INVALID_BOARD', message: 'ID de quadro inválido.' } };
  }

  const filters = {};
  if (isAdmin) {
    if (startDate && endDate) {
      filters.created_at = JSON.stringify({ start_date: startDate, end_date: endDate });
    }
    if (source) filters.source = source;
    if (tags) filters.tags = tags;
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
    const { tags, created_at, campaign, source } = req.query;
    const limit = 50;
    const queryParams = {
      board: boardId,
      tags,
      created_at,
      campaign,
      source,
      limit,
    };
    const data = await fetchHabllaAPI(`/v3/workspaces/${WORKSPACE_ID_HABLLA}/cards`, queryParams);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ message: 'Error fetching cards from Hablla API', error: error.message });
  }
});

app.get('/api/tags', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/tags`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Error fetching tags from Hablla API', error: error.message });
  }
});

app.get('/api/sectors', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/sectors`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching sectors:', error);
    res.status(500).json({ message: 'Error fetching sectors from Hablla API', error: error.message });
  }
});

app.get('/api/lists', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const boardId = req.query.board || DEFAULT_BOARD_ID;
    if (!isValidHabllaId(boardId)) {
      return sendError(res, 400, 'INVALID_BOARD', 'ID de quadro inválido.');
    }
    const data = await fetchHabllaAPI(`/v3/workspaces/${WORKSPACE_ID_HABLLA}/boards/${encodeURIComponent(boardId)}/lists`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ message: 'Error fetching lists from Hablla API', error: error.message });
  }
});

// --- New Endpoints for Campaign Summary ---

app.get('/api/dashboard-data', authenticateToken, async (req, res) => {
  try {
    const data = await db.all('SELECT * FROM campaign_summaries ORDER BY last_updated DESC');
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

  const resolved = resolveSummaryRequest(req, req.query);
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
    console.error('Error in campaign summary:', error);
    res.status(500).json({ message: 'Error generating summary', error: error.message });
  }
});

// Refresh Summary (Force Update) - Supports multiple campaigns
app.post('/api/campaign-summary/refresh', authenticateToken, authorizeRoles('admin', 'gestor'), async (req, res) => {
  if (!req.body?.campaign) {
    return sendError(res, 400, 'INVALID_CAMPAIGN', 'Campaign name is required.');
  }

  const resolved = resolveSummaryRequest(req, req.body);
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
    console.error('Error refreshing summary:', error);
    res.status(500).json({ message: 'Error refreshing summary', error: error.message });
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

const pushLog = async (title, message, type) => {
  const id = Math.random().toString(36).substring(7);
  try {
    await db.run(
      "INSERT INTO sys_logs (id, title, message, type, timestamp, is_read) VALUES (?, ?, ?, ?, datetime('now', 'localtime'), 0)",
      [id, title, message, type]
    );
  } catch (err) {
    console.error('Erro ao salvar log no banco:', err);
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
        const [hour, minute] = t.split(':');
        const cronExpression = `${minute} ${hour} * * *`; // Roda diarimente no minuto e hora marcados
        
        console.log(`[Cron] Agendado para rodar às ${t} (frequencia: ${config.frequency}).`);
        const job = cron.schedule(cronExpression, async () => {
          console.log('[Cron] Iniciando atualização de campanhas agendada...');
          try {
            const campaigns = await db.all('SELECT * FROM campaigns');
            let boardId = process.env.BOARD_ID_HABLLA;
            if (!boardId) {
              boardId = '682251a6c5a42b757a5dbe79'; // Fallback to IA Manutenção if missing
            }
            let updatedCount = 0;
            let errorCount = 0;
            for (const camp of campaigns) {
              if (camp.name) {
                try {
                  // Utilizando 'Desconhecido' ou 'Board Agendado' como boardName
                  await processCampaign(camp.name.trim(), boardId, 'Board Agendado', {}, true);
                  updatedCount++;
                } catch (e) {
                  console.error(`[Cron] Erro ao atualizar a campanha ${camp.name}:`, e.message);
                  errorCount++;
                }
              }
            }
            if (errorCount > 0) {
              await pushLog('Agendamento Automático (Concluído com Alertas)', `${updatedCount} campanhas atualizadas. ${errorCount} erros detalhadas no terminal. (Horário: ${t}).`, 'warning');
            } else if (updatedCount > 0) {
              await pushLog('Agendamento Automático (Sucesso)', `As campanhas (${updatedCount}) foram sincronizadas corretamente às ${t}.`, 'success');
            }
            console.log(`[Cron] Atualização concluída. ${updatedCount} campanhas atualizadas (Horário agendado: ${t}).`);
          } catch (error) {
            console.error('[Cron] Falha ao executar tarefa agendada:', error);
            await pushLog('Erro Crítico no Agendamento', `O cron falhou com o erro: ${error.message} (Horário: ${t})`, 'error');
          }
        });
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
    res.status(200).json(logs);
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
export { app, initializeDatabase, calculateSummary, aggregateSummaries, resetLoginRateLimiter, validateDatabaseFile, resolveBackupPath };