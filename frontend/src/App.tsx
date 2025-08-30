import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox, Tag } from '@/components/ui/multi-select-combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { ModeToggle } from '@/components/mode-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ClipboardCopy, Check, ChartBarBig, CalendarDays,
  CircleUserRound, Phone, MessageCircleMore, Bot, UserRound, MailCheck, CheckCheck, CircleCheckBig, Mails,
  Webhook
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';

// Definição de Tipos para os dados da API
interface ReportCard {
  id: string;
  name: string;
  campaign: string;
  source: string;
  created_at: string;
  tags: { id: string; name: string }[];
  list: string;
  moves: any[];
}

interface Sector {
  id: string;
  name: string;
}

const boards = [
  { id: "682251a6c5a42b757a5dbe79", name: "IA Manutenção" },
  { id: "681fd53d454440210d383433", name: "Assistência Técnica" },
  { id: "682cbfd0b7a2255a8de33d90", name: "DEMANDAS MARKETING" },
  { id: "67e69469e61a2499d84a4e65", name: "Inside Sales" },
  { id: "6862f617232cdd6b69cfe545", name: "Lojas" },
  { id: "6825d919b5c101953b6b67be", name: "Projetos e Tarefas | Por Departamento" },
  { id: "67ed27b22f1b8a5a02c348c2", name: "Televendas PF" },
  { id: "685c24cca0784d79c539af00", name: "Televendas PJ" },
];

interface CampaignSummary {
  campaignNames: string;
  dateRange: string;
  totalClients: number;
  totalPhones: string;
  totalRead: string;
  totalDelivered: string;
  totalHabllaResponses: string;
  salesIA: number;
  salesManual: number;
}

function App() {
  const [reportData, setReportData] = useState<ReportCard[] | null>(null);
  const [cardList, setCardList] = useState<ReportCard[] | null>(null);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState('');

  // Estados para os filtros
  const [selectedBoard, setSelectedBoard] = useState<string>(boards[0].id); // Padrão: IA Manutenção
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [campaign, setCampaign] = useState('');
  const [source, setSource] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchEmptyCampaign, setSearchEmptyCampaign] = useState(false);
  const [defaultsSet, setDefaultsSet] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tagsResponse = await fetch('http://localhost:3005/api/tags');
        const tagsData: Tag[] = await tagsResponse.json();
        setTags(tagsData);

        const sectorsResponse = await fetch('http://localhost:3005/api/sectors');
        const sectorsData: Sector[] = await sectorsResponse.json();
        setSectors(sectorsData);
      } catch (error) {
        setError('Falha ao buscar dados do servidor. Verifique se o servidor está rodando.');
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  // Efeito para pré-selecionar as tags padrão
  useEffect(() => {
    if (tags.length > 0 && !defaultsSet) {
      const defaultTagNames = ["IA - Venda IA", "IA - Venda Manual", "IA - Venda Operador"];
      const defaultTags = tags.filter(tag => defaultTagNames.includes(tag.name));
      if (defaultTags.length > 0) {
        setSelectedTags(defaultTags.map(tag => tag.id));
        setDefaultsSet(true);
      }
    }
  }, [tags, defaultsSet]);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingDots((dots) => (dots.length < 3 ? dots + '.' : ''));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const performSearch = async () => {
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new Error('Para filtrar por data, é necessário selecionar a Data de Início e a Data de Fim.');
    }

    const baseUrl = 'http://localhost:3005/api/cards';
    const params = new URLSearchParams();
    params.append('board', selectedBoard);

    if (startDate && endDate) {
      const createdAt = {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      };
      params.append('created_at', JSON.stringify(createdAt));
    }
    if (!searchEmptyCampaign && campaign) {
      params.append('campaign', campaign);
    }
    if (source) params.append('source', source);
    if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));

    const response = await fetch(`${baseUrl}?${params.toString()}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Falha na busca por cartões.');
    }
    return response.json();
  };

  const handleGenerateReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setReportData(null);
    setCardList(null);
    setCampaignSummary(null);

    try {
      let results: ReportCard[] = await performSearch();
      if (searchEmptyCampaign) {
        results = results.filter(card => !card.campaign);
      }
      setReportData(results);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFindCardsClick = async () => {
    setIsLoading(true);
    setError(null);
    setReportData(null);
    setCardList(null);
    setCampaignSummary(null);

    try {
      let results: ReportCard[] = await performSearch();
      if (searchEmptyCampaign) {
        results = results.filter(card => !card.campaign);
      }
      setCardList(results);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!campaignSummary) return;

    const summaryText = `${/* Para comentar dentro da backticks pode se fazer dessa forma */''}
📊 *Campanha:* ${campaignSummary.campaignNames}
📆 *Dt. Envio:* ${campaignSummary.dateRange}
👤 *Total de clientes:* ${campaignSummary.totalClients}
📞 *Total de telefones:* ${campaignSummary.totalPhones}
📩 *Total Lida:* ${campaignSummary.totalRead}
📖 *Total Entregue:* ${campaignSummary.totalDelivered}
💬 *Total de Respostas:* ${campaignSummary.totalHabllaResponses}\n`

      // * WhatsApp: (Dado não disponível)
      // * Ligação: (Dado não disponível)
      // * Não quero contato: (Dado não disponível)
      + ` 
🤖 *Venda IA:* ${campaignSummary.salesIA}
👨‍💻 *Venda Manual:* ${campaignSummary.salesManual}
📨 *Mensagem enviada:*

${normalizedMessage}
    `.trim();

    navigator.clipboard.writeText(summaryText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // O ícone de "copiado" volta ao normal após 2 segundos
    });
  };

  const handleGenerateCampaignSummary = async () => {
    setIsLoading(true);
    setError(null);
    setReportData(null);
    setCardList(null);
    setCampaignSummary(null);

    try {
      let results: ReportCard[] = await performSearch();
      if (searchEmptyCampaign) {
        results = results.filter(card => !card.campaign);
      }

      const campaignNames = [...new Set(results.map(c => c.campaign).filter(Boolean))].join(', ') || 'N/A';
      const dates = results.map(c => new Date(c.created_at).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      let dateRange = 'N/A';
      if (results.length > 0) {
        const minDateStr = minDate.toLocaleDateString();
        const maxDateStr = maxDate.toLocaleDateString();
        dateRange = minDateStr === maxDateStr ? minDateStr : `${minDateStr} - ${maxDateStr}`;
      }

      // Lógica de cálculo atualizada conforme a nova definição
      const totalClients = new Set(results.map(c => c.name)).size;
      const totalPhones = results.length;
      const totalHabllaResponses = results.filter(c => c.moves && c.moves.length > 0).length;

      const salesIA = results.filter(c =>
        c.tags?.some(t => t.name === "IA - Venda IA" || t.name === "IA - Venda Manual")
      ).length;
      const salesManual = results.filter(c => c.tags?.some(t => t.name === "IA - Venda Operador")).length;

      const summary: CampaignSummary = {
        campaignNames,
        dateRange,
        totalClients,
        totalPhones: String(totalPhones),
        totalRead: "(Dado não disponível)",
        totalDelivered: "(Dado não disponível)",
        totalHabllaResponses: String(totalHabllaResponses),
        salesIA,
        salesManual,
      };

      setCampaignSummary(summary);

    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };


  // Tratamento do texto da mensagem enviada
  const template_enviado = "*Lembrete de Troca de Refil*  Chegou o momento de trocar o refil do seu *Purificador Soft/Everest*!  💧 A qualidade da água que você consome é essencial para a sua *saúde e bem-estar*.  ⚠️ *Atenção*: Refil vencido pode comprometer a pureza da água e a eficiência da purificação.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato";
  const rawMessage = template_enviado;

  // Se o banco removeu \n e deixou 2 espaços, converta de volta:
  const normalizedMessage = rawMessage.replace(/ {2,}/g, '\n');


  //Função para formatar mensagem no formato deo WhatsApp
  function parseWhatsAppFormatting(text: string): string {
    if (!text) return '';

    return text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<s>$1</s>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }



  // Função Webhook de enviar
  const handleSendWebhook = async () => {
    if (!campaignSummary) return;

    const payload = {
      campanha: campaignSummary.campaignNames,
      dt_envio: campaignSummary.dateRange,
      total_clientes: campaignSummary.totalClients,
      total_tel: campaignSummary.totalPhones,
      total_lida: campaignSummary.totalRead,
      total_entregue: campaignSummary.totalDelivered,
      total_respostas: campaignSummary.totalHabllaResponses,
      venda_ia: campaignSummary.salesIA,
      venda_manual: campaignSummary.salesManual,
      mgs_enviada: normalizedMessage,
    };

    try {
      const response = await fetch(
        "https://infra-n8nserver.mundodosfiltros.com.br/webhook/8b4f62ae-ba89-4e5f-ad6a-2e019ffb22e4",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        console.log("Webhook enviado com sucesso!");
        // opcional: feedback pro usuário
      } else {
        console.error("Erro ao enviar webhook:", response.statusText);
      }
    } catch (error) {
      console.error("Erro na requisição do webhook:", error);
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
                <Label htmlFor="board">Quadro</Label>
                <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                  <SelectTrigger id="board">
                    <SelectValue placeholder="Selecione o quadro" />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Período</Label>
                <div className="flex space-x-2">
                  <DatePicker placeholder="Data de Início" date={startDate} setDate={setStartDate} />
                  <DatePicker placeholder="Data de Fim" date={endDate} setDate={setEndDate} />
                </div>
              </div>

              <div>
                <Label htmlFor="campaign">Campanha</Label>
                <div className="flex items-center space-x-2 mt-2">
                  <Input
                    name="campaign"
                    id="campaign"
                    placeholder="Nome da campanha"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                    disabled={searchEmptyCampaign}
                  />
                  <div className="flex items-center space-x-1">
                    <Checkbox
                      id="empty-campaign"
                      checked={searchEmptyCampaign}
                      onCheckedChange={(checked) => setSearchEmptyCampaign(Boolean(checked))}
                    />
                    <Label htmlFor="empty-campaign" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Vazias</Label>
                  </div>
                </div>
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
            <div className="flex space-x-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Gerando...' : 'Gerar Relatório'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleFindCardsClick} disabled={isLoading}>
                {isLoading ? 'Buscando...' : 'Buscar IDs'}
              </Button>
              <Button type="button" variant="outline" onClick={handleGenerateCampaignSummary} disabled={isLoading}>
                {isLoading ? 'Gerando...' : 'Resumo Campanha IA'}
              </Button>
            </div>
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
            {reportData.length > 0 ? (
              <>
                <div>
                  <p className="font-bold text-lg">Total de Cards:</p>
                  <p>{reportData.length}</p>
                </div>
                <div>
                  <p className="font-bold text-lg">Campanhas Encontradas:</p>
                  <ul className="list-disc list-inside">
                    {[...new Set(reportData.map(item => item.campaign).filter(Boolean))].map(campaign => (
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
              </>
            ) : (
              <p>Nenhum card encontrado para este filtro.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && cardList && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Lista de Cards Encontrados</CardTitle>
          </CardHeader>
          <CardContent>
            {cardList.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID do Cartão</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Data de Criação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cardList.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.campaign || "-"}</TableCell>
                      <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p>Nenhum card encontrado para este filtro.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && campaignSummary && (
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Resumo da Campanha</CardTitle>
            <div className="flex gap-2">
              {/* Botão copiar */}
              <Button variant="ghost" size="icon" onClick={handleCopySummary}>
                {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
              </Button>
              {/* Botão enviar webhook */}
              <Button variant="ghost" size="icon" onClick={handleSendWebhook}>
                🚀
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-base">
            <p className='flex flex-row gap-2 items-center'>ö
              <ChartBarBig className="h-4 w-4" />
              <strong>Campanha:</strong> {campaignSummary.campaignNames}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <CalendarDays className="h-4 w-4" />
              <strong>Dt. Envio:</strong> {campaignSummary.dateRange}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <CircleUserRound className="h-4 w-4" />
              <strong>Total de clientes:</strong> {campaignSummary.totalClients}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <Phone className="h-4 w-4" />
              <strong>Total de telefones:</strong> {campaignSummary.totalPhones}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <MailCheck className="h-4 w-4" />
              <strong>Total Entregue:</strong> {campaignSummary.totalDelivered}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <CheckCheck className="h-4 w-4" />
              <strong>Total Lida:</strong> {campaignSummary.totalRead}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <MessageCircleMore className="h-4 w-4" />
              <strong>Total de Respostas pelo Hablla:</strong> {campaignSummary.totalHabllaResponses}
            </p>

            <p className="pl-4 flex flex-row gap-2 items-center">
              <CircleCheckBig className="h-4 w-4" />WhatsApp: (Dado não disponível)
            </p>
            <p className="pl-4 flex flex-row gap-2 items-center">
              <CircleCheckBig className="h-4 w-4" />Ligação: (Dado não disponível)
            </p>
            <p className="pl-4 flex flex-row gap-2 items-center">
              <CircleCheckBig className="h-4 w-4" />Não quero contato: (Dado não disponível)
            </p>

            <p className='flex flex-row gap-2 items-center'>
              <Bot className="h-4 w-4" />
              <strong>Venda IA:</strong> {campaignSummary.salesIA}
            </p>
            <p className='flex flex-row gap-2 items-center'>
              <UserRound className="h-4 w-4" />
              <strong>Venda Manual:</strong> {campaignSummary.salesManual}
            </p>
            <p className="flex flex-row gap-2 items-center">
              <Mails className="h-4 w-4" /><strong>Mensagem enviada:</strong>
            </p>
            {/* <div className='pl-4 space-y-2'>
              <hr />
              <p className='my-2 font-bold'>Lembrete de Troca de Refil</p>
              <p>Chegou o momento de trocar o refil do seu Purificador Soft/Everest!</p>
              <p>💧 A qualidade da água que você consome é essencial para a sua saúde e bem-estar.</p>
              <p>⚠️ Atenção: Refil vencido pode comprometer a pureza da água e a eficiência da purificação.</p>
              <p>Não esqueça de agendar a próxima troca!</p>
              <p>* Quero agendar</p>
              <p>* Não quero contato</p>
              <hr />
            </div> */}
            <div className="pl-4 space-y-2">
              <hr />
              {normalizedMessage.split("\n").map((line, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: parseWhatsAppFormatting(line) }} />
              ))}
              <hr />
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default App;
