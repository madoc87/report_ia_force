import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
const port = process.env.PORT || 3005;

app.use(helmet());
app.use(cors());
app.use(express.json());

const HABLLA_API_URL = 'https://api.hablla.com';
const { WORKSPACE_ID_HABLLA, API_TOKEN_HABLLA, APP_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

const jwtSecret = JWT_SECRET || 'secret123';

// Log para verificar as variáveis de ambiente
console.log('Workspace ID:', WORKSPACE_ID_HABLLA ? 'Carregado' : 'Não encontrado');
console.log('API Token:', API_TOKEN_HABLLA ? 'Carregado' : 'Não encontrado');

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.status(401).json({ message: 'Token de autenticação não fornecido' });

  jwt.verify(token, jwtSecret, (err, decodedUser) => {
    if (err) return res.status(403).json({ message: 'Token de autenticação inválido' });
    req.user = decodedUser;
    next();
  });
};

// Middleware para autorizar apenas administradores
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Acesso negado. Apenas administradores podem realizar esta ação.' });
  }
};

// Rota de Teste de Status do Servidor
app.get('/test', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor backend do Report IA Force executando corretamente!' });
});

// Rota de Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ message: 'Credenciais inválidas.' });

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ message: 'Credenciais inválidas.' });

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      theme: user.theme || 'dark',
      force_password_change: user.force_password_change === 1
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '12h' });
    res.status(200).json({ token, user: payload });
  } catch (error) {
    console.error('Erro de login:', error);
    res.status(500).json({ message: 'Erro no servidor.', error: error.message });
  }
});

// --- SQLite Setup ---
let db;
(async () => {
  try {
    db = await open({
      filename: process.env.DATABASE_PATH || './database.sqlite',
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

    // User generation or recovery mechanism via .env
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);

      if (existingAdmin) {
        // Recover/Update password and role
        await db.run('UPDATE users SET password_hash = ?, role = "admin", force_password_change = 0 WHERE email = ?', [adminHash, ADMIN_EMAIL]);
        console.log(`[Segurança] Acesso Admin recuperado: A conta '${ADMIN_EMAIL}' foi detectada e redefinida com a senha contida no arquivo .env.`);
      } else {
        // Create new
        await db.run(
          'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
          ['Admin do Sistema', ADMIN_EMAIL, adminHash, 'admin', 0]
        );
        console.log(`[Segurança] Usuário Admin gerado a partir do arquivo .env: ${ADMIN_EMAIL}`);
      }
    } else {
      // Create default admin user if no users exist (fallback)
      const userCount = await db.get('SELECT COUNT(*) as count FROM users');
      if (userCount.count === 0) {
        const defaultPasswordHash = await bcrypt.hash(APP_PASSWORD || 'admin123', 10);
        await db.run(
          'INSERT INTO users (name, email, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, ?)',
          ['Admin', 'admin@mf.com', defaultPasswordHash, 'admin', 0]
        );
        console.log('Nenhuma conta .env detectada. Usuário admin gerado por padrão: admin@mf.com / admin123');
      }
    }

    console.log('SQLite database initialized.');

    // Start server after DB initialization
    const server = app.listen(port, () => {
      console.log(`Servidor rodando na porta ${port}`);
    });

    server.on('error', (err) => {
      console.error('Erro no servidor express:', err);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to initialize SQLite:', error);
  }
})();

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


app.get('/api/cards', authenticateToken, async (req, res) => {
  try {
    // O quadro 'IA Manutenção' é o padrão, mas permite que seja sobrescrito pela query
    const boardId = req.query.board || process.env.BOARD_ID_HABLLA;
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

app.get('/api/tags', authenticateToken, async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/tags`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Error fetching tags from Hablla API', error: error.message });
  }
});

app.get('/api/sectors', authenticateToken, async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/sectors`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching sectors:', error);
    res.status(500).json({ message: 'Error fetching sectors from Hablla API', error: error.message });
  }
});

app.get('/api/lists', authenticateToken, async (req, res) => {
  try {
    const boardId = req.query.board || process.env.BOARD_ID_HABLLA;
    const data = await fetchHabllaAPI(`/v3/workspaces/${WORKSPACE_ID_HABLLA}/boards/${boardId}/lists`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ message: 'Error fetching lists from Hablla API', error: error.message });
  }
});

// --- New Endpoints for Campaign Summary ---

// Get all summaries from database (for Dashboard)
app.get('/api/all-summaries', authenticateToken, async (req, res) => {
  try {
    const summaries = await db.all('SELECT * FROM campaign_summaries');
    const parsedSummaries = summaries.map(s => ({
      ...JSON.parse(s.summary_data),
      id: s.id,
      campaign_name: s.campaign_name,
      board_id: s.board_id,
      lastUpdated: s.last_updated
    }));
    res.status(200).json(parsedSummaries);
  } catch (error) {
    console.error('Error fetching all summaries:', error);
    res.status(500).json({ message: 'Error fetching summaries', error: error.message });
  }
});

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
  const { campaign, board, boardName, startDate, endDate, source, tags } = req.query;

  if (!campaign) {
    return res.status(400).json({ message: 'Campaign name is required for summary.' });
  }

  const boardId = board || process.env.BOARD_ID_HABLLA;
  const campaignList = campaign.split(',');

  // Filters for the fetch
  const filters = {};
  if (startDate && endDate) {
    filters.created_at = JSON.stringify({ start_date: startDate, end_date: endDate });
  }
  if (source) filters.source = source;
  if (tags) filters.tags = tags;

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
app.post('/api/campaign-summary/refresh', authenticateToken, async (req, res) => {
  const { campaign, board, boardName, startDate, endDate, source, tags } = req.body;

  if (!campaign) {
    return res.status(400).json({ message: 'Campaign name is required.' });
  }

  const boardId = board || process.env.BOARD_ID_HABLLA;
  const campaignList = campaign.split(',');

  const filters = {};
  if (startDate && endDate) {
    filters.created_at = JSON.stringify({ start_date: startDate, end_date: endDate });
  }
  if (source) filters.source = source;
  if (tags) filters.tags = tags;

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

// Adicionar um novo usuário (apenas Admin)
app.post('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
  const { name, email, password, role = 'user' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Todos os campos são obrigatórios' });

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

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET password_hash = ?, force_password_change = 1 WHERE id = ?', [hash, req.params.id]);
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

// Usuário escolhe a própria senha nova (forçado ou não)
app.post('/api/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Ambas as senhas são exigidas.' });

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Senha atual não confere.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?', [hash, req.user.id]);

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      force_password_change: false
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '12h' });

    res.status(200).json({ message: 'Senha modificada com sucesso!', token, user: payload });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno.', error: error.message });
  }
});

// Atualiza o prefixo do tema do usuário
app.put('/api/users/theme', authenticateToken, async (req, res) => {
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