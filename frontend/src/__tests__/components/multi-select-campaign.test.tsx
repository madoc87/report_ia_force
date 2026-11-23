/**
 * Testes do select de várias campanhas: a busca digitada é mantida após cada seleção
 * e "Selecionar Todas" marca apenas as opções exibidas pela busca.
 */
import { useState } from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiSelectCampaign, CampaignOption } from '@/components/ui/multi-select-campaign';

beforeAll(() => {
  // O cmdk rola o item ativo para a área visível; o jsdom não implementa scrollIntoView
  Element.prototype.scrollIntoView = () => {};
});

const options: CampaignOption[] = [
  ...Array.from({ length: 3 }, (_, i) => ({
    name: `HB REFIL VENC JAN-JUL26.0${i + 1}`, date: '10/01/2026', month: 'Janeiro',
  })),
  { name: 'Outra Campanha', date: '05/02/2026', month: 'Fevereiro' },
];

let lastSelected: string[] = [];

const Wrapper = ({ initial = [] as string[] }) => {
  const [selected, setSelected] = useState<string[]>(initial);
  lastSelected = selected;
  return <MultiSelectCampaign options={options} selected={selected} onChange={setSelected} allowCustom={false} />;
};

const openAndSearch = (text: string) => {
  fireEvent.click(screen.getByRole('combobox'));
  const input = screen.getByPlaceholderText(/Buscar campanha/);
  fireEvent.change(input, { target: { value: text } });
  return input as HTMLInputElement;
};

describe('MultiSelectCampaign', () => {
  it('mantém a busca digitada após selecionar um item', () => {
    render(<Wrapper />);
    const input = openAndSearch('JAN-JUL26');

    fireEvent.click(screen.getByText('HB REFIL VENC JAN-JUL26.01'));

    expect(lastSelected).toEqual(['HB REFIL VENC JAN-JUL26.01']);
    expect(input.value).toBe('JAN-JUL26');
    expect(screen.getByText('HB REFIL VENC JAN-JUL26.02')).toBeInTheDocument();
  });

  it('"Selecionar Todas" com busca marca só as opções exibidas e preserva as já selecionadas', () => {
    render(<Wrapper initial={['Outra Campanha']} />);
    openAndSearch('JAN-JUL26.');

    fireEvent.click(screen.getByText('Selecionar Todas'));

    expect(lastSelected).toEqual([
      'Outra Campanha',
      'HB REFIL VENC JAN-JUL26.01', 'HB REFIL VENC JAN-JUL26.02', 'HB REFIL VENC JAN-JUL26.03',
    ]);

    // Clicar de novo desmarca só as exibidas
    fireEvent.click(screen.getByText('Selecionar Todas'));
    expect(lastSelected).toEqual(['Outra Campanha']);
  });

  it('"Selecionar Todas" sem busca marca todas as campanhas', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('combobox'));

    fireEvent.click(screen.getByText('Selecionar Todas'));

    expect(lastSelected).toHaveLength(options.length);
  });
});
