// Utilitários de datas e métricas do Dashboard.
// As datas de disparo vêm do cadastro de campanhas no formato dd/MM/yyyy.

export const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export interface ShotDate {
  day: number;
  month: number; // 1-12
  year: number;
}

export const parseShotDate = (value?: string | null): ShotDate | null => {
  if (!value) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { day: d, month: m, year: y };
};

const pad = (n: number) => String(n).padStart(2, '0');

// Chave ordenável "YYYY-MM": considera o ano para não misturar, por exemplo, Out/2025 com Out/2026
export const toMonthKey = (year: number, month: number) => `${year}-${pad(month)}`;

// Mês fiscal: o próprio mês da data de disparo (dia 01 ao último dia)
export const getFiscalMonthKey = (dateStr?: string | null): string | null => {
  const date = parseShotDate(dateStr);
  return date ? toMonthKey(date.year, date.month) : null;
};

// Mês comercial: do dia 21 ao dia 20; a partir do dia 21 a data pertence ao mês seguinte (com virada de ano)
export const getCommercialMonthKey = (dateStr?: string | null): string | null => {
  const date = parseShotDate(dateStr);
  if (!date) return null;
  if (date.day >= 21) {
    return date.month === 12 ? toMonthKey(date.year + 1, 1) : toMonthKey(date.year, date.month + 1);
  }
  return toMonthKey(date.year, date.month);
};

// "2026-10" → "Out/2026"
export const formatMonthKey = (key: string): string => {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_LABELS[month - 1] || '?'}/${year}`;
};

// Mês de calendário anterior: "2026-01" → "2025-12"
export const getPreviousMonthKey = (key: string): string => {
  const [year, month] = key.split('-').map(Number);
  return month === 1 ? toMonthKey(year - 1, 12) : toMonthKey(year, month - 1);
};

// Valor ordenável de uma data dd/MM/yyyy (yyyymmdd); datas inválidas vão para o fim
export const shotDateSortValue = (dateStr?: string | null): number => {
  const date = parseShotDate(dateStr);
  return date ? date.year * 10000 + date.month * 100 + date.day : Number.MAX_SAFE_INTEGER;
};

export interface ShotDayOption {
  name: string; // dd/MM/yyyy (valor selecionado)
  date: string; // dia da semana
  month: string; // quantidade de campanhas
}

// Lista de dias de disparo a partir do campo "Data de Disparo" das campanhas cadastradas (mais recentes primeiro)
export const buildShotDayOptions = (campaigns: { date_only?: string | null }[]): ShotDayOption[] => {
  const counts = new Map<string, number>();
  campaigns.forEach(c => {
    const date = parseShotDate(c.date_only);
    if (!date) return;
    const key = `${pad(date.day)}/${pad(date.month)}/${date.year}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .sort(([a], [b]) => shotDateSortValue(b) - shotDateSortValue(a))
    .map(([day, count]) => {
      const date = parseShotDate(day)!;
      const weekday = WEEKDAYS[new Date(date.year, date.month - 1, date.day).getDay()];
      return { name: day, date: weekday, month: `${count} ${count === 1 ? 'campanha' : 'campanhas'}` };
    });
};

// Normaliza uma data dd/MM/yyyy (aceita dia/mês sem zero à esquerda)
export const normalizeShotDate = (dateStr?: string | null): string | null => {
  const date = parseShotDate(dateStr);
  return date ? `${pad(date.day)}/${pad(date.month)}/${date.year}` : null;
};

// Conversões calculadas a partir dos números brutos (mesma fórmula do backend):
// Conv. Vendas = (Vendas IA + Vendas Manual) / Clientes × 100
// Conv. IA     = (Vendas IA + Vendas Manual) / Respostas × 100
export const computeConversions = (totalSales: number, clients: number, responses: number) => ({
  conversionSalesClients: clients > 0 ? (totalSales / clients) * 100 : 0,
  conversionSalesResponses: responses > 0 ? (totalSales / responses) * 100 : 0,
});

// Converte valores monetários salvos como texto ("R$ 1.234,50") em número
export const parseCurrency = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const clean = value.replace(/R\$/g, '').replace(/\s/g, '').trim();
  if (!clean) return 0;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
