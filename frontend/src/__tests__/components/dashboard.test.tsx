/**
 * Testes de componente para Dashboard.
 * Testa: StatsCards, filtros, funil de vendas, tabela de campanhas e loading state.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from '@/components/dashboard';

// Mock do header
vi.mock('@/components/header', () => ({
  Header: ({ title }: any) => <div data-testid="header">{title}</div>,
}));

// Mock do config
vi.mock('@/lib/config', () => ({
  getBaseUrl: () => 'http://localhost:3005',
}));

// Mock do multi-select-campaign
vi.mock('@/components/ui/multi-select-campaign', () => ({
  MultiSelectCampaign: ({ selected, onChange }: any) => (
    <select data-testid="campaign-select" multiple value={selected} onChange={(e) => onChange([e.target.value])}>
      <option value="camp1">Camp 1</option>
    </select>
  ),
}));

const mockCampaignsData = [
  { name: 'Campanha Teste.01', date: '15/01/2026 09:00', month: 'D01-Jan', template_enviado: 'Template 1' },
  { name: 'Campanha Teste.02', date: '20/01/2026 10:00', month: 'D02-Jan', template_enviado: 'Template 2' },
  { name: 'Campanha Fev.01', date: '15/02/2026 08:00', month: 'D01-Fev', template_enviado: 'Template 3' },
] as any;

const mockDashboardData = [
  {
    id: 1, campaign_name: 'Campanha Teste.01', board_id: 'b1', board_name: 'Board',
    date_range: '15/01/2026', total_clients: 100, total_phones: 200,
    total_hablla_responses: 50, sales_ia: 10, sales_manual: 5,
    not_received_msg: 20, total_cost: 'R$ 18,00', average_sold: 'R$ 149,90',
    response_rate: '50%', conversion_sales_clients: '15,00',
    conversion_sales_responses: '20,00', last_updated: '2026-01-15'
  },
  {
    id: 2, campaign_name: 'Campanha Teste.02', board_id: 'b1', board_name: 'Board',
    date_range: '20/01/2026', total_clients: 80, total_phones: 160,
    total_hablla_responses: 40, sales_ia: 8, sales_manual: 3,
    not_received_msg: 15, total_cost: 'R$ 14,50', average_sold: 'R$ 149,90',
    response_rate: '50%', conversion_sales_clients: '13,75',
    conversion_sales_responses: '20,00', last_updated: '2026-01-20'
  },
  {
    id: 3, campaign_name: 'Campanha Fev.01', board_id: 'b1', board_name: 'Board',
    date_range: '15/02/2026', total_clients: 120, total_phones: 240,
    total_hablla_responses: 60, sales_ia: 15, sales_manual: 7,
    not_received_msg: 25, total_cost: 'R$ 21,50', average_sold: 'R$ 149,90',
    response_rate: '50%', conversion_sales_clients: '18,33',
    conversion_sales_responses: '25,00', last_updated: '2026-02-15'
  },
];

const defaultProps = {
  notifications: [],
  setNotifications: vi.fn(),
  user: { name: 'Admin', role: 'admin' },
  onLogout: vi.fn(),
  campaignsData: mockCampaignsData,
};

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock de localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => {
        if (key === 'token') return 'mock.eyJpZCI6MSwibmFtZSI6IkFkbWluIiwiZXhwIjo5OTk5OTk5OTk5fQ.test';
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  test('mostra "Carregando Dashboard..." durante loading', () => {
    // Mock fetch que não resolve (mantém loading)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Carregando Dashboard...')).toBeInTheDocument();
  });

  test('renderiza header com título "Dashboard"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('header')).toHaveTextContent('Dashboard');
    });
  });

  test('renderiza cards de estatísticas com dados corretos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      // Cards totais
      expect(screen.getByText('Valor Vendido')).toBeInTheDocument();
      expect(screen.getByText('Número de Vendas')).toBeInTheDocument();
      expect(screen.getByText('Ticket Médio')).toBeInTheDocument();
      expect(screen.getByText('Número de Clientes')).toBeInTheDocument();
      expect(screen.getByText('Custo Total')).toBeInTheDocument();
    });
  });

  test('renderiza funil de vendas com 3 níveis', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      // "Clientes" aparece tanto no funil quanto na tabela, por isso usamos getAllByText
      const clientesElements = screen.getAllByText('Clientes');
      expect(clientesElements.length).toBeGreaterThanOrEqual(2); // funil + tabela header
      
      // Respostas e Vendas são únicos ao funil / médias
      const respostasElements = screen.getAllByText('Respostas');
      expect(respostasElements.length).toBeGreaterThanOrEqual(1);
      
      expect(screen.getByText('Funil de Vendas')).toBeInTheDocument();
    });
  });

  test('renderiza total de vendas no funil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      // Total vendas = (10+5) + (8+3) + (15+7) = 48
      // "48" aparece tanto no StatsCard "Número de Vendas" quanto no funil
      const elements48 = screen.getAllByText('48');
      expect(elements48.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('renderiza seção de médias', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Médias das Campanhas Filtradas')).toBeInTheDocument();
      expect(screen.getByText('Média Conv. Vendas')).toBeInTheDocument();
      expect(screen.getByText('Média Conv. IA')).toBeInTheDocument();
      expect(screen.getByText('Média de Vendas')).toBeInTheDocument();
      expect(screen.getByText('Média de Faturamento')).toBeInTheDocument();
      expect(screen.getByText('Média de Custos')).toBeInTheDocument();
    });
  });

  test('renderiza tabela de campanhas com cabeçalhos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Campanhas')).toBeInTheDocument();
      expect(screen.getByText('Campanha')).toBeInTheDocument();
      expect(screen.getByText('Disparo/Mes')).toBeInTheDocument();
    });
  });

  test('renderiza nomes de campanhas na tabela', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Campanha Teste.01')).toBeInTheDocument();
      expect(screen.getByText('Campanha Teste.02')).toBeInTheDocument();
      expect(screen.getByText('Campanha Fev.01')).toBeInTheDocument();
    });
  });

  test('renderiza seletor de "Modo de Filtro"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Modo de Filtro')).toBeInTheDocument();
    });
  });

  test('exibe gráfico "Evolução de Vendas"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Evolução de Vendas')).toBeInTheDocument();
      expect(screen.getByText(/Desempenho por campanha/)).toBeInTheDocument();
    });
  });

  test('exibe card "Funil de Vendas"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockDashboardData),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Funil de Vendas')).toBeInTheDocument();
    });
  });

  test('filtra campanhas de mês "Não enviado"', async () => {
    const dataWithNotSent = [
      ...mockDashboardData,
      {
        id: 4, campaign_name: 'Campanha Descartada', board_id: 'b1', board_name: 'Board',
        date_range: '01/03/2026', total_clients: 50, total_phones: 100,
        total_hablla_responses: 25, sales_ia: 5, sales_manual: 2,
        not_received_msg: 10, total_cost: 'R$ 9,00', average_sold: 'R$ 149,90',
        response_rate: '50%', conversion_sales_clients: '14,00',
        conversion_sales_responses: '20,00', last_updated: '2026-03-01'
      },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataWithNotSent),
    }));

    const propsWithNotSent = {
      ...defaultProps,
      campaignsData: [
        ...mockCampaignsData,
        { name: 'Campanha Descartada', month: 'Não enviado', template_enviado: '' },
      ],
    };

    render(<Dashboard {...propsWithNotSent} />);

    await waitFor(() => {
      // A campanha "Não enviado" NÃO deve aparecer na tabela
      expect(screen.queryByText('Campanha Descartada')).not.toBeInTheDocument();
    });
  });

  test('lida com resposta vazia da API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    }));

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      // Não deve crashar, deve renderizar normalmente com 0s
      expect(screen.getByText('Valor Vendido')).toBeInTheDocument();
    });
  });
});
