import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DollarSign, ShoppingCart, TrendingUp, Users,
  ArrowUpRight
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { CampaignOption } from '@/components/ui/multi-select-campaign';
import { Notification } from '@/App';
import { Header } from '@/components/header';
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

const monthOrder: Record<string, number> = {
  'Jan': 1, 'Fev': 2, 'Mar': 3, 'Abr': 4, 'Mai': 5, 'Jun': 6,
  'Jul': 7, 'Ago': 8, 'Set': 9, 'Out': 10, 'Nov': 11, 'Dez': 12
};

export function Dashboard({ onMenuClick, notifications, setNotifications, user, onLogout, campaignsData }: DashboardProps) {
  const [data, setData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'month' | 'grouped' | 'month_shots' | 'individual'>('month_shots');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedSubMonth, setSelectedSubMonth] = useState<string>('all');
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3005/api/dashboard-data', {
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });

        if (response.status === 401 || response.status === 403) {
          onLogout?.();
          throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }

        if (!response.ok) throw new Error('Failed to fetch dashboard data');
        const json = await response.json();

        const processed = json.map((item: CampaignData) => {
          // Buscar metadados da campanha
          const campaignMeta = campaignsData.find(c => c.name === item.campaign_name);

          // Desconsiderar se for "Não enviado"
          if (campaignMeta?.month === "Não enviado") return null;

          const monthVal = campaignMeta?.month || "Unknown";

          // Extrair mês e disparo para ordenação
          let monthName = "Unknown";
          let shotNumber = 0;
          if (monthVal.includes('-')) {
            const parts = monthVal.split('-');
            shotNumber = parseInt(parts[0].replace('D', ''));
            monthName = parts[1];
          }

          // Nome agrupado (removendo .01, .02, etc)
          const groupedName = item.campaign_name.replace(/\.\d+$/, '').trim();

          return {
            id: item.id,
            name: item.campaign_name,
            groupedName,
            month: monthVal,
            monthName,
            shotNumber,
            salesIA: item.sales_ia || 0,
            salesManual: item.sales_manual || 0,
            totalSales: (item.sales_ia || 0) + (item.sales_manual || 0),
            revenue: ((item.sales_ia || 0) + (item.sales_manual || 0)) * 149.9,
            clients: item.total_clients || 0,
            responses: item.total_hablla_responses || 0,
            conversionSalesClients: item.conversion_sales_clients || "0",
            conversionSalesResponses: item.conversion_sales_responses || "0",
            date: item.date_range
          };
        }).filter(Boolean);

        // Ordenar dados por mês e depois por disparo
        processed.sort((a: any, b: any) => {
          const monthDiff = (monthOrder[a.monthName] || 0) - (monthOrder[b.monthName] || 0);
          if (monthDiff !== 0) return monthDiff;
          return a.shotNumber - b.shotNumber;
        });

        setData(processed);
        setFilteredData(processed);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  useEffect(() => {
    let result = [...data];

    if (filterMode === 'month') {
      if (selectedMonth !== 'all') {
        result = result.filter(d => d.monthName === selectedMonth);
      }
    } else if (filterMode === 'month_shots') {
      if (selectedSubMonth !== 'all') {
        result = result.filter(d => d.monthName === selectedSubMonth);
      }
    } else if (filterMode === 'individual') {
      if (selectedCampaigns.length > 0) {
        result = result.filter(d => selectedCampaigns.includes(d.name));
      }
    } else if (filterMode === 'grouped') {
      // Agrupar por groupedName mantendo a ordem da primeira ocorrência
      const orderedGroups: any[] = [];
      const groups: Record<string, any> = {};

      result.forEach(item => {
        if (!groups[item.groupedName]) {
          groups[item.groupedName] = { ...item, name: item.groupedName, count: 0 };
          groups[item.groupedName].salesIA = 0;
          groups[item.groupedName].salesManual = 0;
          groups[item.groupedName].totalSales = 0;
          groups[item.groupedName].revenue = 0;
          groups[item.groupedName].clients = 0;
          groups[item.groupedName].responses = 0;
          orderedGroups.push(groups[item.groupedName]);
        }
        groups[item.groupedName].salesIA += item.salesIA;
        groups[item.groupedName].salesManual += item.salesManual;
        groups[item.groupedName].totalSales += item.totalSales;
        groups[item.groupedName].revenue += item.revenue;
        groups[item.groupedName].clients += item.clients;
        groups[item.groupedName].responses += item.responses;
        groups[item.groupedName].count += 1;
      });

      // Recalcular as conversões para o grupo após agrupar tudo
      orderedGroups.forEach(group => {
        group.conversionSalesClients = group.clients > 0
          ? ((group.totalSales / group.clients) * 100).toFixed(2)
          : "0";
        // Conversão IA: Total de Vendas IA / Total de Respostas * 100
        group.conversionSalesResponses = group.responses > 0
          ? ((group.salesIA / group.responses) * 100).toFixed(2)
          : "0";
      });

      result = orderedGroups;
    }

    setFilteredData(result);
  }, [filterMode, selectedMonth, selectedSubMonth, selectedCampaigns, data]);

  const totals = filteredData.reduce((acc, curr) => ({
    revenue: acc.revenue + curr.revenue,
    sales: acc.sales + curr.totalSales,
    clients: acc.clients + curr.clients,
    responses: acc.responses + curr.responses
  }), { revenue: 0, sales: 0, clients: 0, responses: 0 });

  const availableMonths = [...new Set(data.map(d => d.monthName))].sort((a, b) => monthOrder[a] - monthOrder[b]);

  let activeMonth = 'all';
  if (filterMode === 'month') {
    activeMonth = selectedMonth;
  } else if (filterMode === 'month_shots') {
    activeMonth = selectedSubMonth;
  }

  const calcAverage = (key: string, isStringPercent = false) => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((acc, curr) => {
      let val = 0;
      if (isStringPercent) {
        val = parseFloat(curr[key]) || 0;
      } else {
        val = curr[key] || 0;
      }
      return acc + val;
    }, 0);
    return sum / filteredData.length;
  };

  const avgConvVendas = calcAverage('conversionSalesClients', true);
  const avgConvIA = calcAverage('conversionSalesResponses', true);
  const avgSales = calcAverage('totalSales');
  const avgRevenue = calcAverage('revenue');

  let trends: { revenue: string | null; sales: string | null; ticket: string | null; clients: string | null } = {
    revenue: null,
    sales: null,
    ticket: null,
    clients: null
  };

  if (activeMonth !== 'all') {
    const currentIndex = availableMonths.indexOf(activeMonth);
    if (currentIndex > 0) {
      const prevMonth = availableMonths[currentIndex - 1];
      const prevMonthData = data.filter(d => d.monthName === prevMonth);
      const prevTotals = prevMonthData.reduce((acc, curr) => ({
        revenue: acc.revenue + curr.revenue,
        sales: acc.sales + curr.totalSales,
        clients: acc.clients + curr.clients,
        responses: acc.responses + curr.responses
      }), { revenue: 0, sales: 0, clients: 0, responses: 0 });

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
        clients: calcTrend(totals.clients, prevTotals.clients)
      };
    }
  }

  if (isLoading) return <div className="p-8 text-center">Carregando Dashboard...</div>;

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
              <SelectItem value="individual">Campanhas Individuais</SelectItem>
              <SelectItem value="grouped">Campanhas Agrupadas</SelectItem>
              <SelectItem value="month">Por Mês</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filterMode === 'month' && (
          <div className="flex-1">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Mês</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="bg-card border-none shadow-sm h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Meses</SelectItem>
                {availableMonths.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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
                {availableMonths.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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
            />
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
            <ResponsiveContainer width="100%" height="100%">
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

        {/* Distribution */}
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
      </div>

      {/* Average Stats Cards */}
      <h3 className="text-lg font-bold mb-4">Médias das Campanhas Filtradas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
      </div>

      {/* Recent Campaigns Table */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Campanhas</CardTitle>
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
                {filteredData.map((item, i) => (
                  <tr key={i} className="hover:bg-zinc-50/5 transition-colors">
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const convVendas = String(data.conversionSalesClients).replace('%', '').trim();
    const convIA = String(data.conversionSalesResponses).replace('%', '').trim();

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
          Conversão Vendas: <span className="font-medium text-white">{convVendas}%</span>
        </p>
        <p className="text-indigo-400/80">
          Conversão IA: <span className="font-medium text-white">{convIA}%</span>
        </p>
      </div>
    );
  }
  return null;
};