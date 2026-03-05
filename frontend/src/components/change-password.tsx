import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, ShieldAlert } from 'lucide-react';

interface ChangePasswordProps {
    onSuccess: (newToken: string, updatedUser: any) => void;
    token: string | null;
}

export function ChangePassword({ onSuccess, token }: ChangePasswordProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        document.body.style.pointerEvents = '';
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            return setError('A nova senha e a confirmação não coincidem.');
        }
        if (newPassword.length < 6) {
            return setError('A nova senha deve ter no mínimo 6 caracteres.');
        }

        setLoading(true);

        try {
            const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';
            const response = await fetch(`${BASE_URL}/api/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Erro ao alterar a senha.');
            }

            const data = await response.json();
            onSuccess(data.token, data.user);
        } catch (err: any) {
            setError(err.message || 'Erro inesperado ao alterar a senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
            <Card className="w-full max-w-md border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl">
                <CardHeader className="space-y-3 pb-6 flex flex-col items-center">
                    <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
                        <ShieldAlert className="w-8 h-8 text-amber-500" />
                    </div>
                    <CardTitle className="text-3xl font-bold tracking-tight text-center">Atualize sua Senha</CardTitle>
                    <CardDescription className="text-zinc-400 text-center text-sm max-w-xs">
                        Esta ação é obrigatória. Defina uma nova senha segura para continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="current" className="text-zinc-300 font-medium">Senha Atual Temporária</Label>
                            <div className="relative">
                                <Input
                                    id="current"
                                    type="password"
                                    placeholder="••••••••"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-primary rounded-xl h-12"
                                    required
                                />
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="newpw" className="text-zinc-300 font-medium">Nova Senha</Label>
                            <div className="relative">
                                <Input
                                    id="newpw"
                                    type="password"
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-primary rounded-xl h-12"
                                    required
                                />
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm" className="text-zinc-300 font-medium">Confirmar Nova Senha</Label>
                            <div className="relative">
                                <Input
                                    id="confirm"
                                    type="password"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-primary rounded-xl h-12"
                                    required
                                />
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            </div>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm font-medium pt-1 px-1">
                                {error}
                            </div>
                        )}
                        <Button
                            type="submit"
                            className="w-full h-12 font-bold text-md rounded-xl shadow-lg mt-4 transition-all hover:scale-[1.02]"
                            disabled={loading}
                        >
                            {loading ? 'Atualizando...' : 'Confirmar Nova Senha'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
