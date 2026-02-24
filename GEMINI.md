# Report IA Force - Contexto do Projeto

## Visão Geral

**Report IA Force** é uma aplicação web full-stack desenvolvida para gerar relatórios de vendas de campanhas a partir de dados da API do CRM Hablla. A ferramenta permite filtrar e visualizar dados de vendas por quadro, data, campanha, fonte e etiquetas, oferecendo uma interface moderna (Dark/Light mode) para análise de performance.

### Arquitetura
O projeto é dividido em dois sub-projetos principais:
- **Frontend (`/frontend`):** Single Page Application (SPA) construída com Vite, React, TypeScript e Tailwind CSS.
- **Backend (`/backend`):** API RESTful simples construída com Node.js e Express que atua como proxy para a API da Hablla, gerenciando autenticação e paginação.

## Estrutura de Diretórios

```
/
├── backend/                # Servidor Node.js/Express
│   ├── index.js            # Ponto de entrada da API (Proxy)
│   ├── .env.example        # Modelo de variáveis de ambiente
│   └── package.json        # Dependências do backend
├── frontend/               # Aplicação React/Vite
│   ├── src/
│   │   ├── components/     # Componentes React (UI e funcionais)
│   │   ├── lib/            # Utilitários
│   │   ├── App.tsx         # Componente principal e lógica de estado
│   │   └── main.tsx        # Ponto de entrada do React
│   ├── vite.config.ts      # Configuração do Vite
│   └── package.json        # Dependências do frontend
├── README.md               # Documentação geral do projeto
└── GEMINI.md               # Contexto para Agente IA (este arquivo)
```

## Configuração e Execução

### Pré-requisitos
- Node.js (versão LTS recomendada)
- NPM ou Yarn

### 1. Backend
O backend deve estar rodando para que o frontend funcione corretamente (porta padrão: 3005).

**Instalação:**
```bash
cd backend
npm install
```

**Configuração (.env):**
Crie um arquivo `.env` na pasta `backend/` com as seguintes chaves (baseado em `.env.example`):
```env
PORT=3005
WORKSPACE_ID_HABLLA=...
API_TOKEN_HABLLA=...
BOARD_ID_HABLLA=...
```

**Execução:**
```bash
npm run dev
# O servidor iniciará em http://localhost:3005
```

### 2. Frontend
O frontend roda em modo de desenvolvimento com Vite (porta padrão: 5177).

**Instalação:**
```bash
cd frontend
npm install
```

**Execução:**
```bash
npm run dev
# A aplicação estará disponível em http://localhost:5177
```

**Build de Produção:**
```bash
npm run build
```

## Convenções de Desenvolvimento

- **Estilização:** O projeto utiliza **Tailwind CSS**. Novos componentes devem seguir esse padrão utilitário.
- **Componentes UI:** Utiliza componentes baseados em **Radix UI** (provavelmente shadcn/ui), localizados em `frontend/src/components/ui`.
- **Gerenciamento de Estado:** O estado da aplicação é gerenciado principalmente localmente no `App.tsx` usando `useState` e `useEffect`.
- **Comunicação API:**
    - O Frontend faz chamadas para o Backend (ex: `http://localhost:3005/api/cards`).
    - O Backend faz chamadas para a API externa da Hablla (`https://api.hablla.com`).
    - O Backend lida com a paginação da API externa automaticamente.
- **Tipagem:** TypeScript é utilizado estritamente no frontend. Interfaces para os dados da API (ex: `ReportCard`, `Sector`, `CampaignSummary`) estão definidas no `App.tsx`.

## Detalhes da API Interna (Backend)

- `GET /api/cards`: Busca cartões com filtros (board, tags, data, campanha, fonte).
- `GET /api/tags`: Lista todas as etiquetas disponíveis.
- `GET /api/sectors`: Lista todos os setores.
- `GET /api/lists`: Lista as colunas/listas de um quadro específico.

## Notas Importantes
- O backend atua como um proxy para contornar problemas de CORS e proteger o Token da API da Hablla.
- A lógica de "Venda IA" vs "Venda Manual" é baseada na presença de etiquetas específicas nos cartões.
