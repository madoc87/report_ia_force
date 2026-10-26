import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorAlert } from '@/components/error-alert';

describe('ErrorAlert', () => {
  test('mostra apenas o resumo até o usuário pedir os detalhes', () => {
    render(
      <ErrorAlert
        error={{
          title: 'Erro ao atualizar a campanha',
          message: 'A Hablla recusou o acesso (HTTP 401).',
          code: 'HABLLA_AUTH',
          details: { campaign: 'Campanha X', stage: 'Busca dos cards na Hablla', hint: 'Verifique o token.' },
        }}
      />
    );

    expect(screen.getByText('Erro ao atualizar a campanha')).toBeInTheDocument();
    expect(screen.getByText('A Hablla recusou o acesso (HTTP 401).')).toBeInTheDocument();
    expect(screen.queryByText('Campanha X')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Ver detalhes'));

    expect(screen.getByText('Campanha X')).toBeInTheDocument();
    expect(screen.getByText('HABLLA_AUTH')).toBeInTheDocument();
    expect(screen.getByText('Como resolver')).toBeInTheDocument();
  });

  test('lista as campanhas com falha e o motivo de cada uma', () => {
    render(
      <ErrorAlert
        error={{
          message: '1 de 2 campanhas atualizadas; 1 com erro.',
          variant: 'warning',
          items: [{ label: 'Campanha Y', message: 'A Hablla não respondeu em 30 segundos.', code: 'HABLLA_TIMEOUT' }],
        }}
      />
    );

    expect(screen.getByText('Atenção')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver detalhes'));
    expect(screen.getByText('Campanha Y')).toBeInTheDocument();
    expect(screen.getByText(/não respondeu em 30 segundos/)).toBeInTheDocument();
  });

  test('não mostra "Ver detalhes" quando não há detalhes', () => {
    render(<ErrorAlert error={{ message: 'Selecione ao menos uma campanha.' }} />);
    expect(screen.queryByText('Ver detalhes')).not.toBeInTheDocument();
  });
});
