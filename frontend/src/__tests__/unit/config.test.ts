/**
 * Testes unitários para o módulo config.ts (loadRuntimeConfig / getBaseUrl).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

// Precisamos re-importar o módulo a cada teste para limpar o cache
describe('Config Module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test('getBaseUrl retorna fallback localhost quando config não carregada', async () => {
    // Mock fetch para falhar (simula ambiente dev sem runtime-config.json)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Not found')));
    
    const { loadRuntimeConfig, getBaseUrl } = await import('@/lib/config');
    await loadRuntimeConfig();
    
    const url = getBaseUrl();
    expect(url).toBe('http://localhost:3005');
  });

  test('loadRuntimeConfig usa runtime-config.json quando disponível', async () => {
    const mockConfig = { VITE_API_URL: 'https://api.production.com' };
    
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    }));

    const { loadRuntimeConfig, getBaseUrl } = await import('@/lib/config');
    await loadRuntimeConfig();

    const url = getBaseUrl();
    expect(url).toBe('https://api.production.com');
  });

  test('loadRuntimeConfig ignora runtime-config.json com URL vazia', async () => {
    const mockConfig = { VITE_API_URL: '' };
    
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    }));

    const { loadRuntimeConfig, getBaseUrl } = await import('@/lib/config');
    await loadRuntimeConfig();

    const url = getBaseUrl();
    // Deve cair no fallback
    expect(url).toBe('http://localhost:3005');
  });

  test('loadRuntimeConfig cacheia resultado (não faz fetch 2x)', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Not found'));
    vi.stubGlobal('fetch', mockFetch);

    const { loadRuntimeConfig } = await import('@/lib/config');
    await loadRuntimeConfig();
    await loadRuntimeConfig(); // Segunda chamada

    // Fetch deve ter sido chamado apenas 1x (segunda usa cache)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
