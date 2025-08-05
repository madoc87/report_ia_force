import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { ModeToggle } from '@/components/mode-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function App() {
  const [reportData, setReportData] = useState(null);
  const [tags, setTags] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState('');

  // Estados para os filtros
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [campaign, setCampaign] = useState('');
  const [source, setSource] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tagsResponse = await fetch('http://localhost:3001/api/tags');
        const tagsData = await tagsResponse.json();
        setTags(tagsData);

        const sectorsResponse = await fetch('http://localhost:3001/api/sectors');
        const sectorsData = await sectorsResponse.json();
        setSectors(sectorsData);
      } catch (error) {
        setError('Falha ao buscar dados do servidor. Verifique se o backend está rodando.');
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingDots((dots) => (dots.length < 3 ? dots + '.' : ''));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const handleGenerateReport = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setReportData(null);

    const baseUrl = 'http://localhost:3001/api/cards';
    const params = new URLSearchParams();

    params.append('board', '682251a6c5a42b757a5dbe79');

    if (startDate && endDate) {
      const createdAt = {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };
      params.append('created_at', JSON.stringify(createdAt));
    } else if (startDate || endDate) {
        setError('Para filtrar por data, é necessário selecionar a Data de Início e a Data de Fim.');
        setIsLoading(false);
        return;
    }

    if (campaign) {
      params.append('campaign', campaign);
    }

    if (source) {
      params.append('source', source);
    }

    if (selectedTags.length > 0) {
      params.append('tags', selectedTags.join(','));
    }

    try {
      const response = await fetch(`${baseUrl}?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao gerar o relatório.');
      }

      const report = await response.json();
      setReportData(report);
    } catch (error) {
      setReportData(null);
      setError(error.message);
      console.error('Error generating report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Report IA Force</h1>
        <ModeToggle />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Gerar Relatório de Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerateReport} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <Label>Período</Label>
                <div className="flex space-x-2">
                  <DatePicker placeholder="Data de Início" date={startDate} setDate={setStartDate} />
                  <DatePicker placeholder="Data de Fim" date={endDate} setDate={setEndDate} />
                </div>
              </div>

              <div>
                <Label htmlFor="campaign">Campanha</Label>
                <Input name="campaign" id="campaign" placeholder="Nome da campanha" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="source">Fonte</Label>
                <Input name="source" id="source" placeholder="Nome da fonte" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="tags">Etiquetas</Label>
                <MultiSelectCombobox
                  options={tags}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  className="w-full"
                />
              </div>
            </div>

            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Gerando...' : 'Gerar Relatório'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="flex justify-center items-center mt-8">
          <p className="text-lg">
            <span>Carregando dados</span>
            <span className="inline-block w-[2ch] text-left">{loadingDots}</span>
          </p>
        </div>
      )}

      {!isLoading && reportData && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Resumo do Relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-bold text-lg">Total de Cards:</p>
              <p>{reportData.length}</p>
            </div>
            <div>
              <p className="font-bold text-lg">Campanhas Encontradas:</p>
              <ul className="list-disc list-inside">
                {[...new Set(reportData.map(item => item.campaign))].map(campaign => (
                  <li key={campaign}>{campaign}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-bold text-lg">Período dos Cards:</p>
              <p>
                <strong>Mais antigo:</strong> {new Date(Math.min(...reportData.map(item => new Date(item.created_at).getTime()))).toLocaleDateString()}
              </p>
              <p>
                <strong>Mais recente:</strong> {new Date(Math.max(...reportData.map(item => new Date(item.created_at).getTime()))).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default App;
