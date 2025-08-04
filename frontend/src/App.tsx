import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ModeToggle } from '@/components/mode-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function App() {
  const [reportData, setReportData] = useState(null);
  const [tags, setTags] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('date');

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

  const handleGenerateReport = async (event) => {
    event.preventDefault();

    const baseUrl = 'http://localhost:3001/api/cards';
    const params = new URLSearchParams();

    params.append('board', 'IA Manutenção');

    if (filterType === 'date' && startDate && endDate) {
      const createdAt = {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };
      params.append('created_at', JSON.stringify(createdAt));
    } else if (filterType === 'campaign' && campaign) {
      params.append('campaign', campaign);
    } else if (filterType === 'source' && source) {
      params.append('source', source);
    } else if (filterType === 'tags' && selectedTags.length > 0) {
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
      setError(null);
    } catch (error) {
      setReportData(null);
      setError(error.message);
      console.error('Error generating report:', error);
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="board">Quadro</Label>
                <Select name="board" defaultValue="IA Manutenção">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o quadro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IA Manutenção">IA Manutenção</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filterType">Filtrar por</Label>
                <Select name="filterType" onValueChange={(value) => { setFilterType(value); setReportData(null); }} defaultValue="date">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de filtro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Data</SelectItem>
                    <SelectItem value="campaign">Campanha</SelectItem>
                    <SelectItem value="source">Fonte</SelectItem>
                    <SelectItem value="tags">Etiquetas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filterType === 'date' && (
                <div>
                  <Label>Período</Label>
                  <div className="flex space-x-2">
                    <DatePicker placeholder="Data de Início" date={startDate} setDate={setStartDate} />
                    <DatePicker placeholder="Data de Fim" date={endDate} setDate={setEndDate} />
                  </div>
                </div>
              )}

              {filterType === 'campaign' && (
                <div>
                  <Label htmlFor="campaign">Campanha</Label>
                  <Input name="campaign" id="campaign" placeholder="Digite o nome da campanha" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
                </div>
              )}

              {filterType === 'source' && (
                <div>
                  <Label htmlFor="source">Fonte</Label>
                  <Input name="source" id="source" placeholder="Digite o nome da fonte" value={source} onChange={(e) => setSource(e.target.value)} />
                </div>
              )}

              {filterType === 'tags' && (
                <div>
                  <Label htmlFor="tags">Etiquetas</Label>
                  <Select name="tags" onValueChange={(value) => setSelectedTags([value])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione as etiquetas" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(tags) && tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Button type="submit">Gerar Relatório</Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {reportData && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Resultados do Relatório</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Data de Criação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.campaign}</TableCell>
                    <TableCell>{item.source}</TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default App;
