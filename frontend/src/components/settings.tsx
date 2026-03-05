import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, KeyRound } from 'lucide-react';
import { Notification } from '@/App';

interface SettingsProps {
    token: string | null;
    onMenuClick: () => void;
    notifications: Notification[];
    setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
    user: any;
    onLogout: () => void;
}

export function Settings({ token, onMenuClick, notifications, setNotifications, user, onLogout }: SettingsProps) {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Create user form
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';

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

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchUsers();
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
                body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: 'user' })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao criar usuário.');

            setNewName('');
            setNewEmail('');
            setNewPassword('');
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
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
                    <CardTitle>Gerenciamento de Usuários</CardTitle>
                    <CardDescription>Crie novos operadores, force reset de senhas e exclua contas da plataforma.</CardDescription>
                </CardHeader>
                <CardContent>

                    <div className="mb-8 p-4 border border-zinc-800 rounded-xl space-y-4">
                        <h3 className="font-semibold">Criar Novo Usuário</h3>
                        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
                                        <TableCell>{u.role === 'admin' ? 'Administrador' : 'Operador'}</TableCell>
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
        </div>
    );
}
