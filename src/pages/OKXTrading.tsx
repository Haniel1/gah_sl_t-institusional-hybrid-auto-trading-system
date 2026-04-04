import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Settings, TrendingUp, TrendingDown, Minus, Play, Square, RotateCcw, Zap, Activity, BarChart3, Bot, FlaskConical, ChevronDown, ChevronUp, Trash2, Coins } from 'lucide-react';
import { OKX_STRATEGIES, runStrategy, runAllStrategies, type OKXStrategyResult, type OKXSignal, type StrategyId } from '@/lib/okx-strategies';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import TradingViewChart from '@/components/okx/TradingViewChart';
import AddCoinDialog from '@/components/okx/AddCoinDialog';
import { useOKXSimulation } from '@/hooks/useOKXSimulation';

export default function OKXTrading() {
  useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'simulation' | 'auto'>('simulation');
  const [coins, setCoins] = useState<{ id: string; symbol: string }[]>([]);
  const [selectedCoin, setSelectedCoin] = useState('BTCUSDT.P');
  const [showChart, setShowChart] = useState(true);
  const [showStrategyDetails, setShowStrategyDetails] = useState(false);
  const [autoConfigs, setAutoConfigs] = useState<any[]>([]);

  // Load coins
  const loadCoins = useCallback(async () => {
    const { data } = await supabase.from('okx_sim_coins').select('*').order('added_at', { ascending: true });
    if (data && data.length > 0) {
      setCoins(data);
      if (!data.find(c => c.symbol === selectedCoin)) setSelectedCoin(data[0].symbol);
    }
  }, [selectedCoin]);

  useEffect(() => { loadCoins(); }, [loadCoins]);

  // Load auto configs
  const loadAutoConfigs = useCallback(async () => {
    const { data } = await supabase.from('okx_auto_config').select('*').eq('symbol', selectedCoin);
    if (data) setAutoConfigs(data);
  }, [selectedCoin]);

  useEffect(() => { loadAutoConfigs(); }, [loadAutoConfigs]);

  // Simulation hook
  const {
    simState, trades, candles, currentPrice, loading,
    toggleSimulation, resetSimulation, setStrategy, setLeverage,
  } = useOKXSimulation(selectedCoin);

  // Run all strategies for display
  const [allSignals, setAllSignals] = useState<Record<StrategyId, OKXStrategyResult> | null>(null);
  const lastSignal = candles.length > 50 ? runStrategy(simState.strategy, candles) : null;

  useEffect(() => {
    if (candles.length > 50) setAllSignals(runAllStrategies(candles));
  }, [candles]);

  const removeCoin = async (symbol: string) => {
    await supabase.from('okx_sim_coins').delete().eq('symbol', symbol);
    await supabase.from('okx_sim_state').delete().eq('symbol', symbol);
    await supabase.from('okx_sim_trades').delete().eq('symbol', symbol);
    await supabase.from('okx_auto_config').delete().eq('symbol', symbol);
    toast({ title: `${symbol} dihapus` });
    loadCoins();
  };

  const toggleAutoStrategy = async (configId: string, enabled: boolean) => {
    await supabase.from('okx_auto_config').update({ enabled }).eq('id', configId);
    loadAutoConfigs();
  };

  const unrealizedPnl = simState.position
    ? simState.position.side === 'long'
      ? ((currentPrice - simState.position.entryPrice) / simState.position.entryPrice) * 100 * simState.position.leverage
      : ((simState.position.entryPrice - currentPrice) / simState.position.entryPrice) * 100 * simState.position.leverage
    : 0;

  const totalPnl = simState.totalPnl;
  const winRate = (simState.winCount + simState.lossCount) > 0
    ? ((simState.winCount / (simState.winCount + simState.lossCount)) * 100).toFixed(1)
    : '0';

  const signalColor = (s: OKXSignal) => {
    if (s === 'long') return 'text-profit';
    if (s === 'short') return 'text-loss';
    if (s === 'close_long' || s === 'close_short') return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  const signalIcon = (s: OKXSignal) => {
    if (s === 'long') return <TrendingUp className="w-4 h-4" />;
    if (s === 'short') return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  // Map symbol to TradingView format
  const tvSymbol = `OKX:${selectedCoin.replace('.P', '').replace('USDT', 'USDT')}PERP`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-11 border-b border-border flex items-center px-3 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all mr-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Zap className="w-4 h-4 text-yellow-500 mr-1.5" />
        <span className="font-mono font-bold text-xs text-primary">OKX Futures</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-semibold ml-2">{selectedCoin}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">${currentPrice.toFixed(2)}</span>
          <button onClick={() => navigate('/settings')} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Coin selector */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto bg-card/50">
        <Coins className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {coins.map(c => (
          <div key={c.id} className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setSelectedCoin(c.symbol)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                selectedCoin === c.symbol ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-border hover:border-primary/20'
              }`}>
              {c.symbol}
            </button>
            {coins.length > 1 && (
              <button onClick={() => removeCoin(c.symbol)} className="p-0.5 text-muted-foreground hover:text-loss transition-colors">
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}
        <AddCoinDialog onAdded={loadCoins} existingSymbols={coins.map(c => c.symbol)} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card/80">
        {[
          { id: 'simulation' as const, icon: FlaskConical, label: 'Simulasi' },
          { id: 'auto' as const, icon: Bot, label: 'Auto Trade' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all border-b-2 ${
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* TradingView Chart */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button onClick={() => setShowChart(!showChart)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold text-foreground uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              TradingView Chart
            </div>
            {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showChart && <TradingViewChart symbol={tvSymbol} height={350} />}
        </div>

        {/* Strategy Selector */}
        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Strategi Aktif</h3>
            </div>
            <button onClick={() => setShowStrategyDetails(!showStrategyDetails)} className="text-muted-foreground hover:text-foreground">
              {showStrategyDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.entries(OKX_STRATEGIES) as [StrategyId, typeof OKX_STRATEGIES[StrategyId]][]).map(([id, strat]) => (
              <button key={id} onClick={() => setStrategy(id)}
                className={`text-left p-2 rounded-lg border transition-all ${
                  simState.strategy === id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'
                }`}>
                <div className="text-[11px] font-bold text-foreground">{strat.name}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{strat.description}</div>
              </button>
            ))}
          </div>

          {/* Leverage */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground font-semibold">Leverage:</span>
            <div className="flex gap-1">
              {[20, 50, 75, 100].map(lev => (
                <button key={lev} onClick={() => setLeverage(lev)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                    simState.leverage === lev ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-muted text-muted-foreground border border-border hover:border-yellow-500/20'
                  }`}>
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {showStrategyDetails && allSignals && (
            <div className="space-y-2 pt-2 border-t border-border">
              {(Object.entries(allSignals) as [StrategyId, OKXStrategyResult][]).map(([id, result]) => (
                <div key={id} className="p-2 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-foreground">{OKX_STRATEGIES[id].name}</span>
                    <div className={`flex items-center gap-1 text-[10px] font-bold ${signalColor(result.signal)}`}>
                      {signalIcon(result.signal)}
                      {result.signal.toUpperCase()} ({result.confidence}%)
                    </div>
                  </div>
                  {result.reasons.length > 0 && (
                    <div className="space-y-0.5">
                      {result.reasons.map((r, i) => (
                        <div key={i} className="text-[9px] text-muted-foreground">• {r}</div>
                      ))}
                    </div>
                  )}
                  {result.stopLoss > 0 && (
                    <div className="flex gap-3 mt-1 text-[9px]">
                      <span className="text-loss">SL: ${result.stopLoss.toFixed(2)}</span>
                      <span className="text-profit">TP: ${result.takeProfit.toFixed(2)}</span>
                      <span className="text-yellow-500">Leverage: {result.suggestedLeverage}x</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Signal */}
        {lastSignal && (
          <div className={`border rounded-lg p-3 ${
            lastSignal.signal === 'long' ? 'bg-profit/5 border-profit/30' :
            lastSignal.signal === 'short' ? 'bg-loss/5 border-loss/30' :
            'bg-card border-border'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={signalColor(lastSignal.signal)}>{signalIcon(lastSignal.signal)}</div>
                <div>
                  <div className={`text-sm font-bold ${signalColor(lastSignal.signal)}`}>{lastSignal.signal.toUpperCase()}</div>
                  <div className="text-[9px] text-muted-foreground">Confidence: {lastSignal.confidence}%</div>
                </div>
              </div>
              {lastSignal.stopLoss > 0 && (
                <div className="text-right text-[10px]">
                  <div className="text-loss">SL: ${lastSignal.stopLoss.toFixed(2)}</div>
                  <div className="text-profit">TP: ${lastSignal.takeProfit.toFixed(2)}</div>
                </div>
              )}
            </div>
            {lastSignal.reasons.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {lastSignal.reasons.map((r, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground">• {r}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'simulation' && (
          <>
            {/* Simulation Controls */}
            <div className="bg-card border border-border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-accent" />
                  Simulasi Trading — {selectedCoin}
                </h3>
                <div className="flex gap-1.5">
                  <button onClick={toggleSimulation}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                      simState.isRunning
                        ? 'bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20'
                        : 'bg-profit/10 text-profit border border-profit/20 hover:bg-profit/20'
                    }`}>
                    {simState.isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {simState.isRunning ? 'Stop' : 'Mulai'}
                  </button>
                  <button onClick={resetSimulation}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border hover:bg-border transition-all">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label="Balance" value={`$${simState.balance.toFixed(2)}`} color="text-foreground" />
                <StatCard label="Total P&L" value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? 'text-profit' : 'text-loss'} />
                <StatCard label="Win Rate" value={`${winRate}%`} color="text-foreground" />
                <StatCard label="Trades" value={`${simState.winCount}W / ${simState.lossCount}L`} color="text-foreground" />
              </div>

              {simState.position && (
                <div className={`p-2.5 rounded-lg border ${
                  simState.position.side === 'long' ? 'bg-profit/5 border-profit/30' : 'bg-loss/5 border-loss/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${simState.position.side === 'long' ? 'text-profit' : 'text-loss'}`}>
                        {simState.position.side.toUpperCase()} {simState.position.leverage}x
                      </span>
                      <span className="text-[10px] text-muted-foreground">Entry: ${simState.position.entryPrice.toFixed(2)}</span>
                    </div>
                    <span className={`text-xs font-bold ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground">
                    <span>Size: ${simState.position.amount.toFixed(2)}</span>
                    <span className="text-loss">SL: ${simState.position.stopLoss.toFixed(2)}</span>
                    <span className="text-profit">TP: ${simState.position.takeProfit.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Trade History from DB */}
            {trades.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  Riwayat Simulasi ({trades.length})
                </h3>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {trades.map(trade => (
                    <div key={trade.id} className="flex items-center gap-2 text-[10px] px-2 py-1.5 bg-muted rounded">
                      <span className={`font-bold ${trade.side === 'long' ? 'text-profit' : 'text-loss'}`}>
                        {trade.side.toUpperCase()} {trade.leverage}x
                      </span>
                      <span className="text-muted-foreground">${Number(trade.entry_price).toFixed(0)} → ${Number(trade.exit_price).toFixed(0)}</span>
                      <span className={`font-bold ${Number(trade.pnl) >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {Number(trade.pnl) >= 0 ? '+' : ''}${Number(trade.pnl).toFixed(2)} ({Number(trade.pnl_pct) >= 0 ? '+' : ''}{Number(trade.pnl_pct).toFixed(1)}%)
                      </span>
                      <span className="text-muted-foreground ml-auto">{trade.reason || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'auto' && (
          <div className="bg-card border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Auto Trading — {selectedCoin}</h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Aktifkan strategi untuk auto trading. Simulasi berjalan di background bahkan saat Anda keluar dari web.
            </p>

            <div className="space-y-2">
              {autoConfigs.map(config => {
                const strat = OKX_STRATEGIES[config.strategy as StrategyId];
                if (!strat) return null;
                return (
                  <div key={config.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg border border-border">
                    <div>
                      <div className="text-[11px] font-bold text-foreground">{strat.name}</div>
                      <div className="text-[9px] text-muted-foreground">{strat.description}</div>
                      <div className="flex gap-2 mt-1 text-[9px]">
                        <span className="text-muted-foreground">Leverage: {config.leverage}x</span>
                        <span className="text-muted-foreground">TP: {config.tp_pct}%</span>
                        <span className="text-muted-foreground">SL: {config.sl_pct}%</span>
                        <span className={config.enabled ? 'text-profit' : 'text-muted-foreground'}>
                          {config.enabled ? '● Aktif' : '○ Nonaktif'}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) => toggleAutoStrategy(config.id, checked)}
                      className="scale-75"
                    />
                  </div>
                );
              })}
              {autoConfigs.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">
                  Belum ada konfigurasi auto trade untuk {selectedCoin}.
                  Koin ini akan otomatis dibuat konfigurasinya saat ditambahkan.
                </p>
              )}
            </div>

            <div className="p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
              <p className="text-[10px] text-yellow-500 font-semibold">
                ⚠️ Untuk auto trade real, masukkan API Key OKX di Settings.
                Trading futures dengan leverage tinggi memiliki risiko kerugian besar.
                Simulasi background berjalan via edge function secara berkala.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-2.5 py-2 bg-muted rounded border border-border text-center">
      <div className="text-[9px] text-muted-foreground uppercase font-semibold">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
