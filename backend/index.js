import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

const HABLLA_API_URL = 'https://api.hablla.com';
const { WORKSPACE_ID_HABLLA, API_TOKEN_HABLLA } = process.env;

// Log para verificar as variáveis de ambiente
console.log('Workspace ID:', WORKSPACE_ID_HABLLA ? 'Carregado' : 'Não encontrado');
console.log('API Token:', API_TOKEN_HABLLA ? 'Carregado' : 'Não encontrado');

// --- SQLite Setup ---
let db;
(async () => {
  try {
    db = await open({
      filename: './database.sqlite',
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
    console.log('SQLite database initialized.');
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


app.get('/api/cards', async (req, res) => {
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

app.get('/api/tags', async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/tags`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Error fetching tags from Hablla API', error: error.message });
  }
});

app.get('/api/sectors', async (req, res) => {
  try {
    const data = await fetchHabllaAPI(`/v1/workspaces/${WORKSPACE_ID_HABLLA}/sectors`);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching sectors:', error);
    res.status(500).json({ message: 'Error fetching sectors from Hablla API', error: error.message });
  }
});

app.get('/api/lists', async (req, res) => {
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
app.get('/api/all-summaries', async (req, res) => {
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

app.get('/api/dashboard-data', async (req, res) => {
  try {
    const data = await db.all('SELECT * FROM campaign_summaries ORDER BY last_updated DESC');
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
  }
});

// Get Summary (Cache-first) - Supports multiple campaigns (comma separated)
app.get('/api/campaign-summary', async (req, res) => {
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
app.post('/api/campaign-summary/refresh', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});