import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const HABLLA_API_URL = 'https://api.hablla.com';
const { WORKSPACE_ID_HABLLA, API_TOKEN_HABLLA } = process.env;

// Log para verificar as variáveis de ambiente
console.log('Workspace ID:', WORKSPACE_ID_HABLLA ? 'Carregado' : 'Não encontrado');
console.log('API Token:', API_TOKEN_HABLLA ? 'Carregado' : 'Não encontrado');

const fetchHabllaAPI = async (endpoint, queryParams = {}) => {
  const url = new URL(`${HABLLA_API_URL}${endpoint}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value) {
      url.searchParams.append(key, value);
    }
  });

  let allResults = [];
  let page = 1;
  let totalPages = 1;

  do {
    url.searchParams.set('page', page);

    // Log da URL sendo chamada
    console.log(`Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': API_TOKEN_HABLLA,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('API Error Body:', errorBody);
      throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    allResults = allResults.concat(data.results);
    totalPages = data.totalPages;
    page++;
  } while (page <= totalPages);

  return allResults;
};

app.get('/api/cards', async (req, res) => {
  try {
    const { board, tags, created_at, campaign, source } = req.query;
    const queryParams = {
      board,
      tags,
      created_at,
      campaign,
      source,
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

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});