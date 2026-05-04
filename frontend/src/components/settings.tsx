import { useState, useEffect, useRef } from 'react';
import { getBaseUrl } from '@/lib/config';
import { CampaignOption } from '@/components/ui/multi-select-campaign';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Header } from '@/components/header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, KeyRound, PencilLine, Info } from 'lucide-react';
import { Notification } from '@/App';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parse, isValid } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const MONTH_OPTIONS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface SettingsProps {
    token: string | null;
    onMenuClick: () => void;
    notifications: Notification[];
    setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
    user: any;
    onLogout: () => void;
    campaignsData?: CampaignOption[];
    fetchCampaigns?: () => void;
}

export function Settings({ token, onMenuClick, notifications, setNotifications, user, onLogout, campaignsData, fetchCampaigns }: SettingsProps) {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Create user form
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');

    // Create campaign form
    const [campName, setCampName] = useState('');
    const [campDate, setCampDate] = useState<Date | undefined>(new Date());
    const [campTime, setCampTime] = useState('');
    const [campRefMonth, setCampRefMonth] = useState(MONTH_OPTIONS[new Date().getMonth()]);
    const [campNumber, setCampNumber] = useState('');
    const [campLoad, setCampLoad] = useState(false);
    const [campError, setCampError] = useState('');
    const [campSearch, setCampSearch] = useState('');
    const [campPage, setCampPage] = useState(1);
    const [campEditingId, setCampEditingId] = useState<number | null>(null);
    const [campNotSent, setCampNotSent] = useState(false);
    const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
    const [campTemplateEnviado, setCampTemplateEnviado] = useState(
        "Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato"
    );

    // Cronjob settings
    const [cronTimes, setCronTimes] = useState<string[]>(['00:00']);
    const [cronFreq, setCronFreq] = useState('1x por dia');
    const [cronLoading, setCronLoading] = useState(false);

    // Database Management
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [backups, setBackups] = useState<any[]>([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fullMonthNames: Record<string, string> = {
        Jan: 'Janeiro', Fev: 'Fevereiro', Mar: 'Março', Abr: 'Abril', Mai: 'Maio', Jun: 'Junho',
        Jul: 'Julho', Ago: 'Agosto', Set: 'Setembro', Out: 'Outubro', Nov: 'Novembro', Dez: 'Dezembro',
        // In case they are already saved as full names on DB:
        Janeiro: 'Janeiro', Fevereiro: 'Fevereiro', 'Março': 'Março', Abril: 'Abril', Maio: 'Maio', Junho: 'Junho',
        Julho: 'Julho', Agosto: 'Agosto', Setembro: 'Setembro', Outubro: 'Outubro', Novembro: 'Novembro', Dezembro: 'Dezembro'
    };

    const monthOptions = MONTH_OPTIONS;

    const filteredCamps = (campaignsData || []).filter(c => {
        const notSentText = (!c.date_only || c.date_only === '') ? 'campanha não enviada' : '';
        const searchTarget = `${c.name} ${c.month} ${notSentText}`.toLowerCase();
        return searchTarget.includes(campSearch.toLowerCase());
    });
    const CAMP_PER_PAGE = 8;
    const totalCampPages = Math.ceil(filteredCamps.length / CAMP_PER_PAGE) || 1;
    const currentCamps = filteredCamps.slice((campPage - 1) * CAMP_PER_PAGE, campPage * CAMP_PER_PAGE);

    const BASE_URL = getBaseUrl();

    const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
        const response = await fetch(url, options);
        if (response.status === 401 || response.status === 403) {
            onLogout?.();
            throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }
        return response;
    };

    const fetchUsers = async () => {
        if (!token) return;
        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Não foi possível carregar os usuários.');
            const data = await response.json();
            setUsers(data);
        } catch (err: any) {
            console.error(err);
        }
    };

    const fetchCronSettings = async () => {
        if (!token) return;
        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/settings/cronjob`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.time) {
                    setCronTimes(Array.isArray(data.time) ? data.time : [data.time]);
                }
                if (data.frequency) setCronFreq(data.frequency);
            }
        } catch (err) {
            console.error('Erro ao carregar configurações do cronjob:', err);
        }
    };

    const fetchBackups = async () => {
        if (!token) return;
        try {
            setLoadingBackups(true);
            const response = await fetchWithAuth(`${BASE_URL}/api/database/backups`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setBackups(data);
            }
        } catch (err) {
            console.error('Erro ao carregar backups:', err);
        } finally {
            setLoadingBackups(false);
        }
    };

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchUsers();
            fetchCronSettings();
            fetchBackups();
        }
    }, [user, token]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao criar usuário.');

            setNewName('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('user');
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

        const handleFreqChange = (val: string) => {
            setCronFreq(val);
            const count = parseInt(val.match(/\d+/)?.[0] || '1', 10);
            setCronTimes(prev => {
                const newTimes = [...prev];
                while (newTimes.length < count) newTimes.push('00:00');
                if (newTimes.length > count) newTimes.length = count;
                return newTimes;
            });
        };

        const handleSaveCron = async (e: React.FormEvent) => {
        e.preventDefault();
        setCronLoading(true);
        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/settings/cronjob`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ enabled: true, time: cronTimes, frequency: cronFreq })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao salvar configuração do Agendamento.');
            
            setNotifications(prev => [{
                id: Math.random().toString(36).substring(7),
                title: 'Configurações Salvas',
                message: 'O agendamento automático de atualização de campanhas foi salvo.',
                type: 'success',
                timestamp: new Date(),
                read: false
            }, ...prev]);
            
            // Pop-up extra solicitado para garantir feedback visual
            alert("Agendamento Automático configurado com sucesso!");
        } catch (err: any) {
            alert(err.message);
        } finally {
            setCronLoading(false);
        }
    };

    const handleExportDB = async () => {
        try {
            setIsExporting(true);
            const response = await fetchWithAuth(`${BASE_URL}/api/database/export`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Erro ao exportar banco de dados.');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            const nowStr = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
            const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `database_reportiaforce_${nowStr}.sqlite`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportDB = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm('Atenção: Importar um novo banco de dados irá sobrescrever a base atual (um backup da base atual será salvo). Todos os usuários logados precisarão entrar novamente. Deseja continuar?')) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        try {
            setIsImporting(true);
            const formData = new FormData();
            formData.append('database', file);

            const response = await fetch(`${BASE_URL}/api/database/import`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }, // fetchWithAuth normally stringifies body, so we use raw fetch for FormData
                body: formData
            });

            if (response.status === 401 || response.status === 403) {
                onLogout?.();
                throw new Error('Sessão expirada. Por favor, faça login novamente.');
            }

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao importar banco de dados.');
            
            alert('Banco de dados importado com sucesso! Você será redirecionado para o login para uma nova conexão.');
            onLogout?.();
            window.location.reload();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteBackup = async (filename: string) => {
        if (!confirm(`Deseja realmente excluir o backup ${filename}?`)) return;

        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/database/backups/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao excluir backup.');
            
            fetchBackups();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleRestoreBackup = async (filename: string) => {
        if (!confirm(`Atenção: Restaurar este backup irá substituir a base de dados atual! Um backup da base atual será criado. Todos os usuários logados precisarão entrar novamente. Deseja continuar e restaurar ${filename}?`)) return;

        try {
            setIsImporting(true);
            const response = await fetchWithAuth(`${BASE_URL}/api/database/backups/${filename}/restore`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao restaurar backup.');
            
            alert('Backup restaurado com sucesso! Você será redirecionado para o login para uma nova conexão.');
            onLogout?.();
            window.location.reload();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsImporting(false);
        }
    };

    const handleResetPassword = async (userId: number, userName: string) => {
        const newPass = prompt(`Digite a nova senha temporária para o usuário ${userName}:`);
        if (!newPass) return;

        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/users/${userId}/reset-password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password: newPass })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao redefinir senha.');
            alert(data.message);
            fetchUsers();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Deseja realmente remover este usuário do sistema?')) return;

        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao excluir usuário.');
            fetchUsers();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleSubmitCampaign = async (e: React.FormEvent) => {
        e.preventDefault();
        setCampError('');
        setCampLoad(true);

        const trimmedName = campName.trim();
        if (!trimmedName) {
            setCampError('O nome da campanha não pode ser vazio.');
            setCampLoad(false);
            return;
        }

        let processDate = '';
        let processTime = '';

        if (!campNotSent) {
            if (!campDate) {
                setCampError('Uma data válida é obrigatória se a campanha for marcada como enviada.');
                setCampLoad(false);
                return;
            }

            processTime = campTime.trim();
            if (processTime.length === 4 && !processTime.includes(':')) {
                processTime = `${processTime.substring(0, 2)}:${processTime.substring(2, 4)}`;
            }

            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(processTime)) {
                setCampError('A hora deve estar no formato válido (HH:MM). Exemplo: 09:00 ou 0900');
                setCampLoad(false);
                return;
            }
            processDate = format(campDate, 'dd/MM/yyyy');
        }

        try {
            const url = campEditingId ? `${BASE_URL}/api/campaigns/${campEditingId}` : `${BASE_URL}/api/campaigns`;
            const method = campEditingId ? 'PUT' : 'POST';

            const response = await fetchWithAuth(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: trimmedName,
                    date: processDate,
                    time: processTime,
                    reference_month: campRefMonth,
                    number: campNumber ? parseInt(campNumber) : undefined,
                    template_enviado: campTemplateEnviado
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao processar campanha.');

            setCampName('');
            setCampDate(new Date());
            setCampTime('');
            setCampRefMonth(MONTH_OPTIONS[new Date().getMonth()]);
            setCampNumber('');
            setCampEditingId(null);
            setCampNotSent(false);
            setCampTemplateEnviado("Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato");
            if (fetchCampaigns) fetchCampaigns();
        } catch (err: any) {
            setCampError(err.message);
        } finally {
            setCampLoad(false);
        }
    };

    const handleDeleteCampaign = async (campId: number) => {
        if (!confirm('Deseja realmente remover esta campanha do sistema?')) return;

        try {
            const response = await fetchWithAuth(`${BASE_URL}/api/campaigns/${campId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao excluir campanha.');
            if (fetchCampaigns) fetchCampaigns();
        } catch (err: any) {
            alert(err.message);
        }
    };

    if (user?.role !== 'admin') {
        return (
            <div className="container mx-auto p-4 md:p-8">
                <Header title="Configurações" onMenuClick={onMenuClick} notifications={notifications} setNotifications={setNotifications} user={user} onLogout={onLogout} />
                <Card className="mt-8">
                    <CardContent className="py-10 text-center">
                        <h2 className="text-xl font-bold">Acesso Restrito</h2>
                        <p className="text-muted-foreground mt-2">Você não tem permissões de administrador para visualizar esta página.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            <Header title="Configurações" onMenuClick={onMenuClick} notifications={notifications} setNotifications={setNotifications} user={user} onLogout={onLogout} />

            <Card>
                <CardHeader>
                    <CardTitle>Gerenciamento de Campanhas</CardTitle>
                    <CardDescription>Cadastre as campanhas que serão utilizadas na filtragem e relatórios do sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-8 p-4 border border-zinc-800 rounded-xl space-y-4">
                        <h3 className="font-semibold">{campEditingId ? 'Editar Campanha' : 'Cadastrar Nova Campanha'}</h3>
                        <TooltipProvider delayDuration={200}>
                            <form onSubmit={handleSubmitCampaign} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                                <div className="space-y-2 md:col-span-3">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="campName">Nome Campanha</Label>
                                        <Tooltip>
                                            <TooltipTrigger type="button" tabIndex={-1} className="cursor-help"><Info className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                                            <TooltipContent><p>O nome deve ser idêntico ao nome da campanha no Hablla/Sankhya.</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Input id="campName" required value={campName} onChange={e => setCampName(e.target.value)} placeholder="Ex: HB ANIV 9MESES MAR 2026.01..." className="bg-background" />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <div className="flex justify-between items-center">
                                        <Label>Data</Label>
                                        <Tooltip>
                                            <TooltipTrigger type="button" tabIndex={-1} className="cursor-help"><Info className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                                            <TooltipContent><p>Data em que o disparo foi realizado.</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="w-full">
                                                <DatePicker placeholder="Selecione..." date={campDate} setDate={setCampDate} disabled={campNotSent || campLoad} />
                                            </div>
                                        </TooltipTrigger>
                                        {campNotSent && <TooltipContent><p>Campo bloqueado porque a opção "Campanha não enviada" está marcada.</p></TooltipContent>}
                                    </Tooltip>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="campTime">Hora (HH:MM)</Label>
                                        <Tooltip>
                                            <TooltipTrigger type="button" tabIndex={-1} className="cursor-help"><Info className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                                            <TooltipContent><p>Hora do disparo (ex: 09:30). Não precisa dos dois pontos (opcional).</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="w-full">
                                                <Input id="campTime" required={!campNotSent} disabled={campNotSent || campLoad} value={campTime} onChange={e => setCampTime(e.target.value)} placeholder="09:00" className="bg-background" />
                                            </div>
                                        </TooltipTrigger>
                                        {campNotSent && <TooltipContent><p>Campo bloqueado porque a opção "Campanha não enviada" está marcada.</p></TooltipContent>}
                                    </Tooltip>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="campRefMonth">Mês Referência</Label>
                                        <Tooltip>
                                            <TooltipTrigger type="button" tabIndex={-1} className="cursor-help"><Info className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                                            <TooltipContent><p>O mês oficial onde os resultados dessa campanha serão encaixados.</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <select
                                        id="campRefMonth"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={campRefMonth}
                                        onChange={e => setCampRefMonth(e.target.value)}
                                    >
                                        {monthOptions.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="campNumber">Nº</Label>
                                        <Tooltip>
                                            <TooltipTrigger type="button" tabIndex={-1} className="cursor-help"><Info className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                                            <TooltipContent><p>Auto-preenchido se vazio. É o número do código de referência da campanha como D01, D02.</p></TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Input id="campNumber" type="number" min="1" value={campNumber} onChange={e => setCampNumber(e.target.value)} placeholder="Auto" className="bg-background" />
                                </div>
                                <div className="flex items-center space-x-2 md:col-span-2 pb-3 justify-center">
                                    <Checkbox
                                        id="campNotSent"
                                        checked={campNotSent}
                                        onCheckedChange={(checked) => setCampNotSent(checked === true)}
                                    />
                                    <Label htmlFor="campNotSent" className="text-sm font-normal cursor-pointer text-muted-foreground leading-tight">

                                        Campanha não enviada?
                                    </Label>
                                </div>
                                <div className="flex gap-2 w-full md:col-span-12 mt-2">
                                    <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="outline" className="px-4 shrink-0 text-muted-foreground">
                                                Editar Mensagem
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-4">
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <h4 className="font-medium text-sm leading-none">Template da Mensagem</h4>
                                                    <p className="text-xs text-muted-foreground">Esta é a mensagem padrão que será vinculada a esta campanha. Você pode ajustá-la agora ou a qualquer momento.</p>
                                                    <textarea 
                                                        className="w-full min-h-[140px] text-sm border border-zinc-800 bg-background rounded-md p-2 mt-2 focus:outline-none focus:ring-2 focus:ring-ring"
                                                        value={campTemplateEnviado}
                                                        onChange={e => setCampTemplateEnviado(e.target.value)}
                                                    />
                                                </div>
                                                <Button 
                                                    type="button" 
                                                    className="w-full" 
                                                    onClick={() => setTemplatePopoverOpen(false)}
                                                >
                                                    Salvar Template
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                    <Button type="submit" disabled={campLoad} className="w-full font-bold flex-1">
                                        {campLoad ? 'Processando...' : (campEditingId ? 'Atualizar Campanha' : 'Cadastrar Campanha')}
                                    </Button>
                                    {campEditingId && (
                                        <Button type="button" variant="outline" onClick={() => {
                                            setCampName(''); setCampDate(new Date()); setCampTime(''); setCampRefMonth(MONTH_OPTIONS[new Date().getMonth()]); setCampNumber(''); setCampEditingId(null); setCampNotSent(false); setCampTemplateEnviado("Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato");
                                        }} className="w-full md:w-auto">
                                            Cancelar
                                        </Button>
                                    )}
                                </div>
                            </form>
                        </TooltipProvider>
                        {campError && <p className="text-red-400 text-sm mt-2">{campError}</p>}
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <Input
                            placeholder="Buscar campanha por nome ou mês (ex: Jan)..."
                            className="max-w-sm bg-background"
                            value={campSearch}
                            onChange={(e) => {
                                setCampSearch(e.target.value);
                                setCampPage(1); // Reset page on filter
                            }}
                        />
                        <span className="text-sm text-muted-foreground">{filteredCamps.length} encontradas</span>
                    </div>

                    <div className="rounded-xl border border-zinc-800 overflow-hidden">
                        <div className="max-h-[500px] overflow-y-auto">
                            <Table>
                                <TableHeader className="bg-form-header sticky top-0 z-10 shadow-sm">
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Data de Disparo</TableHead>
                                        <TableHead>Mês Referência</TableHead>
                                        <TableHead>Código Mês</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {currentCamps.map((c: any) => (
                                        <TableRow key={c.id}>
                                            <TableCell className="font-medium">{c.id}</TableCell>
                                            <TableCell className="font-medium">{c.name}</TableCell>
                                            <TableCell>
                                                {(!c.date_only || c.date_only === '')
                                                    ? <span className="text-muted-foreground italic">Campanha não enviada</span>
                                                    : `${c.date_only} ${c.time_only}`
                                                }
                                            </TableCell>
                                            <TableCell>{fullMonthNames[c.reference_month] || c.reference_month}</TableCell>
                                            <TableCell>{c.month}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => {
                                                        const isNotSent = (!c.date_only || c.date_only === '');
                                                        const pDate = isNotSent ? new Date() : parse(c.date_only, 'dd/MM/yyyy', new Date());
                                                        setCampName(c.name);
                                                        setCampDate(isValid(pDate) ? pDate : new Date());
                                                        setCampTime(c.time_only || '');
                                                        setCampRefMonth(fullMonthNames[c.reference_month] || c.reference_month);
                                                        setCampNumber(c.number?.toString() || '');
                                                        setCampEditingId(c.id);
                                                        setCampNotSent(isNotSent);
                                                        setCampTemplateEnviado(c.template_enviado || "Lembrete de Troca de Refil!  Olá *{{1}}*, o seu refil já completou *9 meses* de uso.   Refil vencido pode comprometer a *pureza da água* e a *eficiência* do seu purificador.  Não esqueça de agendar a próxima troca!  * Quero agendar  * Não quero contato");
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }} className="hover:text-blue-500 hover:border-blue-500" title="Editar campanha">
                                                        <PencilLine className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => handleDeleteCampaign(c.id)} className="hover:text-red-500 hover:border-red-500" title="Excluir campanha">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {currentCamps.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma campanha cadastrada ainda.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex justify-between items-center px-4 py-3 border-t border-zinc-800 bg-muted/20">
                            <Button variant="outline" size="sm" onClick={() => setCampPage(p => Math.max(1, p - 1))} disabled={campPage === 1}>Anterior</Button>
                            <span className="text-sm text-muted-foreground">Página {campPage} de {totalCampPages}</span>
                            <Button variant="outline" size="sm" onClick={() => setCampPage(p => Math.min(totalCampPages, p + 1))} disabled={campPage === totalCampPages}>Próxima</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Gerenciamento de Usuários</CardTitle>
                    <CardDescription>Crie novos operadores, force reset de senhas e exclua contas da plataforma.</CardDescription>
                </CardHeader>
                <CardContent>

                    <div className="mb-8 p-4 border border-zinc-800 rounded-xl space-y-4">
                        <h3 className="font-semibold">Criar Novo Usuário</h3>
                        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome / Empresa</Label>
                                <Input id="name" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome de exibição..." className="bg-background" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail</Label>
                                <Input id="email" type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@mail.com" className="bg-background" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Senha Inicial</Label>
                                <Input id="password" type='password' required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••" className="bg-background" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Regra</Label>
                                <Select value={newRole} onValueChange={setNewRole}>
                                    <SelectTrigger id="role" className="bg-background">
                                        <SelectValue placeholder="Selecione a regra" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Administrador</SelectItem>
                                        <SelectItem value="gestor">Gestor</SelectItem>
                                        <SelectItem value="user">Analista</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" disabled={loading} className="w-full font-bold">
                                {loading ? 'Cadastrando' : 'Adicionar Usuário'}
                            </Button>
                        </form>
                        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                    </div>

                    <div className="rounded-xl border border-zinc-800 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-form-header">
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>E-mail</TableHead>
                                    <TableHead>Regra</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((u) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name}</TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>{u.role === 'admin' ? 'Administrador' : u.role === 'gestor' ? 'Gestor' : 'Analista'}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => handleResetPassword(u.id, u.name)} title="Forçar mudança de senha">
                                                    <KeyRound className="w-4 h-4 text-amber-500" />
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => handleDeleteUser(u.id)} className="hover:text-red-500 hover:border-red-500" disabled={u.id === user.id}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {users.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum usuário cadastrado.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Agendamento Automático (Cronjob)</CardTitle>
                    <CardDescription>Defina o horário para que o sistema atualize todas as campanhas cadastradas automaticamente.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveCron} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="cronFreq">Frequência</Label>
                            <Select value={cronFreq} onValueChange={handleFreqChange}>
                                <SelectTrigger id="cronFreq" className="bg-background">
                                    <SelectValue placeholder="Selecione a frequência" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1x por dia">1x por dia</SelectItem>
                                    <SelectItem value="2x por dia">2x por dia</SelectItem>
                                    <SelectItem value="3x por dia">3x por dia</SelectItem>
                                    <SelectItem value="4x por dia">4x por dia</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className={`space-y-3 ${cronTimes.length > 2 ? 'md:col-span-4' : 'md:col-span-2'}`}>
                            <div className={`grid gap-4 ${cronTimes.length > 2 ? 'grid-cols-2 lg:grid-cols-4' : (cronTimes.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}`}>
                                {cronTimes.map((t, index) => (
                                    <div key={index} className="space-y-2">
                                        <Label htmlFor={`cronTime_${index}`}>{cronTimes.length > 1 ? `Horário ${index + 1}` : 'Horário de Execução'} (HH:MM)</Label>
                                        <Input 
                                            id={`cronTime_${index}`} 
                                            type="time" 
                                            required 
                                            value={t} 
                                            onChange={e => {
                                                const newTimes = [...cronTimes];
                                                newTimes[index] = e.target.value;
                                                setCronTimes(newTimes);
                                            }} 
                                            className="bg-background [color-scheme:light] dark:[color-scheme:dark]" 
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="md:col-span-1 border-t md:border-t-0 pt-4 md:pt-0 mt-2 md:mt-0 items-end flex pb-[2px]">
                            <Button type="submit" disabled={cronLoading} className="w-full font-bold">
                                {cronLoading ? 'Salvando...' : 'Salvar'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Gerenciamento de Banco de Dados</CardTitle>
                    <CardDescription>Faça backup completo da base de dados atual ou restaure a base a partir de um arquivo gerado anteriormente. <br/><span className="text-amber-500 font-medium">Atenção: Ao importar, a base anterior será copiada com a data atual por segurança.</span></CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <Button 
                            variant="outline" 
                            className="w-full md:w-auto font-bold" 
                            onClick={handleExportDB} 
                            disabled={isExporting || isImporting}
                        >
                            {isExporting ? 'Baixando...' : 'Fazer Backup (Exportar .sqlite)'}
                        </Button>
                        
                        <div className="flex-1 w-full relative">
                            <input 
                                type="file" 
                                accept=".sqlite,.db" 
                                className="hidden" 
                                ref={fileInputRef} 
                                onChange={handleImportDB} 
                            />
                            <Button 
                                variant="default" 
                                className="w-full md:w-auto font-bold" 
                                onClick={() => fileInputRef.current?.click()} 
                                disabled={isExporting || isImporting}
                            >
                                {isImporting ? 'Importando e Reiniciando...' : 'Restaurar Backup (Importar .sqlite)'}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-8">
                        <h3 className="font-semibold mb-4">Backups Armazenados</h3>
                        <div className="rounded-xl border border-zinc-800 overflow-hidden">
                            <Table>
                                <TableHeader className="bg-form-header">
                                    <TableRow>
                                        <TableHead>Arquivo</TableHead>
                                        <TableHead>Data de Criação</TableHead>
                                        <TableHead>Tamanho</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loadingBackups ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Carregando backups...</TableCell>
                                        </TableRow>
                                    ) : backups.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum backup encontrado no servidor.</TableCell>
                                        </TableRow>
                                    ) : (
                                        backups.map((b) => (
                                            <TableRow key={b.filename}>
                                                <TableCell className="font-medium text-xs break-all">{b.filename}</TableCell>
                                                <TableCell className="text-xs">{format(new Date(b.createdAt), "dd/MM/yyyy 'às' HH:mm:ss")}</TableCell>
                                                <TableCell className="text-xs">{(b.size / 1024 / 1024).toFixed(2)} MB</TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => handleRestoreBackup(b.filename)} disabled={isImporting} title="Restaurar este backup">
                                                            Restaurar
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => handleDeleteBackup(b.filename)} className="hover:text-red-500 hover:border-red-500" disabled={isImporting} title="Excluir backup">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                </CardContent>
            </Card>

        </div>
    );
}
