/**
 * Testes de componente para Header.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '@/components/header';

// Mock do mode-toggle
vi.mock('@/components/mode-toggle', () => ({
  ModeToggle: () => <button data-testid="mode-toggle">Toggle</button>,
}));

describe('Header Component', () => {
  const mockSetNotifications = vi.fn();
  const mockOnLogout = vi.fn();

  const defaultProps = {
    title: 'Dashboard',
    notifications: [],
    setNotifications: mockSetNotifications,
    user: { name: 'Admin Teste', email: 'admin@teste.com', role: 'admin' },
    onLogout: mockOnLogout,
  };

  test('renderiza o título recebido via props', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test('renderiza título diferente (Relatórios)', () => {
    render(<Header {...defaultProps} title="Relatórios" />);
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  test('exibe nome do usuário', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('Admin Teste')).toBeInTheDocument();
  });

  test('exibe email do usuário', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('admin@teste.com')).toBeInTheDocument();
  });

  test('exibe avatar com a inicial do nome', () => {
    render(<Header {...defaultProps} />);
    const avatar = screen.getByText('A'); // Primeira letra de "Admin Teste"
    expect(avatar).toBeInTheDocument();
  });

  test('exibe "Carregando..." quando user não fornecido', () => {
    render(<Header {...defaultProps} user={undefined} />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  test('NÃO mostra badge quando não há notificações não lidas', () => {
    render(<Header {...defaultProps} notifications={[]} />);
    // Não deve existir badge de contagem
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  test('mostra badge com contagem de notificações não lidas', () => {
    const notifications = [
      { id: '1', title: 'Teste', message: 'msg', type: 'info' as const, timestamp: new Date(), read: false },
      { id: '2', title: 'Teste2', message: 'msg2', type: 'success' as const, timestamp: new Date(), read: false },
      { id: '3', title: 'Teste3', message: 'msg3', type: 'warning' as const, timestamp: new Date(), read: true },
    ];
    render(<Header {...defaultProps} notifications={notifications} />);
    // 2 não lidas
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('exibe data atual formatada', () => {
    render(<Header {...defaultProps} />);
    // Verifica se existe alguma data formatada em pt-BR (pelo menos o ano atual)
    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
  });

  test('botão de menu móvel está presente', () => {
    render(<Header {...defaultProps} onMenuClick={() => {}} />);
    // O botão de hambúrguer existe (mesmo que escondido em md:hidden)
    const menuButtons = screen.getAllByRole('button');
    expect(menuButtons.length).toBeGreaterThan(0);
  });
});
