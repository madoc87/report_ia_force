import { LayoutDashboard, FileText, ShoppingCart, Package, Users, BarChart3, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModeToggle } from '@/components/mode-toggle';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ activeTab, setActiveTab, isOpen, onClose }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
    { id: 'relatorios', label: 'Relatórios', icon: FileText, enabled: true },
    { id: 'vendas', label: 'Vendas', icon: ShoppingCart, enabled: false },
    { id: 'produtos', label: 'Produtos', icon: Package, enabled: false },
    { id: 'clientes', label: 'Clientes', icon: Users, enabled: false },
    { id: 'analises', label: 'Análises', icon: BarChart3, enabled: false },
    { id: 'configuracoes', label: 'Configurações', icon: Settings, enabled: false },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <div className={cn(
        "flex flex-col h-screen w-60 bg-background text-foreground border-e fixed md:sticky top-0 z-50 shadow-2xl transition-transform duration-300 shrink-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/src/assets/dash-report.svg" alt="logo Report IA Force" />
            </div>
            <span className="text-xl font-bold">Report IA Force</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              disabled={!item.enabled}
              onClick={() => {
                if (!item.enabled) return;
                setActiveTab(item.id);
                if (onClose) onClose();
              }}
              className={cn(
                "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors",
                activeTab === item.id
                  ? "bg-primary text-primary-foreground"
                  : item.enabled
                    ? "text-muted-foreground/90 hover:bg-accent hover:text-accent-foreground"
                    : "text-muted-foreground/30 cursor-not-allowed"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 mt-auto border-t border-border">
          <button className="flex justify-between items-center w-full px-4 py-3 text-muted-foreground hover:text-foreground transition-colors">
            <div className='flex gap-3 items-center'>
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sair</span>
            </div>
            <ModeToggle />
          </button>
        </div>
      </div>
    </>
  );
}
