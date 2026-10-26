// Tratamento padronizado das respostas de autenticação/autorização do backend.
// 401 = sessão inválida/expirada/revogada → encerra a sessão local.
// 403 = sessão válida, mas sem permissão (ou troca de senha obrigatória pendente) → não desloga.

export const PASSWORD_CHANGE_REQUIRED_EVENT = 'auth:password-change-required';

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const readErrorBody = async (response: Response): Promise<ApiErrorBody> =>
  response.clone().json().catch(() => ({}));

export async function handleAuthErrors(response: Response, onLogout?: () => void): Promise<Response> {
  if (response.status === 401) {
    const data = await readErrorBody(response);
    onLogout?.();
    throw new ApiError(data.message || 'Sessão expirada. Por favor, faça login novamente.', { code: data.code, status: 401 });
  }

  if (response.status === 403) {
    const data = await readErrorBody(response);
    if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT));
    }
    throw new ApiError(data.message || 'Você não tem permissão para realizar esta ação.', { code: data.code, status: 403 });
  }

  return response;
}

// --- Erros com detalhes ---
// O backend responde { code, message, details }: `message` é o resumo exibido ao usuário,
// `code` e `details` (campanha, etapa, status HTTP, dica...) ficam disponíveis em "Ver detalhes".

export type ErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
  code?: string;
  status?: number;
  details?: ErrorDetails;

  constructor(message: string, options: { code?: string; status?: number; details?: ErrorDetails } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

// Monta um ApiError a partir de uma resposta HTTP sem sucesso
export async function toApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
  const data = await readErrorBody(response);
  return new ApiError(data.message || fallbackMessage, {
    code: data.code || `HTTP_${response.status}`,
    status: response.status,
    details: data.details,
  });
}

// Item de uma lista de falhas (ex.: campanhas que não foram atualizadas)
export interface UiErrorItem {
  label: string;
  message: string;
  code?: string;
  details?: ErrorDetails;
}

// Erro pronto para exibição: resumo + detalhes opcionais
export interface UiError {
  title?: string;
  message: string;
  code?: string;
  status?: number;
  details?: ErrorDetails;
  items?: UiErrorItem[];
  variant?: 'error' | 'warning';
}

// Converte qualquer erro capturado em UiError
export function toUiError(error: unknown, fallbackMessage = 'Ocorreu um erro inesperado.'): UiError {
  if (error instanceof ApiError) {
    return { message: error.message, code: error.code, status: error.status, details: error.details };
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return {
      message: 'Não foi possível conectar ao servidor da aplicação.',
      code: 'NETWORK_ERROR',
      details: { cause: error.message, hint: 'Verifique sua conexão e se o backend está no ar.' },
    };
  }
  if (error instanceof Error) {
    return { message: error.message || fallbackMessage };
  }
  return { message: fallbackMessage };
}

// Registra o erro no console de forma agrupada e legível (contexto, código e detalhes)
export function logError(context: string, error: unknown) {
  const uiError = toUiError(error);
  console.groupCollapsed(`[Report IA Force] ${context}: ${uiError.message}${uiError.code ? ` (${uiError.code})` : ''}`);
  if (uiError.status) console.error('Status HTTP:', uiError.status);
  if (uiError.details) console.error('Detalhes:', uiError.details);
  console.error(error);
  console.groupEnd();
}
