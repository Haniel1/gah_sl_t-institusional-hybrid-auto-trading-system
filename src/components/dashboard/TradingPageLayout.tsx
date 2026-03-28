import { useState, useCallback, useMemo } from 'react';
import { CoinData } from '@/types/crypto';
import { AddCoinDialog } from './AddCoinDialog';
import { calculateSignal } from '@/utils/signals';
import { formatRupiah, formatPercent, formatVolume } from '@/utils/format';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentHalvingPhase } from '@/lib/strategies';
import TradingChart from '@/components/TradingChart';
import StrategyPanel from '@/components/StrategyPanel';
import FavoriteCoins from '@/components/FavoriteCoins';
import AutoTradePanel from '@/components/AutoTradePanel';
import AIAdvisorPanel from '@/components/AIAdvisorPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ArrowLeft, Search, TrendingUp, TrendingDown, Minus,
  BarChart3, ChevronDown, ChevronUp, Settings, Bot, Loader2,
} from 'lucide-react';

interface TradingPageLayoutProps {
  mode: 'short-term' | 'long-term';
  defaultCoins: string[];
  defaultIndicators: string[];
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tpPct: number;
  slPct: number;
  autoStrategy?: string;
  allCoins: CoinData[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refetch: () => void;
}

export function TradingPageLayout({
  mode, defaultCoins, defaultIndicators, title, subtitle, icon,
  tpPct, slPct, autoStrategy, allCoins, loading, error, lastUpdate, refetch,
}: TradingPageLayoutProps) {
  const [watchlist, setWatchlist] = useState<string[]>(defaultCoins);
  const [selectedCoin, setSelectedCoin] = useState<string>(defaultCoins[1] || defaultCoins[0] || 'BTC');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStrategies, setActiveStrategies] = useState<string[]>(defaultIndicators.length > 0 ? [defaultIndicators[0]] : []);
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [customPineCode, setCustomPineCode] = useState('');
  const [sortBy, setSortBy] = useState<'VOL' | 'CHG%' | 'PRICE'>('VOL');
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [tradeLoading, setTradeLoading] = useState<'buy' | 'sell' | 'auto' | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const isMobile = useIsMobile();

  const executeQuickTrade = async (tradeType: 'buy' | 'sell') => {
    const currentPair = activeCoinData ? activeCoinData.id : `${selectedCoin.toLowerCase()}_idr`;
    setTradeLoading(tradeType);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      // Get price
      const tickerEndpoint = `ticker/${currentPair.replace('_', '')}`;
      const proxyRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/indodax-proxy?endpoint=${encodeURIComponent(tickerEndpoint)}`
      );
      const proxyData = await proxyRes.json();
      const price = proxyData?.ticker?.last || proxyData?.ticker?.buy || 0;
      if (!price) { toast.error('Gagal mendapatkan harga'); return; }

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', pair: currentPair, strategy: autoStrategy || 'swing-short-term', type: tradeType, price }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${tradeType.toUpperCase()} ${selectedCoin} berhasil @ Rp ${Number(price).toLocaleString('id-ID')}`);
      } else {
        toast.error(data.error || 'Trade gagal');
      }
    } catch (err) {
      toast.error('Gagal eksekusi trade');
    } finally {
      setTradeLoading(null);
    }
  };

  const toggleQuickAuto = async () => {
    const currentPair = activeCoinData ? activeCoinData.id : `${selectedCoin.toLowerCase()}_idr`;
    setTradeLoading('auto');
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', pair: currentPair, strategy: autoStrategy || 'swing-short-term' }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoTradeEnabled(data.config.enabled);
        toast.success(`Auto-trade ${data.config.enabled ? 'AKTIF' : 'NONAKTIF'} untuk ${selectedCoin}`);
      }
    } catch (err) {
      toast.error('Gagal toggle auto-trade');
    } finally {
      setTradeLoading(null);
    }
  };

  const addCoin = useCallback((symbol: string) => {
    setWatchlist(prev => prev.includes(symbol) ? prev : [...prev, symbol]);
  }, []);

  const watchlistCoins = useMemo(() => {
    let coins = allCoins
      .filter(c => watchlist.includes(c.symbol))
      .map(c => {
        const spread = c.last > 0 ? ((c.sell - c.buy) / c.last) * 100 : 99;
        return { ...c, spread };
      });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      coins = coins.filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }

    if (sortBy === 'VOL') coins.sort((a, b) => b.volumeIdr - a.volumeIdr);
    else if (sortBy === 'CHG%') coins.sort((a, b) => b.change24h - a.change24h);
    else coins.sort((a, b) => b.last - a.last);

    return coins;
  }, [allCoins, watchlist, searchQuery, sortBy]);

  const activeCoinData = allCoins.find(c => c.symbol === selectedCoin);
  const selectedPair = activeCoinData ? activeCoinData.id : `${selectedCoin.toLowerCase()}_idr`;

  const handleSelectPair = useCallback((pair: string) => {
    const symbol = pair.replace('_idr', '').toUpperCase();
    setSelectedCoin(symbol);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-10 border-b border-border flex items-center px-4 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
        <Link to="/" className="p-1 rounded hover:bg-muted transition-colors mr-2">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        {icon}
        <span className="text-xs font-bold text-foreground uppercase tracking-wider ml-2">{title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold ml-2 hidden sm:inline">{subtitle}</span>
        
        {/* Quick Trade Buttons - Dual Signal Engine */}
        <div className="ml-3 flex items-center gap-1">
          <button
            onClick={() => executeQuickTrade('buy')}
            disabled={tradeLoading !== null}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold font-mono bg-profit/15 text-profit border border-profit/30 hover:bg-profit/25 disabled:opacity-50 transition-all"
          >
            {tradeLoading === 'buy' ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
            BUY
          </button>
          <button
            onClick={toggleQuickAuto}
            disabled={tradeLoading !== null}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold font-mono transition-all ${
              autoTradeEnabled
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground'
            }`}
          >
            {tradeLoading === 'auto' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
            AUTO
          </button>
          <button
            onClick={() => executeQuickTrade('sell')}
            disabled={tradeLoading !== null}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold font-mono bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25 disabled:opacity-50 transition-all"
          >
            {tradeLoading === 'sell' ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingDown className="w-3 h-3" />}
            SELL
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <AddCoinDialog coins={allCoins} existingSymbols={watchlist} mode={mode} onAdd={addCoin} />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1">
        <div className="flex flex-col lg:flex-row">
          {/* LEFT: Coin List Sidebar */}
          <div className="lg:w-[280px] lg:shrink-0 border-r border-border bg-card">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Markets</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{watchlistCoins.length} pairs</span>
            </div>

            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 bg-muted border border-border rounded px-2 py-1.5">
                <Search className="w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari koin..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none flex-1 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-0 px-3 py-1.5 border-b border-border">
              {(['VOL', 'CHG%', 'PRICE'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                    sortBy === s ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="max-h-[60vh] lg:max-h-[calc(100vh-10rem)] overflow-y-auto scrollbar-thin">
              {watchlistCoins.map(coin => {
                const isActive = coin.symbol === selectedCoin;
                return (
                  <button
                    key={coin.id}
                    onClick={() => setSelectedCoin(coin.symbol)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors border-l-2 ${
                      isActive
                        ? 'bg-primary/10 border-primary'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-foreground">{coin.symbol}</span>
                        <span className="text-[9px] text-muted-foreground">/IDR</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground">Vol: {formatVolume(coin.volumeIdr)}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-foreground font-mono">
                        {coin.last >= 1e6 ? `${(coin.last / 1e6).toFixed(2)}M` : formatRupiah(coin.last).replace('Rp', '')}
                      </div>
                      <div className={`text-[10px] font-semibold ${coin.change24h >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {coin.change24h >= 0 ? '↗' : '↘'} {formatPercent(coin.change24h)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER: Chart + Panels below */}
          <div className="flex-1 min-w-0">
            {/* Chart - lebih compact untuk lihat FVG & Liquidity */}
            <div className="w-full h-[55vh] sm:h-[60vh] lg:h-[65vh] max-w-[650px] mx-auto max-h-[700px] min-h-[350px]">
              {activeCoinData ? (
                <TradingChart pair={selectedPair} strategies={activeStrategies} activeIndicators={activeIndicators} customPineCode={customPineCode} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Pilih koin dari daftar di kiri
                </div>
              )}
            </div>

            {/* Panels below chart */}
            <div className="border-t border-border p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FavoriteCoins onSelectPair={handleSelectPair} selectedPair={selectedPair} />
                <AutoTradePanel pair={selectedPair} strategy={activeStrategy} onOpenSettings={() => {}} />
              </div>
              <div className="mt-3">
                <AIAdvisorPanel
                  coin={selectedCoin}
                  price={activeCoinData?.last || 0}
                  change24h={activeCoinData?.change24h || 0}
                  volume={activeCoinData?.volumeIdr || 0}
                />
              </div>
            </div>
          </div>

          {/* RIGHT: Strategy Engine */}
          {isMobile ? (
            <div className="border-t border-border bg-card">
              <button
                onClick={() => setStrategyOpen(!strategyOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span>Strategy Engine</span>
                {strategyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                strategyOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              }`}>
                <StrategyPanel
                  activeStrategies={activeStrategies} onStrategyToggle={(id: string) => setActiveStrategies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                  activeIndicators={activeIndicators} onIndicatorToggle={(id: string) => setActiveIndicators(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                  customPineCode={customPineCode} onCustomPineCodeChange={setCustomPineCode}
                />
              </div>
            </div>
          ) : (
            <div className="lg:w-[260px] shrink-0 border-l border-border bg-card">
              <StrategyPanel
                activeStrategies={activeStrategies} onStrategyToggle={(id: string) => setActiveStrategies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                activeIndicators={activeIndicators} onIndicatorToggle={(id: string) => setActiveIndicators(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                customPineCode={customPineCode} onCustomPineCodeChange={setCustomPineCode}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
