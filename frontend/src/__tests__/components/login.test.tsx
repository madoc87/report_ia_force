/**
 * Testes de componente para Login.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from '@/components/login';

// Mock do módulo de config
vi.mock('@/lib/config', () => ({
  getBaseUrl: () => 'http://localhost:3005',
  loadRuntimeConfig: vi.fn(),
}));

// Mock do mode-toggle para evitar dependência de ThemeProvider
vi.mock('@/components/mode-toggle', () => ({
  ModeToggle: () => <button data-testid="mode-toggle">Toggle</button>,
}));

// Mock do asset SVG
vi.mock('@/assets/dash-report.svg', () => ({
  default: 'mock-logo.svg',
}));

describe('Login Component', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
    vi.restoreAllMocks();
  });

  test('renderiza título "Report IA Force"', () => {
    render(<Login onLogin={mockOnLogin} />);
    expect(screen.getByText('Report IA Force')).toBeInTheDocument();
  });

  test('renderiza descrição do login', () => {
    render(<Login onLogin={mockOnLogin} />);
    expect(screen.getByText(/Digite seu e-mail e senha/i)).toBeInTheDocument();
  });

  test('exibe campo de email com placeholder', () => {
    render(<Login onLogin={mockOnLogin} />);
    const emailInput = screen.getByPlaceholderText('seu@email.com');
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('exibe campo de senha', () => {
    render(<Login onLogin={mockOnLogin} />);
    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('botão "Acessar Sistema" está presente e habilitado', () => {
    render(<Login onLogin={mockOnLogin} />);
    const button = screen.getByRole('button', { name: /Acessar Sistema/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  test('mostra "Autenticando..." ao submeter', async () => {
    // Simula fetch que demora
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    render(<Login onLogin={mockOnLogin} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'admin@teste.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'admin123');
    await user.click(screen.getByRole('button', { name: /Acessar Sistema/i }));

    expect(screen.getByText('Autenticando...')).toBeInTheDocument();
  });

  test('exibe erro quando API retorna 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Credenciais incorretas.' }),
    }));

    render(<Login onLogin={mockOnLogin} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'admin@teste.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'senhaerrada');
    await user.click(screen.getByRole('button', { name: /Acessar Sistema/i }));

    await waitFor(() => {
      expect(screen.getByText('Credenciais incorretas.')).toBeInTheDocument();
    });
  });

  test('chama onLogin com token e user quando login bem-sucedido', async () => {
    const mockUser = { id: 1, name: 'Admin', email: 'admin@teste.com', role: 'admin' };
    
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token-123', user: mockUser }),
    }));

    render(<Login onLogin={mockOnLogin} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'admin@teste.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'admin123');
    await user.click(screen.getByRole('button', { name: /Acessar Sistema/i }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith('jwt-token-123', mockUser);
    });
  });

  test('labels de email e senha estão presentes', () => {
    render(<Login onLogin={mockOnLogin} />);
    expect(screen.getByText('E-mail')).toBeInTheDocument();
    expect(screen.getByText('Senha')).toBeInTheDocument();
  });
});
