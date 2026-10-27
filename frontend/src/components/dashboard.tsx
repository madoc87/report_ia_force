import { useState, useEffect, useMemo } from 'react';
import { getBaseUrl } from '@/lib/config';
import { handleAuthErrors, logError, toApiError, toUiError, UiError } from '@/lib/api';
import {
  buildShotDayOptions, computeConversions, formatMonthKey, getCommercialMonthKey, getFiscalMonthKey,
  getPreviousMonthKey, normalizeShotDate, parseCurrency, shotDateSortValue
} from '@/lib/dashboard-utils';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  DollarSign, ShoppingCart, TrendingUp, Users,
  ArrowUpRight
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { CampaignOption } from '@/components/ui/multi-select-campaign';
import { Notification } from '@/App';
import { Header } from '@/components/header';
import { ErrorAlert } from '@/components/error-alert';
import { ArrowDownRight, Bot, PieChart as PieChartIcon } from 'lucide-react';
import { MultiSelectCampaign } from '@/components/ui/multi-select-campaign';

interface CampaignData {
  id: number;
  campaign_name: string;
  board_id: string;
  board_name: string;
  date_range: string;
  total_clients: number;
  total_phones: number;
  total_hablla_responses: number;
  sales_ia: number;
  sales_manual: number;
  not_received_msg: number;
  total_cost: string;
  average_sold: string;
  response_rate: string;
  conversion_sales_clients: string;
  conversion_sales_responses: string;
  last_updated: string;
}

interface DashboardProps {
  onMenuClick?: () => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  user?: any;
  onLogout?: () => void;
  campaignsData: CampaignOption[];
}

type FilterMode = 'month' | 'grouped' | 'month_shots' | 'individual' | 'day';

const REVENUE_PER_SALE = 149.9;

export function Dashboard({ onMenuClick, notifications, setNotifications, user, onLogout, campaignsData }: DashboardProps) {
  const [rawData, setRawData] = useState<CampaignData[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('month_shots');
  const [monthType, setMonthType] = useState<'fiscal' | 'comercial'>('fiscal');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedSubMonth, setSelectedSubMonth] = useState<string>('all');
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<UiError | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const payload = JSON.parse(window.atob(token.split('.')[1]));
            if (payload.exp * 1000 <= Date.now()) {
              onLogout?.();
              throw new Error('Sessão expirada. Por favor, faça login novamente.');
            }
          } catch (e: any) {
            if (e && e.message && e.message.includes('Sessão expirada')) throw e;
          }
        }

        const response = await fetch(`${getBaseUrl()}/api/dashboard-data`, {
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });

        await handleAuthErrors(response, onLogout);

        if (!response.ok) throw await toApiError(response, 'Não foi possível carregar os dados do Dashboard.');
        setRawData(await response.json());
        setLoadError(null);
      } catch (error) {
        logError('Carregamento do Dashboard', error);
        setLoadError({ ...toUiError(error), title: 'Erro ao carregar o Dashboard' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Processa os dados sempre que os resumos OU a lista de campanhas mudarem
  // (a lista de campanhas pode chegar depois do primeiro carregamento)
  const data = useMemo(() => {
    const processed = rawData.map((item) => {
      const campaignMeta = campaignsData.find(c => c.name === item.campaign_name);
      const shotDate = normalizeShotDate(campaignMeta?.date_only);

      // Campanha sem Data de Disparo cadastrada = campanha não enviada: fica fora do Dashboard
      if (!shotDate) return null;

      const monthVal = campaignMeta?.month || "Unknown";

      // Número do disparo (D01, D02...) para ordenação
      let shotNumber = 0;
      if (monthVal.includes('-')) {
        shotNumber = parseInt(monthVal.split('-')[0].replace('D', ''), 10) || 0;
      }

      // Nome agrupado (removendo .01, .02, etc)
      const groupedName = item.campaign_name.replace(/\.\d+$/, '').trim();

      const salesIA = item.sales_ia || 0;
      const salesManual = item.sales_manual || 0;
      const totalSales = salesIA + salesManual;
      const clients = item.total_clients || 0;
      const responses = item.total_hablla_responses || 0;

      return {
        id: item.id,
        name: item.campaign_name,
        groupedName,
        month: monthVal,
        shotDate,
        shotDateSort: shotDateSortValue(shotDate),
        fiscalMonth: getFiscalMonthKey(shotDate),
        commercialMonth: getCommercialMonthKey(shotDate),
        shotNumber,
        salesIA,
        salesManual,
        totalSales,
        revenue: totalSales * REVENUE_PER_SALE,
        clients,
        responses,
        ...computeConversions(totalSales, clients, responses),
        totalCost: parseCurrency(item.total_cost),
        date: item.date_range
      };
    }).filter(Boolean) as any[];

    processed.sort((a, b) => a.shotDateSort - b.shotDateSort || a.shotNumber - b.shotNumber);
    return processed;
  }, [rawData, campaignsData]);

  const activeMonthKey = monthType === 'fiscal' ? 'fiscalMonth' : 'commercialMonth';

  const filteredData = useMemo(() => {
    let result = [...data];

    if (filterMode === 'month') {
      if (selectedMonth !== 'all') {
        result = result.filter(d => d[activeMonthKey] === selectedMonth);
      }
    } else if (filterMode === 'month_shots') {
      if (selectedSubMonth !== 'all') {
        result = result.filter(d => d[activeMonthKey] === selectedSubMonth);
      }
    } else if (filterMode === 'individual') {
      if (selectedCampaigns.length > 0) {
        result = result.filter(d => selectedCampaigns.includes(d.name));
      }
    } else if (filterMode === 'day') {
      if (selectedDays.length > 0) {
        result = result.filter(d => selectedDays.includes(d.shotDate));
      }
    } else if (filterMode === 'grouped') {
      // Agrupar por groupedName mantendo a ordem da primeira ocorrência
      const orderedGroups: any[] = [];
      const groups: Record<string, any> = {};

      result.forEach(item => {
        if (!groups[item.groupedName]) {
          groups[item.groupedName] = {
            ...item, name: item.groupedName, count: 0,
            salesIA: 0, salesManual: 0, totalSales: 0, revenue: 0, clients: 0, responses: 0, totalCost: 0
          };
          orderedGroups.push(groups[item.groupedName]);
        }
        const group = groups[item.groupedName];
        group.salesIA += item.salesIA;
        group.salesManual += item.salesManual;
        group.totalSales += item.totalSales;
        group.revenue += item.revenue;
        group.clients += item.clients;
        group.responses += item.responses;
        group.totalCost += item.totalCost;
        group.count += 1;
      });

      // Recalcula as conversões do grupo com a mesma fórmula das campanhas individuais
      orderedGroups.forEach(group => {
        Object.assign(group, computeConversions(group.totalSales, group.clients, group.responses));
      });

      result = orderedGroups;
    }

    return result;
  }, [data, filterMode, activeMonthKey, selectedMonth, selectedSubMonth, selectedCampaigns, selectedDays]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredData]);

  const totals = filteredData.reduce((acc, curr) => ({
    revenue: acc.revenue + curr.revenue,
    sales: acc.sales + curr.totalSales,
    clients: acc.clients + curr.clients,
    responses: acc.responses + curr.responses,
    cost: acc.cost + (curr.totalCost || 0)
  }), { revenue: 0, sales: 0, clients: 0, responses: 0, cost: 0 });

  // Meses disponíveis (com ano), em ordem cronológica
  const availableMonths = [...new Set(data.map(d => d[activeMonthKey]).filter(Boolean))].sort() as string[];

  // Dias de disparo disponíveis, a partir do campo "Data de Disparo" das campanhas cadastradas
  const shotDayOptions = useMemo(() => buildShotDayOptions(campaignsData), [campaignsData]) as unknown as CampaignOption[];

  let activeMonth = 'all';
  if (filterMode === 'month') {
    activeMonth = selectedMonth;
  } else if (filterMode === 'month_shots') {
    activeMonth = selectedSubMonth;
  }

  const calcAverage = (key: string) => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);
    return sum / filteredData.length;
  };

  const avgConvVendas = calcAverage('conversionSalesClients');
  const avgConvIA = calcAverage('conversionSalesResponses');
  const avgSales = calcAverage('totalSales');
  const avgRevenue = calcAverage('revenue');
  const avgCost = calcAverage('totalCost');

  let trends: { revenue: string | null; sales: string | null; ticket: string | null; clients: string | null; cost: string | null } = {
    revenue: null,
    sales: null,
    ticket: null,
    clients: null,
    cost: null
  };

  // Compara com o mês de calendário imediatamente anterior (só quando há dados nele)
  if (activeMonth !== 'all') {
    const prevMonth = getPreviousMonthKey(activeMonth);
    const prevMonthData = data.filter(d => d[activeMonthKey] === prevMonth);
    if (prevMonthData.length > 0) {
      const prevTotals = prevMonthData.reduce((acc, curr) => ({
        revenue: acc.revenue + curr.revenue,
        sales: acc.sales + curr.totalSales,
        clients: acc.clients + curr.clients,
        responses: acc.responses + curr.responses,
        cost: acc.cost + (curr.totalCost || 0)
      }), { revenue: 0, sales: 0, clients: 0, responses: 0, cost: 0 });

      const prevTicket = prevTotals.sales > 0 ? prevTotals.revenue / prevTotals.sales : 0;
      const currentTicket = totals.sales > 0 ? totals.revenue / totals.sales : 0;

      const calcTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? '+100%' : '0%';
        const diff = current - previous;
        const percent = (diff / previous) * 100;
        return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
      };

      trends = {
        revenue: calcTrend(totals.revenue, prevTotals.revenue),
        sales: calcTrend(totals.sales, prevTotals.sales),
        ticket: calcTrend(currentTicket, prevTicket),
        clients: calcTrend(totals.clients, prevTotals.clients),
        cost: calcTrend(totals.cost, prevTotals.cost)
      };
    }
  }

  if (isLoading) return <div className="p-8 text-center">Carregando Dashboard...</div>;

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex-1 bg-background min-h-screen p-4 md:p-8 text-foreground transition-colors duration-300">
      {/* Header */}
      <Header
        title="Dashboard"
        onMenuClick={onMenuClick}
        notifications={notifications}
        setNotifications={setNotifications}
        user={user}
        onLogout={onLogout}
      />

      {loadError && <ErrorAlert error={loadError} className="mb-6" />}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1">
          <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Modo de Filtro</label>
          <Select value={filterMode} onValueChange={(v: any) => setFilterMode(v)}>
            <SelectTrigger className="bg-card border-none shadow-sm h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month_shots">Por Mês de Disparo</SelectItem>
              <SelectItem value="day">Por Dia de Disparo</SelectItem>
              <SelectItem value="individual">Campanhas Individuais</SelectItem>
              <SelectItem value="grouped">Campanhas Agrupadas</SelectItem>
              <SelectItem value="month">Por Mês</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(filterMode === 'month_shots' || filterMode === 'month') && (
          <div className="flex-[0.8]">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Filtro de Período</label>
            <Select value={monthType} onValueChange={(v: any) => setMonthType(v)}>
              <SelectTrigger className="bg-card border-none shadow-sm h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fiscal">Mês Fiscal (01 a 30/31)</SelectItem>
                <SelectItem value="comercial">Mês Comercial (21 a 20)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {filterMode === 'month' && (
          <div className="flex-1">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Mês</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="bg-card border-none shadow-sm h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Meses</SelectItem>
                {availableMonths.map(m => <SelectItem key={m} value={m}>{formatMonthKey(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {filterMode === 'month_shots' && (
          <div className="flex-1">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Mês das Campanhas</label>
            <Select value={selectedSubMonth} onValueChange={setSelectedSubMonth}>
              <SelectTrigger className="bg-card border-none shadow-sm h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {availableMonths.map(m => <SelectItem key={m} value={m}>{formatMonthKey(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {filterMode === 'individual' && (
          <div className="flex-[3]">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Campanhas Individuais</label>
            <MultiSelectCampaign
              options={campaignsData}
              selected={selectedCampaigns}
              onChange={setSelectedCampaigns}
              // O Dashboard só exibe campanhas cadastradas: nomes digitados não teriam dados
              allowCustom={false}
            />
          </div>
        )}

        {filterMode === 'day' && (
          <div className="flex-[3]">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Dias de Disparo</label>
            <MultiSelectCampaign
              options={shotDayOptions}
              selected={selectedDays}
              onChange={setSelectedDays}
              placeholder="Selecione os dias de disparo..."
              searchPlaceholder="Buscar dia (ex.: 22/10/2026)..."
              emptyText="Nenhum dia de disparo encontrado."
              allowCustom={false}
            />
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <StatsCard
          title="Valor Vendido"
          value={totals.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          trend={trends.revenue}
          icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
          color="bg-emerald-500/10"
        />
        <StatsCard
          title="Número de Vendas"
          value={totals.sales.toString()}
          trend={trends.sales}
          icon={<ShoppingCart className="w-5 h-5 text-indigo-500" />}
          color="bg-indigo-500/10"
        />
        <StatsCard
          title="Ticket Médio"
          value={(totals.revenue / (totals.sales || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          trend={trends.ticket}
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
          color="bg-blue-500/10"
        />
        <StatsCard
          title="Número de Clientes"
          value={totals.clients.toString()}
          trend={trends.clients}
          icon={<Users className="w-5 h-5 text-orange-500" />}
          color="bg-orange-500/10"
        />
        <StatsCard
          title="Custo Total"
          value={totals.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          trend={trends.cost}
          icon={<DollarSign className="w-5 h-5 text-red-500" />}
          color="bg-red-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Sales Evolution */}
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Evolução de Vendas</CardTitle>
              <p className="text-sm text-zinc-400">Desempenho por campanha/período</p>
            </div>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--charts-secondary))" opacity={0.4} />
                <XAxis dataKey="name" hide />
                <YAxis
                  axisLine={false}
                  tickLine={false}

                  tick={{ fill: 'hsl(var(--charts-secondary))', fontSize: 12, fontWeight: 500 }}
                  tickFormatter={(val) => val.toLocaleString('pt-BR', {
                    style: 'currency', currency: 'BRL', maximumFractionDigits: 0
                  })}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição IA vs Manual (Mantido comentado para possível uso futuro)
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Distribuição IA vs Manual</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'IA', value: filteredData.reduce((acc, curr) => acc + curr.salesIA, 0) },
                    { name: 'Manual', value: filteredData.reduce((acc, curr) => acc + curr.salesManual, 0) },
                  ]}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#6366F1" />
                  <Cell fill="#F43F5E" />
                </Pie>
                <Tooltip
                  formatter={
                    (value) => [value, "Vendas"]
                    // 'value' é o valor bruto
                    // 'name' é a chave da série (ou o que você definiu no DataKey)
                    // 'props' contém os dados extras do ponto
                  }
                  contentStyle={{
                    borderRadius: '12px',
                    background: '#000000e6',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ padding: '4px 0', fontSize: '14px', color: '#fff' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        */}

        {/* Funil de Vendas */}
        <Card className="border-none shadow-sm bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Funil de Vendas</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center pb-8 pt-0 px-6">
            <div className="w-full max-w-[280px] h-full flex flex-col gap-[2px] items-center justify-center">
              {/* Top - Clientes */}
              <div
                className="w-full relative flex-1 bg-indigo-500 text-white flex flex-col items-center justify-center transition-all hover:brightness-110 shadow-sm"
                style={{ clipPath: 'polygon(0 0, 100% 0, 85% 100%, 15% 100%)' }}
              >
                <div className="flex flex-col items-center z-10 pt-1">
                  <span className="text-2xl font-bold leading-none">{totals.clients}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-100 mt-1">Clientes</span>
                </div>
              </div>

              {/* Middle - Respostas */}
              <div
                className="w-[70%] relative flex-1 bg-indigo-400 text-white flex flex-col items-center justify-center transition-all hover:brightness-110 shadow-sm"
                style={{ clipPath: 'polygon(0 0, 100% 0, 78.6% 100%, 21.4% 100%)' }}
              >
                <div className="flex flex-col items-center z-10">
                  <span className="text-xl font-bold leading-none">{totals.responses}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-100 mt-1">Respostas</span>
                </div>
              </div>

              {/* Bottom - Vendas */}
              <div
                className="w-[40%] relative flex-1 bg-emerald-500 text-white flex flex-col items-center justify-center transition-all hover:brightness-110 shadow-sm"
                style={{ clipPath: 'polygon(0 0, 100% 0, 62.5% 100%, 37.5% 100%)' }}
              >
                <div className="flex flex-col items-center z-10 pb-1">
                  <span className="text-lg font-bold leading-none">{totals.sales}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100 mt-1">Vendas</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Average Stats Cards */}
      <h3 className="text-lg font-bold mb-4">Médias das Campanhas Filtradas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <StatsCard
          title="Média Conv. Vendas"
          value={`${avgConvVendas.toFixed(2)}%`}
          icon={<PieChartIcon className="w-5 h-5 text-purple-500" />}
          color="bg-purple-500/10"
          noTrend
        />
        <StatsCard
          title="Média Conv. IA"
          value={`${avgConvIA.toFixed(2)}%`}
          icon={<Bot className="w-5 h-5 text-emerald-500" />}
          color="bg-emerald-500/10"
          noTrend
        />
        <StatsCard
          title="Média de Vendas"
          value={avgSales.toFixed(2)}
          icon={<ShoppingCart className="w-5 h-5 text-indigo-500" />}
          color="bg-indigo-500/10"
          noTrend
        />
        <StatsCard
          title="Média de Faturamento"
          value={avgRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
          color="bg-emerald-500/10"
          noTrend
        />
        <StatsCard
          title="Média de Custos"
          value={avgCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          icon={<DollarSign className="w-5 h-5 text-red-500" />}
          color="bg-red-500/10"
          noTrend
        />
      </div>

      {/* Recent Campaigns Table */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Campanhas - Total {filteredData.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-400 uppercase border-b border-zinc-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Campanha</th>
                  <th className="px-4 py-3 font-medium text-center">Disparo/Mes</th>
                  <th className="px-4 py-3 font-medium text-center">Clientes</th>
                  <th className="px-4 py-3 font-medium text-center">IA</th>
                  <th className="px-4 py-3 font-medium text-center">Manual</th>
                  <th className="px-4 py-3 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50/10">
                {paginatedData.map((item) => (
                  <tr key={item.id ?? item.name} className="hover:bg-zinc-50/5 transition-colors">
                    <td className="px-4 py-4 font-medium">{item.name}</td>
                    <td className="px-4 py-4 text-center text-xs text-muted-foreground">{item.month}</td>
                    <td className="px-4 py-4 text-center">{item.clients}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-full text-xs font-bold">
                        {item.salesIA}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="bg-indigo-500/10 text-indigo-500 px-2 py-1 rounded-full text-xs font-bold">
                        {item.salesManual}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-primary">
                      {item.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <span className="text-sm text-zinc-400">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({ title, value, trend, icon, color, noTrend }: any) {
  const isNegative = trend && trend.startsWith('-');

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={cn("p-2 rounded-lg", color)}>
            {icon}
          </div>
          {!noTrend && trend && (
            <span className={cn("text-xs font-bold flex items-center", isNegative ? "text-red-500" : "text-emerald-500")}>
              {isNegative ? <ArrowDownRight className="w-3 h-3 mr-1" /> : <ArrowUpRight className="w-3 h-3 mr-1" />}
              {trend}
            </span>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-1">{title}</p>
          <h3 className="text-2xl font-bold">{value}</h3>
          {!noTrend && (
            trend ? (
              <p className="text-xs text-muted-foreground mt-1">vs. mês anterior</p>
            ) : (
              <p className="text-xs text-muted-foreground italic mt-1">no período</p>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const formatPercent = (value: unknown) =>
  `${(Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div
        style={{ borderRadius: '12px', background: '#000000e6', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        className="p-3 text-sm text-white"
      >
        <p className="font-bold mb-3">{label}</p>
        <p className="mb-1 text-indigo-400/80">
          Receita: <span className="font-medium text-white">{data.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </p>
        <p className="mb-1 text-indigo-400/80">
          Conversão Vendas: <span className="font-medium text-white">{formatPercent(data.conversionSalesClients)}</span>
        </p>
        <p className="mb-1 text-indigo-400/80">
          Conversão IA: <span className="font-medium text-white">{formatPercent(data.conversionSalesResponses)}</span>
        </p>
        <p className="text-indigo-400/80">
          Custo: <span className="font-medium text-white">{data.totalCost ? data.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</span>
        </p>
      </div>
    );
  }
  return null;
};
