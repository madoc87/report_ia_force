import { useState } from 'react';
import { getBaseUrl } from '@/lib/config';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { DatePicker } from '@/components/ui/date-picker';
import { MultiSelectCampaign, CampaignOption } from '@/components/ui/multi-select-campaign';
import { Notification } from '@/App';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  PieChart as PieChartIcon, XCircle, CheckCircle, Clock, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight
} from 'lucide-react';

interface LossAnalysisSummary {
  total: number;
  won: number;
  lost: number;
  inProgress: number;
  returnTotal: number;
  returnWon: number;
  returnLost: number;
  lossReasons: [string, number][];
  returnLossReasons: [string, number][];
  inconsistencies: { id: string; name: string; campaign: string; reason: string; status: string; tags: string }[];
  fromCache?: boolean;
}

interface LossAnalysisProps {
  onMenuClick?: () => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  user?: any;
  onLogout?: () => void;
  campaignsData: CampaignOption[];
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

// Agrupamentos e tags agora são gerenciados no backend

export function LossAnalysis({ onMenuClick, notifications, setNotifications, user, onLogout, campaignsData }: LossAnalysisProps) {
  const [selectedBoard, setSelectedBoard] = useState<string>(boards[0].id);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LossAnalysisSummary | null>(null);
  const [inconsistenciesPage, setInconsistenciesPage] = useState(1);
  const inconsistenciesPerPage = 10;

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
      if (onLogout) onLogout();
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }
    return response;
  };

  const performSearch = async (e?: React.FormEvent, forceRefresh = false) => {
    if (e) e.preventDefault();
    if ((startDate && !endDate) || (!startDate && endDate)) {
      setError('Para filtrar por data, é necessário selecionar a Data de Início e a Data de Fim.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams();
      params.append('board', selectedBoard);

      if (startDate && endDate) {
        // formatDate to local YYYY-MM-DD
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        params.append('startDate', formatDate(startDate));
        params.append('endDate', formatDate(endDate));
      }

      if (selectedCampaigns.length > 0) {
        params.append('campaign', selectedCampaigns.join(','));
      } else {
        throw new Error('Selecione pelo menos uma campanha para gerar a análise de perdas.');
      }

      if (forceRefresh) {
        params.append('forceRefresh', 'true');
      }

      const response = await apiFetch(`${getBaseUrl()}/api/loss-analysis?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Falha ao buscar a análise de perdas.');
      }
      
      const results: LossAnalysisSummary = await response.json();
      setData(results);
      setInconsistenciesPage(1); // Reset page on new search
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const kpis = data ? { total: data.total, won: data.won, lost: data.lost, inProgress: data.inProgress } : { total: 0, won: 0, lost: 0, inProgress: 0 };
  const lossAnalysis = data ? data.lossReasons : [];
  const returnAnalysis = data ? { total: data.returnTotal, won: data.returnWon, lost: data.returnLost, lossReasons: data.returnLossReasons } : { total: 0, won: 0, lost: 0, lossReasons: [] };
  const inconsistencies = data ? data.inconsistencies : [];

  return (
    <div className="flex-1 bg-background min-h-screen p-4 md:p-8 text-foreground transition-colors duration-300">
      <Header
        title="Análise de Perdas"
        onMenuClick={onMenuClick}
        notifications={notifications}
        setNotifications={setNotifications}
        user={user}
        onLogout={onLogout}
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={performSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
              <div className='min-w-0'>
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

              <div className='min-w-0'>
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

              <div className='min-w-0 xl:col-span-2'>
                <Label htmlFor="campaign">Campanha</Label>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-full flex min-w-0 flex-1">
                    <MultiSelectCampaign
                      options={campaignsData}
                      selected={selectedCampaigns}
                      onChange={setSelectedCampaigns}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Buscando...' : 'Buscar Dados'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={(e) => performSearch(e, true)} 
                disabled={isLoading || selectedCampaigns.length === 0}
                title="Forçar recálculo ignorando o cache do banco de dados"
              >
                Forçar Atualização
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard title="Total de Cartões" value={kpis.total} icon={<PieChartIcon className="w-5 h-5 text-blue-500" />} color="bg-blue-500/10" />
            <StatsCard title="Em Atendimento" value={kpis.inProgress} icon={<Clock className="w-5 h-5 text-yellow-500" />} color="bg-yellow-500/10" />
            <StatsCard title="Ganhos" value={kpis.won} icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} color="bg-emerald-500/10" />
            <StatsCard title="Perdidos" value={kpis.lost} icon={<XCircle className="w-5 h-5 text-red-500" />} color="bg-red-500/10" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Motivos de Perda</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {lossAnalysis.length > 0 ? lossAnalysis.map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{reason}</span>
                      <span className="bg-muted px-2 py-1 rounded text-xs font-bold">{count}</span>
                    </div>
                  )) : (
                    <p className="text-muted-foreground text-sm">Nenhum cartão perdido encontrado com tags conhecidas.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Análise de Retorno</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6 grid grid-cols-3 gap-4 text-center">
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Total Retornos</p>
                    <p className="text-xl font-bold text-blue-500">{returnAnalysis.total}</p>
                  </div>
                  <div className="bg-emerald-500/10 p-3 rounded-lg">
                    <p className="text-xs text-emerald-600 font-semibold uppercase mb-1">Convertidos</p>
                    <p className="text-xl font-bold text-emerald-600">{returnAnalysis.won}</p>
                  </div>
                  <div className="bg-red-500/10 p-3 rounded-lg">
                    <p className="text-xs text-red-600 font-semibold uppercase mb-1">Perdidos</p>
                    <p className="text-xl font-bold text-red-600">{returnAnalysis.lost}</p>
                  </div>
                </div>

                {returnAnalysis.lost > 0 && (
                  <div>
                    <h4 className="text-sm font-bold mb-3">Motivos de perda (Retorno)</h4>
                    <div className="space-y-2">
                      {returnAnalysis.lossReasons.map(([reason, count]) => (
                        <div key={reason} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                          <span>{reason}</span>
                          <span className="font-bold">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {user?.role === 'admin' && inconsistencies.length > 0 && (
            <Card className="border-red-500/50 shadow-md">
              <CardHeader className="bg-red-500/5 border-b border-red-500/20">
                <CardTitle className="text-red-500 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Painel de Inconsistências
                  </div>
                  <span className="text-sm bg-red-500 text-white px-2 py-0.5 rounded-full">
                    {inconsistencies.length} {inconsistencies.length === 1 ? 'item' : 'itens'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cartão</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tags Aplicadas</TableHead>
                        <TableHead>Motivo do Conflito</TableHead>
                        <TableHead className="w-[80px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inconsistencies
                        .slice((inconsistenciesPage - 1) * inconsistenciesPerPage, inconsistenciesPage * inconsistenciesPerPage)
                        .map(inc => (
                        <TableRow key={inc.id}>
                          <TableCell>
                            <p className="font-medium">{inc.name}</p>
                            <p className="text-xs text-muted-foreground">{inc.id}</p>
                          </TableCell>
                          <TableCell>
                            <span className={cn("px-2 py-1 rounded text-xs font-bold", 
                              inc.status === 'won' ? 'bg-emerald-500/10 text-emerald-500' :
                              inc.status === 'lost' ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground'
                            )}>
                              {inc.status || "N/A"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={inc.tags}>
                            {inc.tags}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-red-400">
                            {inc.reason}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Abrir Cartão"
                              asChild
                            >
                              <a 
                                href={`https://studio.hablla.com/workspace/67e44bc7d729e2b2eab770dd/crm/${selectedBoard}/cards/${inc.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                              </a>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {inconsistencies.length > inconsistenciesPerPage && (
                  <div className="flex items-center justify-end space-x-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInconsistenciesPage(prev => Math.max(1, prev - 1))}
                      disabled={inconsistenciesPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <div className="text-sm font-medium">
                      Página {inconsistenciesPage} de {Math.ceil(inconsistencies.length / inconsistenciesPerPage)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInconsistenciesPage(prev => Math.min(Math.ceil(inconsistencies.length / inconsistenciesPerPage), prev + 1))}
                      disabled={inconsistenciesPage === Math.ceil(inconsistencies.length / inconsistenciesPerPage)}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatsCard({ title, value, icon, color }: { title: string, value: number | string, icon: React.ReactNode, color: string }) {
  return (
    <Card className="border-none shadow-sm bg-card">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={cn("p-2 rounded-lg", color)}>
            {icon}
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-1">{title}</p>
          <h3 className="text-2xl font-bold">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}
