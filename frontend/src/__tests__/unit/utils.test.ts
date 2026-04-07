/**
 * Testes unitários para funções utilitárias.
 */
import { describe, test, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn() - Merge de classes Tailwind', () => {
  test('combina múltiplas classes', () => {
    const result = cn('text-white', 'bg-black');
    expect(result).toContain('text-white');
    expect(result).toContain('bg-black');
  });

  test('resolve conflitos de classes Tailwind (última vence)', () => {
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
  });

  test('lida com valores condicionais', () => {
    const isActive = true;
    const result = cn('base-class', isActive && 'active-class');
    expect(result).toContain('base-class');
    expect(result).toContain('active-class');
  });

  test('ignora valores falsy', () => {
    const result = cn('base', false, null, undefined, '', 'extra');
    expect(result).toBe('base extra');
  });

  test('retorna string vazia sem argumentos', () => {
    const result = cn();
    expect(result).toBe('');
  });
});
