/**
 * Testes de componente para Sidebar.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/sidebar';

// Mock do mode-toggle
vi.mock('@/components/mode-toggle', () => ({
  ModeToggle: () => <button data-testid="mode-toggle">Toggle</button>,
}));

// Mock do asset SVG
vi.mock('@/assets/dash-report.svg', () => ({
  default: 'mock-logo.svg',
}));

describe('Sidebar Component', () => {
  const mockSetActiveTab = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnLogout = vi.fn();

  const defaultProps = {
    activeTab: 'dashboard',
    setActiveTab: mockSetActiveTab,
    isOpen: true,
    onClose: mockOnClose,
    onLogout: mockOnLogout,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renderiza o título "Report IA Force"', () => {
    render(<Sidebar {...defaultProps} user={{ role: 'admin', name: 'Admin' }} />);
    expect(screen.getByText('Report IA Force')).toBeInTheDocument();
  });

  test('Dashboard e Relatórios visíveis para todos os roles', () => {
    render(<Sidebar {...defaultProps} user={{ role: 'user', name: 'User' }} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  test('Configurações visível para admin', () => {
    render(<Sidebar {...defaultProps} user={{ role: 'admin', name: 'Admin' }} />);
    expect(screen.getByText('Configurações')).toBeInTheDocument();
  });

  test('Configurações NÃO visível para user comum', () => {
    render(<Sidebar {...defaultProps} user={{ role: 'user', name: 'User' }} />);
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
  });

  test('Configurações NÃO visível para gestor', () => {
    render(<Sidebar {...defaultProps} user={{ role: 'gestor', name: 'Gestor' }} />);
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
  });

  test('menus admin-only NÃO aparece para user', () => {
    render(<Sidebar {...defaultProps} user={{ role: 'user', name: 'User' }} />);
    expect(screen.queryByText('Vendas')).not.toBeInTheDocument();
    expect(screen.queryByText('Produtos')).not.toBeInTheDocument();
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Análises')).not.toBeInTheDocument();
  });

  test('click em Dashboard chama setActiveTab("dashboard")', async () => {
    render(<Sidebar {...defaultProps} activeTab="relatorios" user={{ role: 'admin', name: 'Admin' }} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Dashboard'));
    expect(mockSetActiveTab).toHaveBeenCalledWith('dashboard');
  });

  test('click em Relatórios chama setActiveTab("relatorios")', async () => {
    render(<Sidebar {...defaultProps} user={{ role: 'admin', name: 'Admin' }} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Relatórios'));
    expect(mockSetActiveTab).toHaveBeenCalledWith('relatorios');
  });

  test('click em menu chama onClose (para mobile)', async () => {
    render(<Sidebar {...defaultProps} activeTab="relatorios" user={{ role: 'admin', name: 'Admin' }} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Dashboard'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('botão Sair está presente e funcional', async () => {
    render(<Sidebar {...defaultProps} user={{ role: 'admin', name: 'Admin' }} />);
    const user = userEvent.setup();

    const logoutBtn = screen.getByText('Sair');
    expect(logoutBtn).toBeInTheDocument();

    await user.click(logoutBtn);
    expect(mockOnLogout).toHaveBeenCalled();
  });

  test('menus desabilitados (Vendas, Produtos, etc.) não chamam setActiveTab', async () => {
    render(<Sidebar {...defaultProps} user={{ role: 'admin', name: 'Admin' }} />);
    const user = userEvent.setup();

    const vendasBtn = screen.getByText('Vendas');
    await user.click(vendasBtn);
    // setActiveTab NÃO deve ter sido chamado, pois Vendas está desabilitado
    expect(mockSetActiveTab).not.toHaveBeenCalledWith('vendas');
  });
});
