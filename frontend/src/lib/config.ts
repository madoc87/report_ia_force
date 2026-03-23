/**
 * config.ts — Módulo central de configuração pública do Frontend.
 *
 * Em produção (Docker/EasyPanel), lê /runtime-config.json gerado pelo env.sh
 * antes do start do Nginx. Isso garante que variáveis dinâmicas (como VITE_API_URL)
 * nunca sejam embutidas no build estático, permitindo trocas sem re-build de imagem.
 *
 * Em desenvolvimento local, a constante faz fallback para import.meta.env (arquivo .env).
 *
 * ATENÇÃO: apenas variáveis PÚBLICAS (não-secretas) devem vir deste arquivo.
 */

interface RuntimeConfig {
  VITE_API_URL: string;
}

let resolvedConfig: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (resolvedConfig) return resolvedConfig;

  try {
    const res = await fetch('/runtime-config.json', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      // Valida que a URL vinda do JSON é uma string não-vazia antes de confiar nela
      if (json?.VITE_API_URL && typeof json.VITE_API_URL === 'string' && json.VITE_API_URL.trim() !== '') {
        resolvedConfig = { VITE_API_URL: json.VITE_API_URL.trim() };
        return resolvedConfig;
      }
    }
  } catch {
    // Se o arquivo não existir (ambiente de dev local), cai no fallback abaixo
  }

  // Fallback: variável de ambiente Vite (funciona localmente com .env)
  resolvedConfig = {
    VITE_API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3005',
  };
  return resolvedConfig;
}

/**
 * Retorna a BASE_URL já carregada. Deve ser chamada apenas após `loadRuntimeConfig()`.
 * No componente raiz do App, carregue com `await loadRuntimeConfig()` antes do primeiro fetch.
 */
export function getBaseUrl(): string {
  return resolvedConfig?.VITE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:3005';
}
