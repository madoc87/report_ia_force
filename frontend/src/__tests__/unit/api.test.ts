import { describe, it, expect, vi } from 'vitest';
import { handleAuthErrors, PASSWORD_CHANGE_REQUIRED_EVENT } from '@/lib/api';

const jsonResponse = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('handleAuthErrors', () => {
  it('devolve a resposta quando não é erro de autenticação', async () => {
    const onLogout = vi.fn();
    const response = jsonResponse(200, { ok: true });

    await expect(handleAuthErrors(response, onLogout)).resolves.toBe(response);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('encerra a sessão em 401 e repassa a mensagem do servidor', async () => {
    const onLogout = vi.fn();

    await expect(
      handleAuthErrors(jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Sessão expirada.' }), onLogout)
    ).rejects.toThrow('Sessão expirada.');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('não encerra a sessão em 403 por falta de permissão', async () => {
    const onLogout = vi.fn();

    await expect(
      handleAuthErrors(jsonResponse(403, { code: 'FORBIDDEN_ROLE', message: 'Acesso negado.' }), onLogout)
    ).rejects.toThrow('Acesso negado.');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('dispara o evento de troca de senha obrigatória', async () => {
    const listener = vi.fn();
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, listener);

    await expect(
      handleAuthErrors(jsonResponse(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Troque a senha.' }))
    ).rejects.toThrow('Troque a senha.');
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, listener);
  });
});
