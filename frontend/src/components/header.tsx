import { cn } from '@/lib/utils';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, Menu } from 'lucide-react';
import { Notification } from '@/App';

interface HeaderProps {
    title: string;
    onMenuClick?: () => void;
    notifications: Notification[];
    setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
}

export function Header({ title, onMenuClick, notifications, setNotifications }: HeaderProps) {
    const unreadCount = notifications.filter(n => !n.read).length;

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const clearNotifications = () => {
        setNotifications([]);
    };

    return (
        <div className="flex justify-between items-center mb-8 gap-4 px-4 md:px-0 pt-4 md:pt-0">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={onMenuClick}
                >
                    <Menu className="h-6 w-6" />
                </Button>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold">{title}</h1>
                    <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4 pr-4 md:pr-0">
                <ModeToggle />

                <Popover onOpenChange={(open) => open && markAllAsRead()}>
                    <PopoverTrigger asChild>
                        <button className="p-2 text-muted-foreground hover:text-foreground relative">
                            <Bell className="w-6 h-6" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background flex items-center justify-center text-[10px] text-white font-bold">
                                    {unreadCount}
                                </span>
                            )}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 shadow-2xl border-border bg-card" align="end">
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h4 className="font-bold text-sm">Notificações</h4>
                            {notifications.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground" onClick={clearNotifications}>
                                    Limpar tudo
                                </Button>
                            )}
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    Nenhuma notificação por enquanto.
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {notifications.map((n) => (
                                        <div key={n.id} className={cn(
                                            "p-4 border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
                                            !n.read && "bg-primary/5"
                                        )}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={cn(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                                    n.type === 'success' && "bg-emerald-500/10 text-emerald-500",
                                                    n.type === 'warning' && "bg-amber-500/10 text-amber-500",
                                                    n.type === 'error' && "bg-red-500/10 text-red-500",
                                                    n.type === 'info' && "bg-blue-500/10 text-blue-500",
                                                )}>
                                                    {n.title}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground italic">
                                                    {new Date(n.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="text-sm text-foreground/80 leading-tight">
                                                {n.message}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="flex items-center gap-3 pl-2 md:pl-4 border-l">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold">Admin</p>
                        <p className="text-xs text-muted-foreground">admin@mf.com</p>
                    </div>
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                        AD
                    </div>
                </div>
            </div>
        </div>
    );
}
