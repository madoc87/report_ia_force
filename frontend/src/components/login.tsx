import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Lock, Mail } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';

// Add type declaration for Vite's import.meta.env
declare global {
    interface ImportMeta {
        env: Record<string, string>;
    }
}

interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    theme?: string;
    force_password_change: boolean;
}

interface LoginProps {
    onLogin: (token: string, user: User) => void;
}

export function Login({ onLogin }: LoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Remove any lingering layout locks from Radix UI Popovers/Dialogs unmounting abruptly
    useEffect(() => {
        document.body.style.pointerEvents = '';
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';
            const response = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Credenciais incorretas.');
            }

            const data = await response.json();
            onLogin(data.token, data.user);
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>
            <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl">
                <CardHeader className="space-y-3 pb-6 flex flex-col items-center">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
                        <Bot className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-3xl font-bold tracking-tight text-center">Report IA Force</CardTitle>
                    <CardDescription className="text-muted-foreground text-center text-sm max-w-xs">
                        Digite seu e-mail e senha para acessar o sistema.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="font-medium">E-mail</Label>
                            <div className="relative">
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="seu@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 bg-background border-input text-foreground focus-visible:ring-primary rounded-xl h-12"
                                    required
                                />
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="font-medium">Senha</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 bg-background border-input text-foreground focus-visible:ring-primary rounded-xl h-12"
                                    required
                                />
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
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
                            {loading ? 'Autenticando...' : 'Acessar Sistema'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
