import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox, Tag } from '@/components/ui/multi-select-combobox';
import { MultiSelectCampaign } from '@/components/ui/multi-select-campaign';
import { DatePicker } from '@/components/ui/date-picker';
import { useTheme } from '@/components/theme-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DOMPurify from 'dompurify';
import {
  ClipboardCopy, Check, BarChartBig, CalendarDays, CircleUserRound, Phone, MessageCircleMore,
  Bot, UserRound, Mails, Webhook, Presentation, CircleX,
  DollarSign, TrendingUp, Percent, PieChart, RotateCcw, RefreshCw
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sidebar } from '@/components/sidebar';
import { Dashboard } from '@/components/dashboard';
import { Header } from '@/components/header';
import { CampaignOption } from '@/components/ui/multi-select-campaign';
import { Login } from '@/components/login';
import { ChangePassword } from '@/components/change-password';
import { Settings } from '@/components/settings';

// Definição de Tipos para os dados da API
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
}

interface ReportCard {
  id: string;
  name: string;
  campaign: string;
  source: string;
  created_at: string;
  tags: { id: string; name: string }[];
  list: string;
  moves: any[];
  user?: string;
  status?: string;
  loss_reason?: string;
  finish_reason?: string;
  close_reason?: string;
}

const boards = [
  { id: "682251a6c5a42b757a5dbe79", name: "IA Manutenção" },
  { id: "68c42f9c626dd84e960cc92b", name: "Digital" },
  { id: "681fd53d454440210d383433", name: "Assistência Técnica" },
  { id: "682cbfd0b7a2255a8de33d90", name: "DEMANDAS MARKETING" },
  { id: "67e69469e61a2499d84a4e65", name: "Inside Sales" },
  { id: "6862f617232cdd6b69cfe545", name: "Lojas" },
  { id: "6825d919b5c101953b6b67be", name: "Projetos e Tarefas | Por Departamento" },
  { id: "67ed27b22f1b8a5a02c348c2", name: "Televendas PF" },
  { id: "685c24cca0784d79c539af00", name: "Televendas PJ" },
];

interface CampaignSummary {
  board: string;
  campaignNames: string;
  dateRange: string;
  totalClients: number;
  totalPhones: string;
  totalRead: string;
  totalDelivered: string;
  totalHabllaResponses: string;
  salesIA: number;
  salesManual: number;
  notReceivedMsg: number;
  totalCost: string;
  averageSold: string;
  responseRate: string;
  conversionSalesClients: string;
  conversionSalesResponses: string;
  lastUpdated?: string;
}

function App() {
  const [reportData, setReportData] = useState<ReportCard[] | null>(null);
  const [cardList, setCardList] = useState<ReportCard[] | null>(null);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  // const [sectors, setSectors] = useState<Sector[]>([]);
  // const [lists, setLists] = useState<List[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState('');
  const [campaignsData, setCampaignsData] = useState<CampaignOption[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(() => {
    const savedUser = localStorage.getItem('user');
    const parsedUser = savedUser ? JSON.parse(savedUser) : null;
    return parsedUser?.role === 'user' ? 'dashboard' : 'relatorios';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (token && user && user.theme && user.theme !== theme) {
      // Evitar sobrescrever o tema do usuário logo após o login se o setTheme ainda estiver processando.
      // Damos prioridade à mudança originada do clique do usuário:
      const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (savedUser.theme === theme) return; // Se for igual não precisa API

      apiFetch('http://localhost:3005/api/users/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme })
      }).then(() => {
        const updatedUser = { ...user, theme };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }).catch(err => console.error('Error saving theme', err));
    }
  }, [theme]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (window.location.pathname === '/logout') {
      handleLogout();
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Custom fetch wrapper para injetar o token e tratar expirações (401/403)
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const currentToken = localStorage.getItem('token');
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      handleLogout();
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }

    return response;
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Estados para os filtros
  const [selectedBoard, setSelectedBoard] = useState<string>(boards[0].id); // Padrão: IA Manutenção
  // const [startDate, setStartDate] = useState<Date | undefined>();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchEmptyCampaign, setSearchEmptyCampaign] = useState(false);

  useEffect(() => {
    if (!token) return; // Prevent fetching while not authenticated

    const fetchData = async () => {
      try {
        const tagsResponse = await apiFetch('http://localhost:3005/api/tags');
        if (!tagsResponse.ok) {
          throw new Error('Falha de autorização ou erro no servidor ao buscar tags.');
        }
        const tagsData: Tag[] = await tagsResponse.json();
        if (Array.isArray(tagsData)) {
          setTags(tagsData);
        } else if ((tagsData as any).results && Array.isArray((tagsData as any).results)) {
          setTags((tagsData as any).results);
        }

        const campaignsResponse = await apiFetch('http://localhost:3005/api/campaigns');
        if (campaignsResponse.ok) {
          const campaignsDataJson = await campaignsResponse.json();
          setCampaignsData(campaignsDataJson);
        }
      } catch (error) {
        setError('Falha ao buscar dados do servidor. Verifique se o servidor está rodando.');
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [token]);

  // Efeito para buscar listas quando o quadro mudar
  /*
  useEffect(() => {
    const fetchLists = async () => {
      try {
        const response = await fetch(`http://localhost:3005/api/lists?board=${selectedBoard}`);
        if (response.ok) {
          const data = await response.json();
          // A API retorna um array de listas dentro de 'results' ou diretamente?
          // Baseado no padrão anterior, provavelmente 'results'.
          // Mas como não vi a resposta, vou assumir 'results' se existir, ou o próprio data.
          // Ajuste conforme o retorno real da API.
          setLists(Array.isArray(data) ? data : data.results || []);
        } else {
          console.error('Falha ao buscar listas');
        }
      } catch (error) {
        console.error('Erro ao buscar listas:', error);
      }
    };

    if (selectedBoard) {
      fetchLists();
    }
  }, [selectedBoard]);
  */




  // Efeito para pré-selecionar as tags por padrão ao abrir o relatorio
  // useEffect(() => {
  //   if (tags.length > 0 && !defaultsSet) {
  //     const defaultTagNames = ["IA - Venda IA", "IA - Venda Manual", "IA - Venda Operador"];
  //     const defaultTags = tags.filter(tag => defaultTagNames.includes(tag.name));
  //     if (defaultTags.length > 0) {
  //       setSelectedTags(defaultTags.map(tag => tag.id));
  //       setDefaultsSet(true);
  //     }
  //   }
  // }, [tags, defaultsSet]);





  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingDots((dots) => (dots.length < 3 ? dots + '.' : ''));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const performSearch = async () => {
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new Error('Para filtrar por data, é necessário selecionar a Data de Início e a Data de Fim.');
    }

    const baseUrl = 'http://localhost:3005/api/cards';
    const params = new URLSearchParams();
    params.append('board', selectedBoard);

    if (startDate && endDate) {
      const createdAt = {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };
      params.append('created_at', JSON.stringify(createdAt));
    }

    // Otimização: Enviamos o nome da campanha como query param se apenas uma estiver selecionada.
    // Isso reduz drasticamente o volume de dados retornados pela API da Hablla.
    // Como a API retorna por semelhança, a filtragem exata continua sendo feita no frontend.
    if (!searchEmptyCampaign && selectedCampaigns.length === 1) {
      params.append('campaign', selectedCampaigns[0]);
    }

    if (source) params.append('source', source); if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));

    const response = await apiFetch(`${baseUrl}?${params.toString()}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Falha na busca por cartões.');
    }
    return response.json();
  };

  const handleGenerateReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setReportData(null);
    setCardList(null);
    setCampaignSummary(null);

    try {
      let results: ReportCard[] = await performSearch();
      if (searchEmptyCampaign) {
        results = results.filter(card => !card.campaign);
      } else if (selectedCampaigns.length > 0) {
        results = results.filter(card => selectedCampaigns.includes(card.campaign));
      }
      setReportData(results);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindCardsClick = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setReportData(null);
    setCardList(null);
    setCampaignSummary(null);

    try {
      let results: ReportCard[] = await performSearch();
      if (searchEmptyCampaign) {
        results = results.filter(card => !card.campaign);
      } else if (selectedCampaigns.length > 0) {
        results = results.filter(card => selectedCampaigns.includes(card.campaign));
      }
      setCardList(results);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!campaignSummary) return;

    const summaryText = `${/* Para comentar dentro da backticks pode se fazer dessa forma */''}
${/*🗂️ Quadro: ${campaignSummary.board}*/''}
📊 Campanha: ${campaignSummary.campaignNames}
📆 Dt. Envio: ${campaignSummary.dateRange}
👤 Total de clientes: ${campaignSummary.totalClients}
📞 Total de telefones: ${campaignSummary.totalPhones}
❌ Não receberam mgs: ${campaignSummary.notReceivedMsg}
`
      //📩 *Total Lida:* ${campaignSummary.totalRead}
      //📖 *Total Entregue:* ${campaignSummary.totalDelivered}
      + `
💬 Total de Respostas: ${campaignSummary.totalHabllaResponses}\n`

      // * WhatsApp: (Dado não disponível)
      // * Ligação: (Dado não disponível)
      // * Não quero contato: (Dado não disponível)
      + ` 
🤖 Venda IA: ${campaignSummary.salesIA}
👨‍💻 Venda Manual: ${campaignSummary.salesManual}
💰 Custo Total: ${campaignSummary.totalCost}
📈 Média vendido: ${campaignSummary.averageSold}
📊 Respostas (Respostas/Clientes): ${campaignSummary.responseRate}
📉 Conversão (Vendas/Clientes): ${campaignSummary.conversionSalesClients}
🥧 Conversão (Vendas/Respostas): ${campaignSummary.conversionSalesResponses}
`;
    // Add dynamic templates
    const agrupados = templatesAgrupados();
    let templatesText = '';
    agrupados.forEach((item) => {
      if (agrupados.length > 1) {
        templatesText += `\n[Mensagem das campanhas: ${item.campanhas}]\n`;
      } else {
        templatesText += `\n[Mensagem enviada]\n`;
      }
      templatesText += `${item.template.replace(/ {2,}/g, '\n\n')}\n`;
    });

    const finalSummaryText = (summaryText + '\n' + templatesText).trim();

    navigator.clipboard.writeText(finalSummaryText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // O ícone de "copiado" volta ao normal após 2 segundos
    });
  };

  const handleGenerateCampaignSummary = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setReportData(null);
    setCardList(null);
    setCampaignSummary(null);

    if (selectedCampaigns.length === 0) {
      setError('Selecione ao menos uma campanha para gerar o resumo.');
      setIsLoading(false);
      return;
    }

    try {
      const baseUrl = 'http://localhost:3005/api/campaign-summary';
      const params = new URLSearchParams();
      params.append('board', selectedBoard);
      const selectedBoardName = boards.find(b => b.id === selectedBoard)?.name || selectedBoard;
      params.append('boardName', selectedBoardName);
      // Join multiple campaigns with comma
      params.append('campaign', selectedCampaigns.join(','));

      if (startDate && endDate) {
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }
      if (source) params.append('source', source);
      if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));

      const response = await apiFetch(`${baseUrl}?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao gerar resumo da campanha.');
      }

      const summaryData: CampaignSummary = await response.json();
      setCampaignSummary(summaryData);

    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCampaign = async () => {
    if (!campaignSummary || selectedCampaigns.length === 0) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await apiFetch('http://localhost:3005/api/campaign-summary/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Join multiple campaigns with comma
          campaign: selectedCampaigns.join(','),
          board: selectedBoard,
          boardName: campaignSummary.board,
          startDate: startDate ? startDate.toISOString() : undefined,
          endDate: endDate ? endDate.toISOString() : undefined,
          source: source,
          tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao atualizar campanha.');
      }

      const summaryData: CampaignSummary = await response.json();
      setCampaignSummary(summaryData);

      addNotification({
        title: 'Campanha Atualizada',
        message: `Os dados de "${selectedCampaigns.join(', ')}" foram atualizados com sucesso.`,
        type: 'success',
      });

    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateAllCampaigns = async () => {
    if (!campaignsData || campaignsData.length === 0) return;

    if (!confirm('Deseja realmente atualizar TODAS as campanhas? Esse processo pode levar alguns minutos.')) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    let updatedCount = 0;
    const failedList: string[] = [];
    const selectedBoardName = boards.find(b => b.id === selectedBoard)?.name || selectedBoard;

    try {
      for (const campaign of campaignsData) {
        try {
          // Usamos a função de refresh existente para cada campanha
          const response = await apiFetch('http://localhost:3005/api/campaign-summary/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              campaign: campaign.name,
              board: selectedBoard,
              boardName: selectedBoardName,
              // Mantém os filtros globais se selecionados, ou undefined para usar o padrão da campanha
              startDate: startDate ? startDate.toISOString() : undefined,
              endDate: endDate ? endDate.toISOString() : undefined,
              source: source,
              tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined
            }),
          });

          if (response.ok) {
            updatedCount++;
          } else {
            console.error(`Falha ao atualizar campanha: ${campaign.name}`);
            failedList.push(campaign.name);
          }
        } catch (err) {
          console.error(`Erro ao atualizar campanha: ${campaign.name}`, err);
          failedList.push(campaign.name);
        }
      }

      let message = `Processo finalizado! Atualizadas: ${updatedCount}.`;
      if (failedList.length > 0) {
        message += ` Falhas: ${failedList.length} (${failedList.join(', ')}).`;
      }
      setSuccessMessage(message);

      addNotification({
        title: 'Atualização de Campanhas',
        message: message,
        type: failedList.length === 0 ? 'success' : 'warning',
      });

    } catch (error: any) {
      setError(`Erro geral ao atualizar campanhas: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };


  // Função para agrupar campanhas por template
  const templatesAgrupados = () => {
    if (!campaignSummary || selectedCampaigns.length === 0) return [];
    const grouped = new Map<string, string[]>();

    selectedCampaigns.forEach((campName) => {
      const campDb = campaignsData.find((c: any) => c.name === campName);
      const template = campDb?.template_enviado || "Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato";
      
      const list = grouped.get(template) || [];
      list.push(campName);
      grouped.set(template, list);
    });

    return Array.from(grouped.entries()).map(([template, campanhas]) => ({
      template,
      campanhas: campanhas.join(', ')
    }));
  };

  // Tratamento do texto da webhook (envia o agrupamento ou apenas o primeiro)
  // Como o webhook precisava de apenas um texto, vou formatar da mesma forma que o copy.
  const getWebhookMessage = () => {
    const agrupados = templatesAgrupados();
    let templatesText = '';
    agrupados.forEach((item) => {
      if (agrupados.length > 1) {
        templatesText += `[Mensagem das campanhas: ${item.campanhas}]\n`;
      }
      templatesText += `${item.template.replace(/ {2,}/g, '\n\n')}\n`;
    });
    return templatesText.trim();
  };


  //Função para formatar mensagem no formato deo WhatsApp
  function parseWhatsAppFormatting(text: string): string {
    if (!text) return '';

    return text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<s>$1</s>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }



  // Função Webhook de enviar
  const handleSendWebhook = async () => {
    if (!campaignSummary) return;

    const payload = {
      origem: "report_ia_force",
      board: campaignSummary.board,
      campanha: campaignSummary.campaignNames,
      dt_envio: campaignSummary.dateRange,
      total_clientes: campaignSummary.totalClients,
      total_tel: campaignSummary.totalPhones,
      nao_receberam_mgs: campaignSummary.notReceivedMsg,
      total_lida: campaignSummary.totalRead,
      total_entregue: campaignSummary.totalDelivered,
      total_respostas: campaignSummary.totalHabllaResponses,
      venda_ia: campaignSummary.salesIA,
      venda_manual: campaignSummary.salesManual,
      mgs_enviada: getWebhookMessage(),
    };

    try {
      const response = await fetch(
        "https://infra-n8nserver.mundodosfiltros.com.br/webhook/8b4f62ae-ba89-4e5f-ad6a-2e019ffb22e4",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        console.log("Webhook enviado com sucesso!");
        // opcional: feedback pro usuário
      } else {
        console.error("Erro ao enviar webhook:", response.statusText);
      }
    } catch (error) {
      console.error("Erro na requisição do webhook:", error);
    }
  };



  if (!token || !user) {
    return (
      <Login onLogin={(newToken, newUser) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
        if (newUser.theme) setTheme(newUser.theme as "light" | "dark" | "system");
      }} />
    );
  }

  if (user.force_password_change) {
    return (
      <ChangePassword
        token={token}
        onSuccess={(newToken, updatedUser) => {
          localStorage.setItem('token', newToken);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          setToken(newToken);
          setUser(updatedUser);
          if (updatedUser.theme) setTheme(updatedUser.theme as "light" | "dark" | "system");
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-auto">
          {activeTab === 'dashboard' ? (
            <Dashboard
              onMenuClick={() => setIsSidebarOpen(true)}
              notifications={notifications}
              setNotifications={setNotifications}
              user={user}
              onLogout={handleLogout}
              campaignsData={campaignsData}
            />
          ) : activeTab === 'settings' ? (
            <Settings
              token={token}
              onMenuClick={() => setIsSidebarOpen(true)}
              notifications={notifications}
              setNotifications={setNotifications}
              user={user}
              onLogout={handleLogout}
              campaignsData={campaignsData}
              fetchCampaigns={() => {
                apiFetch('http://localhost:3005/api/campaigns')
                  .then(res => res.json())
                  .then(data => setCampaignsData(data));
              }}
            />
          ) : (
            <div className="container mx-auto p-4 md:p-8 space-y-8">
              <Header
                title="Relatórios"
                onMenuClick={() => setIsSidebarOpen(true)}
                notifications={notifications}
                setNotifications={setNotifications}
                user={user}
                onLogout={handleLogout}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Gerar Relatório de Vendas</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleGenerateReport} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-4 items-end">
                      {user?.role === 'admin' && (
                        <>
                          <div className='min-w-0 md:col-span-1 xl:col-span-2'>
                            <Label htmlFor="board">Quadro</Label>
                            <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                              <SelectTrigger id="board">
                                <SelectValue placeholder="Selecione o quadro" />
                              </SelectTrigger>
                              <SelectContent>
                                {boards.map((board) => (
                                  <SelectItem key={board.id} value={board.id}>
                                    {board.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className='min-w-0 md:col-span-1 xl:col-span-2'>
                            <Label>Período</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="min-w-0">
                                <DatePicker placeholder="Data de Início" date={startDate} setDate={setStartDate} />
                              </div>
                              <div className="min-w-0">
                                <DatePicker placeholder="Data de Fim" date={endDate} setDate={setEndDate} />
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      <div className={`min-w-0 ${user?.role === 'admin' ? 'md:col-span-2 xl:col-span-4' : 'md:col-span-2 xl:col-span-8'}`}>
                        <Label htmlFor="campaign">Campanha</Label>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {/* <Input
                        name="campaign"
                        id="campaign"
                        placeholder="Nome da campanha"
                        value={campaign}
                        onChange={(e) => setCampaign(e.target.value)}
                        disabled={searchEmptyCampaign}
                      /> */}
                          <div className="w-full flex min-w-0 flex-1">
                            <MultiSelectCampaign
                              options={campaignsData}
                              selected={selectedCampaigns}
                              onChange={setSelectedCampaigns}
                              className={searchEmptyCampaign ? "opacity-50 pointer-events-none" : ""}
                            />
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <TooltipProvider>
                              {user?.role !== 'user' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={handleUpdateAllCampaigns}
                                      disabled={isLoading}
                                      className="h-9 w-9"
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Atualizar todas as campanhas cadastradas</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TooltipProvider>

                            <Checkbox
                              id="empty-campaign"
                              checked={searchEmptyCampaign}
                              onCheckedChange={(checked) => setSearchEmptyCampaign(Boolean(checked))}
                            />
                            <Label htmlFor="empty-campaign" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Vazias</Label>
                          </div>
                        </div>
                      </div>

                      {user?.role === 'admin' && (
                        <>
                          <div className='min-w-0 md:col-span-1 xl:col-span-2'>
                            <Label htmlFor="source">Fonte</Label>
                            <Input name="source" id="source" placeholder="Nome da fonte" value={source} onChange={(e) => setSource(e.target.value)} />
                          </div>

                          <div className='min-w-0 md:col-span-1 xl:col-span-2'>
                            <Label htmlFor="tags">Etiquetas</Label>
                            <MultiSelectCombobox
                              options={tags}
                              selected={selectedTags}
                              onChange={setSelectedTags}
                              className="w-full"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      {user?.role === 'admin' && (
                        <>
                          <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Gerando...' : 'Gerar Relatório'}
                          </Button>
                          <Button type="button" variant="secondary" onClick={handleFindCardsClick} disabled={isLoading}>
                            {isLoading ? 'Buscando...' : 'Buscar IDs'}
                          </Button>
                        </>
                      )}
                      <Button type="button" variant="outline" onClick={handleGenerateCampaignSummary} disabled={isLoading}>
                        {isLoading ? 'Gerando...' : 'Resumo Campanha IA'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {error && (
                <Alert variant="destructive" className="mt-8">
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {successMessage && (
                <Alert variant="default" className="mt-8 border-green-500 text-green-700 bg-green-50">
                  <Check className="h-4 w-4" />
                  <AlertTitle>Sucesso</AlertTitle>
                  <AlertDescription>{successMessage}</AlertDescription>
                </Alert>
              )}

              {isLoading && (
                <div className="flex justify-center items-center mt-8">
                  <p className="text-lg">
                    <span>Carregando dados</span>
                    <span className="inline-block w-[2ch] text-left">{loadingDots}</span>
                  </p>
                </div>
              )}

              {!isLoading && reportData && (
                <Card className="mt-8">
                  <CardHeader>
                    <CardTitle>Resumo do Relatório</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {reportData.length > 0 ? (
                      <>
                        <div>
                          <p className="font-bold text-lg">Total de Cards:</p>
                          <p>{reportData.length}</p>
                        </div>
                        <div>
                          <p className="font-bold text-lg">Campanhas Encontradas:</p>
                          <ul className="list-disc list-inside">
                            {[...new Set(reportData.map(item => item.campaign).filter(Boolean))].map(campaign => (
                              <li key={campaign}>{campaign}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-bold text-lg">Período dos Cards:</p>
                          <p>
                            <strong>Mais antigo:</strong> {new Date(Math.min(...reportData.map(item => new Date(item.created_at).getTime()))).toLocaleDateString()}
                          </p>
                          <p>
                            <strong>Mais recente:</strong> {new Date(Math.max(...reportData.map(item => new Date(item.created_at).getTime()))).toLocaleDateString()}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p>Nenhum card encontrado para este filtro.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {!isLoading && cardList && (
                <Card className="mt-8">
                  <CardHeader>
                    <CardTitle>Lista de Cards Encontrados ( Total: {cardList.length} )</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {cardList.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID do Cartão</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Campanha</TableHead>
                            <TableHead>Data de Criação</TableHead>
                            <TableHead>Dono do cartão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cardList.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.id}</TableCell>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.campaign || "-"}</TableCell>
                              <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                              <TableCell>{item.user || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p>Nenhum card encontrado para este filtro.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {!isLoading && campaignSummary && (
                <Card className="mt-8">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex flex-col space-y-1">
                      <CardTitle>Resumo da Campanha</CardTitle>
                      {campaignSummary.lastUpdated && (
                        <p className="text-xs text-muted-foreground">
                          Última atualização: {new Date(campaignSummary.lastUpdated).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {/* Botão atualizar campanha */}
                      {user?.role !== 'user' && (
                        <Button variant="ghost" size="icon" onClick={handleUpdateCampaign} title="Atualizar Campanha">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Botão copiar */}
                      <Button variant="ghost" size="icon" onClick={handleCopySummary} title="Copiar Resumo">
                        {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                      </Button>
                      {/* Botão enviar webhook */}
                      {user?.role === 'admin' && (
                        <Button variant="ghost" size="icon" onClick={handleSendWebhook} title="Enviar Webhook">
                          <Webhook className='h-4 w-4' />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-base">
                    <p className='flex flex-row gap-2 items-center'>
                      <Presentation className="h-4 w-4" />
                      <strong>Quadro:</strong> {campaignSummary.board}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <BarChartBig className="h-4 w-4" />
                      <strong>Campanha:</strong> {campaignSummary.campaignNames}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <CalendarDays className="h-4 w-4" />
                      <strong>Dt. Envio:</strong> {campaignSummary.dateRange}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <CircleUserRound className="h-4 w-4" />
                      <strong>Total de clientes:</strong> {campaignSummary.totalClients}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <Phone className="h-4 w-4" />
                      <strong>Total de telefones:</strong> {campaignSummary.totalPhones}
                    </p>
                    <p className='flex flex-row gap-2 items-center text-red-400'>
                      <CircleX className="h-4 w-4" />
                      <strong>Não receberam mgs:</strong> {campaignSummary.notReceivedMsg}
                    </p>
                    {/* <p className='flex flex-row gap-2 items-center text-zinc-600'>
                  <MailCheck className="h-4 w-4" />
                  <strong>Total Entregue:</strong> {campaignSummary.totalDelivered}
                </p> */}
                    {/* <p className='flex flex-row gap-2 items-center text-zinc-600 '>
                  <CheckCheck className="h-4 w-4" />
                  <strong>Total Lida:</strong> {campaignSummary.totalRead}
                </p> */}
                    <p className='flex flex-row gap-2 items-center'>
                      <MessageCircleMore className="h-4 w-4" />
                      <strong>Total de Respostas:</strong> {campaignSummary.totalHabllaResponses}
                    </p>

                    {/* <p className="pl-4 flex flex-row gap-2 items-center text-zinc-600 ">
                  <CircleCheckBig className="h-4 w-4" />WhatsApp: (Dado não disponível)
                </p> */}
                    {/* <p className="pl-4 flex flex-row gap-2 items-center text-zinc-600 ">
                  <CircleCheckBig className="h-4 w-4" />Ligação: (Dado não disponível)
                </p> */}
                    {/* <p className="pl-4 flex flex-row gap-2 items-center text-zinc-600 ">
                  <CircleCheckBig className="h-4 w-4" />Não quero contato: (Dado não disponível)
                </p> */}

                    <p className='flex flex-row gap-2 items-center text-emerald-400'>
                      <Bot className="h-4 w-4" />
                      <strong>Venda IA:</strong> {campaignSummary.salesIA}
                    </p>
                    <p className='flex flex-row gap-2 items-center text-emerald-600'>
                      <UserRound className="h-4 w-4" />
                      <strong>Venda Manual:</strong> {campaignSummary.salesManual}
                    </p>
                    <p className='flex flex-row gap-2 items-center text-yellow-600'>
                      <DollarSign className="h-4 w-4" />
                      <strong>Custo Total:</strong> {campaignSummary.totalCost}
                    </p>
                    <p className='flex flex-row gap-2 items-center text-green-500'>
                      <TrendingUp className="h-4 w-4" />
                      <strong>Média vendido:</strong> {campaignSummary.averageSold}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <Percent className="h-4 w-4" />
                      <strong>Respostas (Respostas/Clientes):</strong> {campaignSummary.responseRate}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <PieChart className="h-4 w-4" />
                      <strong>Conversão (Vendas/Clientes):</strong> {campaignSummary.conversionSalesClients}
                    </p>
                    <p className='flex flex-row gap-2 items-center'>
                      <PieChart className="h-4 w-4" />
                      <strong>Conversão (Vendas/Respostas):</strong> {campaignSummary.conversionSalesResponses}
                    </p>
                    <p className="flex flex-row gap-2 items-center pt-4">
                      <Mails className="h-4 w-4" /><strong>Mensagem enviada:</strong>
                    </p>
                    {/* <div className='pl-4 space-y-2'>
                  <hr />
                  <p className='my-2 font-bold'>Lembrete de Troca de Refil</p>
                  <p>Chegou o momento de trocar o refil do seu Purificador Soft/Everest!</p>
                  <p>💧 A qualidade da água que você consome é essencial para a sua saúde e bem-estar.</p>
                  <p>⚠️ Atenção: Refil vencido pode comprometer a pureza da água e a eficiência da purificação.</p>
                  <p>Não esqueça de agendar a próxima troca!</p>
                  <p>* Quero agendar</p>
                  <p>* Não quero contato</p>
                  <hr />
                </div> */}
                    <div className="pl-4 space-y-4">
                      {templatesAgrupados().map((item, index) => (
                        <div key={index} className="space-y-2">
                          <hr />
                          <p className="text-[13px] font-semibold text-muted-foreground my-2">
                            Para {templatesAgrupados().length > 1 ? `as campanhas (${item.campanhas})` : "esta campanha"}:
                          </p>
                          {item.template.replace(/ {2,}/g, '\n\n').split("\n").map((line, i) => (
                            <p key={i} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseWhatsAppFormatting(line)) }} />
                          ))}
                          <hr />
                        </div>
                      ))}
                    </div>

                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
