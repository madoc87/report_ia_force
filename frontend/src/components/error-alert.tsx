import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardCopy, Check, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ErrorDetails, UiError, UiErrorItem } from '@/lib/api';

// Rótulos amigáveis para os campos técnicos enviados pelo backend
const DETAIL_LABELS: Record<string, string> = {
  code: 'Código',
  status: 'Status HTTP',
  campaign: 'Campanha',
  stage: 'Etapa',
  httpStatus: 'Status HTTP da Hablla',
  page: 'Página',
  totalPages: 'Total de páginas',
  attempts: 'Tentativas',
  endpoint: 'Endpoint',
  boardId: 'Quadro',
  cause: 'Causa',
  responseBody: 'Resposta da Hablla',
  receivedKeys: 'Campos recebidos',
  cardsReceived: 'Cards recebidos',
  hint: 'Como resolver',
  timestamp: 'Horário',
  startedAt: 'Início',
  scheduledTime: 'Horário agendado',
  total: 'Total de campanhas',
  updated: 'Atualizadas',
};

// Campos exibidos fora da lista (ou estruturas tratadas à parte)
const HIDDEN_KEYS = new Set(['failures']);
const BREAK_ANYWHERE_KEYS = new Set(['endpoint', 'responseBody', 'receivedKeys']);

const formatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if ((key === 'timestamp' || key === 'startedAt') && typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toLocaleString('pt-BR');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function DetailsTable({ details }: { details?: ErrorDetails & { code?: unknown } }) {
  if (!details) return null;
  const entries = Object.entries(details).filter(([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return null;

  // "Como resolver" sempre por último, em destaque
  entries.sort(([a], [b]) => (a === 'hint' ? 1 : 0) - (b === 'hint' ? 1 : 0));

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground whitespace-nowrap">{DETAIL_LABELS[key] || key}</dt>
          <dd className={cn(
            // Endpoints e respostas brutas não têm espaços: só eles quebram em qualquer caractere
            BREAK_ANYWHERE_KEYS.has(key) ? 'break-all' : 'break-words',
            key === 'hint' ? 'font-medium text-foreground' : 'font-mono text-foreground/80'
          )}>
            {formatValue(key, value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ItemsList({ items }: { items: UiErrorItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="rounded-md border border-border/60 bg-background/60 p-2">
          <p className="text-xs font-semibold text-foreground">{item.label}</p>
          <p className="text-xs text-foreground/80">
            {item.message}
            {item.code && <span className="ml-1 font-mono text-muted-foreground">({item.code})</span>}
          </p>
          {item.details && (
            <div className="mt-1">
              <DetailsTable details={item.details} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// Converte o campo `failures` das notificações de sincronização em itens de lista
export const failuresToItems = (details?: ErrorDetails | null): UiErrorItem[] => {
  const failures = (details as any)?.failures;
  if (!Array.isArray(failures)) return [];
  return failures.map((f: any) => ({
    label: f.campaign || 'Campanha',
    message: f.message || 'Erro desconhecido',
    code: f.code,
    details: f.details,
  }));
};

interface ErrorDetailsPanelProps {
  code?: string;
  status?: number;
  details?: ErrorDetails | null;
  items?: UiErrorItem[];
}

// Painel recolhível com os detalhes técnicos e botão para copiar (útil para enviar ao suporte)
export function ErrorDetailsPanel({ code, status, details, items }: ErrorDetailsPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const allItems = [...(items || []), ...failuresToItems(details)];
  const hasDetails = Boolean(code || status || (details && Object.keys(details).some(k => !HIDDEN_KEYS.has(k))) || allItems.length > 0);
  if (!hasDetails) return null;

  const copyDetails = () => {
    const payload = JSON.stringify({ code, status, details, items }, null, 2);
    navigator.clipboard?.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { });
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? 'Ocultar detalhes' : 'Ver detalhes'}
        {allItems.length > 0 && !open && <span className="text-muted-foreground">({allItems.length})</span>}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-md bg-muted/50 p-3 text-foreground">
          <DetailsTable details={{ ...(code ? { code } : {}), ...(status ? { status } : {}), ...(details || {}) }} />
          {allItems.length > 0 && <ItemsList items={allItems} />}
          <button
            type="button"
            onClick={copyDetails}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <ClipboardCopy className="h-3 w-3" />}
            {copied ? 'Copiado' : 'Copiar detalhes'}
          </button>
        </div>
      )}
    </div>
  );
}

interface ErrorAlertProps {
  error: UiError;
  className?: string;
}

// Alerta de erro com resumo visível e detalhes técnicos sob demanda
export function ErrorAlert({ error, className }: ErrorAlertProps) {
  const isWarning = error.variant === 'warning';
  const Icon = isWarning ? AlertTriangle : XCircle;

  return (
    <Alert
      variant={isWarning ? 'default' : 'destructive'}
      className={cn(isWarning && 'border-amber-500/50 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500', className)}
    >
      <Icon className="h-4 w-4" />
      <AlertTitle>{error.title || (isWarning ? 'Atenção' : 'Erro')}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        <ErrorDetailsPanel code={error.code} status={error.status} details={error.details} items={error.items} />
      </AlertDescription>
    </Alert>
  );
}
