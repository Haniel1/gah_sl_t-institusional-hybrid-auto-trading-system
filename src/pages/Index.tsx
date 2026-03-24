import { useState } from 'react';
import IndodaxPortfolio from '@/components/IndodaxPortfolio';
import CoinSidebar from '@/components/CoinSidebar';
import TradingChart from '@/components/TradingChart';
import StrategyPanel from '@/components/StrategyPanel';
import AutoTradePanel from '@/components/AutoTradePanel';
import AIAdvisorPanel from '@/components/AIAdvisorPanel';
import FavoriteCoins from '@/components/FavoriteCoins';
import { useIndodaxData } from '@/hooks/useIndodaxData';
import { AutoTrading } from '@/components/dashboard/AutoTrading';
import { TradingViewAutoTrading } from '@/components/dashboard/TradingViewAutoTrading';
import { SimulationTrading } from '@/components/dashboard/SimulationTrading';
import { TelegramCenter } from '@/components/dashboard/TelegramCenter';
import { TimePredictionPanel } from '@/components/dashboard/TimePredictionPanel';
import { useNavigate, Link } from 'react-router-dom';
import { Settings, Maximize2, Minimize2, Bot, LineChart, Layers, ChevronDown, ChevronUp, LogOut, BarChart3 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const [selectedPair, setSelectedPair] = useState('btc_idr');
  const [strategy, setStrategy] = useState('none');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<'chart' | 'dashboard'>('chart');
  const [strategyOpen, setStrategyOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();

  const { allCoins } = useIndodaxData();

  const NAV_ITEMS = [
    { key: 'chart', label: 'Chart', emoji: '📈' },
    { key: 'dashboard', label: 'Dashboard', emoji: '📊' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar - improved */}
      <header className="h-11 border-b border-border flex items-center px-4 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-profit animate-pulse" />
          <span className="font-mono font-bold text-sm text-primary tracking-wider">GainzHalving</span>
        </div>

        {/* Nav tabs */}
        <div className="ml-4 flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setView(item.key as any)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                view === item.key
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span className="mr-1">{item.emoji}</span>
              {item.label}
            </button>
          ))}
          <Link
            to="/news"
            className="px-3 py-1 rounded-md text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            📰 Berita
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{user?.name}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={logout}
              className="p-1.5 rounded-md text-muted-foreground hover:text-loss hover:bg-loss/10 transition-all"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {view === 'chart' ? (
        <div className="flex-1">
          <div className="flex flex-col lg:flex-row">
            {/* Sidebar */}
            {!sidebarCollapsed && (
              <div className="lg:shrink-0">
                <CoinSidebar selectedPair={selectedPair} onSelectPair={setSelectedPair} />
              </div>
            )}

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="w-full h-[50vh] sm:h-[55vh] lg:h-[60vh] max-h-[650px] min-h-[350px] max-w-[650px] mx-auto">
                <TradingChart pair={selectedPair} strategy={strategy} />
              </div>

              <div className="border-t border-border p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FavoriteCoins onSelectPair={setSelectedPair} selectedPair={selectedPair} />
                  <AutoTradePanel pair={selectedPair} strategy={strategy} onOpenSettings={() => navigate('/settings')} />
                </div>
                <TimePredictionPanel symbol={selectedPair.replace('_idr', '').toUpperCase()} />
                <AIAdvisorPanel
                  coin={selectedPair.replace('_idr', '').toUpperCase()}
                  price={allCoins.find(c => c.id === selectedPair)?.last || 0}
                  change24h={allCoins.find(c => c.id === selectedPair)?.change24h || 0}
                  volume={allCoins.find(c => c.id === selectedPair)?.volumeIdr || 0}
                />
              </div>
            </div>

            {/* Strategy Panel */}
            {isMobile ? (
              <div className="border-t border-border bg-card">
                <button
                  onClick={() => setStrategyOpen(!strategyOpen)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span>⚙️ Strategy Engine</span>
                  {strategyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  strategyOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <StrategyPanel activeStrategy={strategy} onStrategyChange={setStrategy} />
                </div>
              </div>
            ) : (
              <div className="lg:w-[260px] shrink-0 border-l border-border bg-card">
                <StrategyPanel activeStrategy={strategy} onStrategyChange={setStrategy} />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Dashboard View - improved cards */
        <div className="flex-1 p-4">
          <div className="max-w-7xl mx-auto space-y-4">
            {/* Quick Nav Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { to: '/auto-trading', icon: Bot, color: 'primary', title: 'Auto Trading', desc: 'Trend Following' },
                { to: '/trade-history', icon: LineChart, color: 'primary', title: 'Riwayat', desc: 'Log & Equity' },
                { to: '/trading-view', icon: Layers, color: 'accent', title: 'Trading View', desc: 'Pine Script' },
              ].map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group flex items-center gap-3 p-3.5 bg-card border border-border rounded-lg hover:border-${item.color}/40 hover:bg-${item.color}/5 transition-all`}
                >
                  <item.icon className={`h-5 w-5 text-${item.color} shrink-0`} />
                  <div className="min-w-0">
                    <h3 className={`text-xs font-bold text-foreground group-hover:text-${item.color} transition-colors truncate`}>{item.title}</h3>
                    <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            <IndodaxPortfolio />
            <AutoTrading coins={allCoins} />
            <SimulationTrading coins={allCoins} />
            <TelegramCenter coins={allCoins} />
          </div>
        </div>
      )}
    </div>
  );
}
