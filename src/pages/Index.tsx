import { useState } from 'react';
import IndodaxPortfolio from '@/components/IndodaxPortfolio';
import CoinSidebar from '@/components/CoinSidebar';
import TradingChart from '@/components/TradingChart';
import StrategyPanel from '@/components/StrategyPanel';
import AutoTradePanel from '@/components/AutoTradePanel';
import AIAdvisorPanel from '@/components/AIAdvisorPanel';
import FavoriteCoins from '@/components/FavoriteCoins';
import MarketStatsBar from '@/components/trading/MarketStatsBar';
import OrderBookPanel from '@/components/trading/OrderBookPanel';
import RecentTradesPanel from '@/components/trading/RecentTradesPanel';
import TechnicalSummary from '@/components/trading/TechnicalSummary';
import PriceAlerts from '@/components/trading/PriceAlerts';
import { useIndodaxData } from '@/hooks/useIndodaxData';
import { AutoTrading } from '@/components/dashboard/AutoTrading';
import { SimulationTrading } from '@/components/dashboard/SimulationTrading';
import { TelegramCenter } from '@/components/dashboard/TelegramCenter';
import { TimePredictionPanel } from '@/components/dashboard/TimePredictionPanel';
import { useNavigate, Link } from 'react-router-dom';
import { Settings, Maximize2, Minimize2, Bot, LineChart, ChevronDown, ChevronUp, LogOut } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import type { IndicatorTemplateId } from '@/components/TradingChart';

const BOTTOM_TABS = [
  { id: 'favorites' as const, label: 'Favorit', icon: '⭐' },
  { id: 'autotrade' as const, label: 'Auto Trade', icon: '🤖' },
  { id: 'prediction' as const, label: 'Prediksi', icon: '🕐' },
  { id: 'orderbook' as const, label: 'Order Book', icon: '📊' },
  { id: 'trades' as const, label: 'Trades', icon: '⚡' },
  { id: 'technical' as const, label: 'Technical', icon: '📈' },
  { id: 'alerts' as const, label: 'Alerts', icon: '🔔' },
  { id: 'ai' as const, label: 'AI Advisor', icon: '🧠' },
];

export default function Dashboard() {
  const [selectedPair, setSelectedPair] = useState('btc_idr');
  const [strategy, setStrategy] = useState('none');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<'chart' | 'dashboard'>('chart');
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<'favorites' | 'autotrade' | 'prediction' | 'orderbook' | 'trades' | 'technical' | 'alerts' | 'ai'>('favorites');
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null);
  const [customPineCode, setCustomPineCode] = useState('');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();

  const { allCoins } = useIndodaxData();

  const selectedSymbol = selectedPair.replace('_idr', '').toUpperCase();
  const currentCoin = allCoins.find(c => c.id === selectedPair);

  const NAV_ITEMS = [
    { key: 'chart', label: 'Chart', emoji: '📈' },
    { key: 'dashboard', label: 'Dashboard', emoji: '📊' },
  ];

  const handleApplyPineCode = (code: string, _name: string) => {
    setCustomPineCode(code);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-11 border-b border-border flex items-center px-3 sm:px-4 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-profit animate-pulse" />
          <span className="font-mono font-bold text-xs sm:text-sm text-primary tracking-wider">GainzHalving</span>
        </div>

        <div className="ml-3 sm:ml-4 flex items-center gap-0.5 sm:gap-1">
          {NAV_ITEMS.map(item => (
            <button key={item.key} onClick={() => setView(item.key as any)}
              className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-[11px] font-semibold transition-all ${
                view === item.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}>
              <span className="mr-1">{item.emoji}</span>
              {!isMobile && item.label}
            </button>
          ))}
          <Link to="/news" className="px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            📰 {!isMobile && 'Berita'}
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{user?.name}</span>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all hidden sm:flex"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => navigate('/settings')} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button onClick={logout} className="p-1.5 rounded-md text-muted-foreground hover:text-loss hover:bg-loss/10 transition-all">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {view === 'chart' ? (
        <div className="flex-1 flex flex-col">
          {/* Market Stats Bar */}
          <MarketStatsBar pair={selectedPair} />

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Sidebar */}
            {!sidebarCollapsed && !isMobile && (
              <div className="lg:shrink-0">
                <CoinSidebar selectedPair={selectedPair} onSelectPair={setSelectedPair} />
              </div>
            )}
            {isMobile && (
              <CoinSidebar selectedPair={selectedPair} onSelectPair={setSelectedPair} />
            )}

            {/* Main content */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Chart - full width */}
              <div className="w-full h-[40vh] sm:h-[45vh] lg:h-[55vh] min-h-[280px]">
                <TradingChart
                  pair={selectedPair}
                  strategy={strategy}
                  indicatorTemplate={activeIndicator as IndicatorTemplateId}
                  customPineCode={activeIndicator === 'custom-pine' ? customPineCode : ''}
                />
              </div>

              {/* Bottom Panels */}
              <div className="border-t border-border flex-1 min-h-0">
                <div className="flex items-center border-b border-border bg-card/80 overflow-x-auto scrollbar-thin">
                  {BOTTOM_TABS.map(tab => (
                    <button key={tab.id} onClick={() => setBottomTab(tab.id)}
                      className={`tab-button ${bottomTab === tab.id ? 'tab-button-active' : 'tab-button-inactive'}`}>
                      <span>{tab.icon}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>

                <div className="h-[200px] sm:h-[250px] lg:h-[280px] overflow-hidden">
                  {bottomTab === 'orderbook' && <OrderBookPanel pair={selectedPair} />}
                  {bottomTab === 'trades' && <RecentTradesPanel pair={selectedPair} />}
                  {bottomTab === 'technical' && <TechnicalSummary pair={selectedPair} />}
                  {bottomTab === 'alerts' && <PriceAlerts pair={selectedPair} currentPrice={currentCoin?.last || 0} />}
                  {bottomTab === 'ai' && (
                    <div className="p-3 h-full overflow-y-auto scrollbar-thin">
                      <AIAdvisorPanel coin={selectedSymbol} price={currentCoin?.last || 0}
                        change24h={currentCoin?.change24h || 0} volume={currentCoin?.volumeIdr || 0} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Strategy Panel */}
            {isMobile ? (
              <div className="border-t border-border bg-card">
                <button onClick={() => setStrategyOpen(!strategyOpen)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                  <span>⚙️ Strategy Engine</span>
                  {strategyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${strategyOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <StrategyPanel
                    activeStrategy={strategy} onStrategyChange={setStrategy}
                    activeIndicator={activeIndicator} onIndicatorChange={setActiveIndicator}
                    onApplyPineCode={handleApplyPineCode} selectedPair={selectedPair}
                    customPineCode={customPineCode} onCustomPineCodeChange={setCustomPineCode}
                  />
                </div>
              </div>
            ) : (
              <div className="lg:w-[280px] shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
                <StrategyPanel
                  activeStrategy={strategy} onStrategyChange={setStrategy}
                  activeIndicator={activeIndicator} onIndicatorChange={setActiveIndicator}
                  onApplyPineCode={handleApplyPineCode} selectedPair={selectedPair}
                  customPineCode={customPineCode} onCustomPineCodeChange={setCustomPineCode}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Dashboard View */
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { to: '/auto-trading', icon: Bot, color: 'primary', title: 'Auto Trading', desc: 'Trend Following' },
                { to: '/trade-history', icon: LineChart, color: 'primary', title: 'Riwayat', desc: 'Log & Equity' },
              ].map(item => (
                <Link key={item.to} to={item.to}
                  className="group flex items-center gap-3 p-3.5 bg-card border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all">
                  <item.icon className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">{item.title}</h3>
                    <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            <IndodaxPortfolio />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <FavoriteCoins onSelectPair={setSelectedPair} selectedPair={selectedPair} />
              <AutoTradePanel pair={selectedPair} strategy={strategy} onOpenSettings={() => navigate('/settings')} />
            </div>

            <TimePredictionPanel symbol={selectedPair.replace('_idr', '').toUpperCase()} />
            <AutoTrading coins={allCoins} />
            <SimulationTrading coins={allCoins} />
            <TelegramCenter coins={allCoins} />
          </div>
        </div>
      )}
    </div>
  );
}
