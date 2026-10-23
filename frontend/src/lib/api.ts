// Tratamento padronizado das respostas de autenticação/autorização do backend.
// 401 = sessão inválida/expirada/revogada → encerra a sessão local.
// 403 = sessão válida, mas sem permissão (ou troca de senha obrigatória pendente) → não desloga.

export const PASSWORD_CHANGE_REQUIRED_EVENT = 'auth:password-change-required';

interface ApiErrorBody {
  code?: string;
  message?: string;
}

const readErrorBody = async (response: Response): Promise<ApiErrorBody> =>
  response.clone().json().catch(() => ({}));

export async function handleAuthErrors(response: Response, onLogout?: () => void): Promise<Response> {
  if (response.status === 401) {
    const data = await readErrorBody(response);
    onLogout?.();
    throw new Error(data.message || 'Sessão expirada. Por favor, faça login novamente.');
  }

  if (response.status === 403) {
    const data = await readErrorBody(response);
    if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_REQUIRED_EVENT));
    }
    throw new Error(data.message || 'Você não tem permissão para realizar esta ação.');
  }

  return response;
}
