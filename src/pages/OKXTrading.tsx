import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Settings, TrendingUp, TrendingDown, Minus, Play, Square, RotateCcw, Zap, Activity, BarChart3, Bot, FlaskConical, ChevronDown, ChevronUp, Trash2, Coins, Key } from 'lucide-react';
import { OKX_STRATEGIES, runAllStrategies, type OKXStrategyResult, type OKXSignal, type StrategyId } from '@/lib/okx-strategies';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import TradingViewChart from '@/components/okx/TradingViewChart';
import AddCoinDialog from '@/components/okx/AddCoinDialog';
import { useMultiStrategySimulation } from '@/hooks/useMultiStrategySimulation';

const ALL_STRATEGIES: StrategyId[] = ['trend-scalping', 'smart-money', 'multi-indicator', 'gainz-algo-v3', 'luxalgo-iof'];

export default function OKXTrading() {
  useAuth();
  const navigate = useNavigate();
  const [coins, setCoins] = useState<{ id: string; symbol: string }[]>([]);
  const [selectedCoin, setSelectedCoin] = useState('BTCUSDT.P');
  const [showChart, setShowChart] = useState(true);
  const [expandedStrategy, setExpandedStrategy] = useState<StrategyId | null>(null);
  const [autoConfigs, setAutoConfigs] = useState<any[]>([]);
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({ api_key: '', secret: '', passphrase: '' });
  const [savingKeys, setSavingKeys] = useState(false);

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

  // Multi-strategy simulation
  const {
    simStates, trades, candles, currentPrice,
    toggleStrategy, resetStrategy, setLeverage,
  } = useMultiStrategySimulation(selectedCoin);

  // All signals display
  const [allSignals, setAllSignals] = useState<Record<StrategyId, OKXStrategyResult> | null>(null);
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

  // Save OKX API keys
  const { user } = useAuth();
  const saveApiKeys = async () => {
    if (!user || !apiKeyForm.api_key || !apiKeyForm.secret || !apiKeyForm.passphrase) {
      toast({ title: 'Semua field harus diisi', variant: 'destructive' });
      return;
    }
    setSavingKeys(true);
    const { error } = await supabase.from('trading_users').update({
      okx_api_key: apiKeyForm.api_key,
      okx_secret: apiKeyForm.secret,
      okx_passphrase: apiKeyForm.passphrase,
    }).eq('id', user.id);
    setSavingKeys(false);
    if (error) {
      toast({ title: 'Gagal menyimpan API Key', variant: 'destructive' });
    } else {
      toast({ title: 'API Key OKX berhasil disimpan' });
      setShowApiKeyForm(false);
      setApiKeyForm({ api_key: '', secret: '', passphrase: '' });
    }
  };

  const tvSymbol = `OKX:${selectedCoin.replace('.P', '').replace('USDT', 'USDT')}PERP`;

  const signalColor = (s: OKXSignal) => {
    if (s === 'long') return 'text-profit';
    if (s === 'short') return 'text-loss';
    if (s === 'close_long' || s === 'close_short') return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  const signalIcon = (s: OKXSignal) => {
    if (s === 'long') return <TrendingUp className="w-3.5 h-3.5" />;
    if (s === 'short') return <TrendingDown className="w-3.5 h-3.5" />;
    return <Minus className="w-3.5 h-3.5" />;
  };

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
          <button onClick={() => setShowApiKeyForm(!showApiKeyForm)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="OKX API Key">
            <Key className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => navigate('/settings')} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* API Key Form */}
      {showApiKeyForm && (
        <div className="px-3 py-2 bg-card border-b border-border space-y-2">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-primary" /> Masukkan OKX API Key
          </h4>
          <p className="text-[10px] text-muted-foreground">
            Buat API Key di <span className="text-primary">okx.com → API → Create API Key</span>. Pilih permission "Trade" dan atur IP whitelist.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="password" placeholder="API Key" value={apiKeyForm.api_key}
              onChange={e => setApiKeyForm(p => ({ ...p, api_key: e.target.value }))}
              className="px-2 py-1.5 rounded bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <input type="password" placeholder="Secret Key" value={apiKeyForm.secret}
              onChange={e => setApiKeyForm(p => ({ ...p, secret: e.target.value }))}
              className="px-2 py-1.5 rounded bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <input type="password" placeholder="Passphrase" value={apiKeyForm.passphrase}
              onChange={e => setApiKeyForm(p => ({ ...p, passphrase: e.target.value }))}
              className="px-2 py-1.5 rounded bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={saveApiKeys} disabled={savingKeys}
              className="px-3 py-1.5 rounded text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {savingKeys ? 'Menyimpan...' : 'Simpan API Key'}
            </button>
            <button onClick={() => setShowApiKeyForm(false)}
              className="px-3 py-1.5 rounded text-[10px] font-bold bg-muted text-muted-foreground border border-border hover:bg-border">
              Batal
            </button>
          </div>
        </div>
      )}

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

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* TradingView Chart - 4:3 aspect ratio */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button onClick={() => setShowChart(!showChart)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold text-foreground uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              TradingView Chart
            </div>
            {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showChart && (
            <div className="w-full" style={{ aspectRatio: '4/3' }}>
              <TradingViewChart symbol={tvSymbol} height={undefined} />
            </div>
          )}
        </div>

        {/* Per-Strategy Simulations & Auto Trading */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2 px-1">
            <Activity className="w-4 h-4 text-primary" />
            Simulasi & Auto Trade Per Strategi
          </h3>

          {ALL_STRATEGIES.map(sid => {
            const strat = OKX_STRATEGIES[sid];
            const state = simStates[sid];
            const stratTrades = trades[sid] || [];
            const signal = allSignals?.[sid];
            const autoConfig = autoConfigs.find(c => c.strategy === sid);
            const isExpanded = expandedStrategy === sid;

            const unrealizedPnl = state.position
              ? state.position.side === 'long'
                ? ((currentPrice - state.position.entryPrice) / state.position.entryPrice) * 100 * state.position.leverage
                : ((state.position.entryPrice - currentPrice) / state.position.entryPrice) * 100 * state.position.leverage
              : 0;

            const winRate = (state.winCount + state.lossCount) > 0
              ? ((state.winCount / (state.winCount + state.lossCount)) * 100).toFixed(1)
              : '0';

            return (
              <div key={sid} className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Strategy Header */}
                <button onClick={() => setExpandedStrategy(isExpanded ? null : sid)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${state.isRunning ? 'bg-profit animate-pulse' : 'bg-muted-foreground/30'}`} />
                    <div className="text-left min-w-0">
                      <div className="text-[11px] font-bold text-foreground truncate">{strat.name}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{strat.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {signal && (
                      <div className={`flex items-center gap-0.5 text-[10px] font-bold ${signalColor(signal.signal)}`}>
                        {signalIcon(signal.signal)}
                        {signal.signal.toUpperCase()}
                      </div>
                    )}
                    <span className={`text-[10px] font-bold ${state.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {state.totalPnl >= 0 ? '+' : ''}${state.totalPnl.toFixed(2)}
                    </span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border">
                    {/* Signal Details */}
                    {signal && signal.reasons.length > 0 && (
                      <div className={`mt-2 p-2 rounded-lg border ${
                        signal.signal === 'long' ? 'bg-profit/5 border-profit/20' :
                        signal.signal === 'short' ? 'bg-loss/5 border-loss/20' : 'bg-muted border-border'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className={`flex items-center gap-1 text-[10px] font-bold ${signalColor(signal.signal)}`}>
                            {signalIcon(signal.signal)} {signal.signal.toUpperCase()} — {signal.confidence}%
                          </div>
                          {signal.stopLoss > 0 && (
                            <div className="flex gap-2 text-[9px]">
                              <span className="text-loss">SL: ${signal.stopLoss.toFixed(2)}</span>
                              <span className="text-profit">TP: ${signal.takeProfit.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                        {signal.reasons.map((r, idx) => (
                          <div key={idx} className="text-[9px] text-muted-foreground">• {r}</div>
                        ))}
                      </div>
                    )}

                    {/* Simulation Controls */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-foreground uppercase flex items-center gap-1.5">
                          <FlaskConical className="w-3.5 h-3.5 text-accent" /> Simulasi
                        </h4>
                        <div className="flex gap-1.5">
                          <button onClick={() => toggleStrategy(sid)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                              state.isRunning
                                ? 'bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20'
                                : 'bg-profit/10 text-profit border border-profit/20 hover:bg-profit/20'
                            }`}>
                            {state.isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            {state.isRunning ? 'Stop' : 'Mulai'}
                          </button>
                          <button onClick={() => resetStrategy(sid)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-muted text-muted-foreground border border-border hover:bg-border">
                            <RotateCcw className="w-3 h-3" /> Reset
                          </button>
                        </div>
                      </div>

                      {/* Leverage */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground font-semibold">Leverage:</span>
                        {[20, 50, 75, 100].map(lev => (
                          <button key={lev} onClick={() => setLeverage(sid, lev)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                              state.leverage === lev ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-muted text-muted-foreground border border-border hover:border-yellow-500/20'
                            }`}>
                            {lev}x
                          </button>
                        ))}
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-1.5">
                        <MiniStat label="Balance" value={`$${state.balance.toFixed(0)}`} color="text-foreground" />
                        <MiniStat label="P&L" value={`${state.totalPnl >= 0 ? '+' : ''}$${state.totalPnl.toFixed(2)}`} color={state.totalPnl >= 0 ? 'text-profit' : 'text-loss'} />
                        <MiniStat label="Win Rate" value={`${winRate}%`} color="text-foreground" />
                        <MiniStat label="W/L" value={`${state.winCount}/${state.lossCount}`} color="text-foreground" />
                      </div>

                      {/* Current Position */}
                      {state.position && (
                        <div className={`p-2 rounded-lg border text-[10px] ${
                          state.position.side === 'long' ? 'bg-profit/5 border-profit/20' : 'bg-loss/5 border-loss/20'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className={`font-bold ${state.position.side === 'long' ? 'text-profit' : 'text-loss'}`}>
                              {state.position.side.toUpperCase()} {state.position.leverage}x — Entry: ${state.position.entryPrice.toFixed(2)}
                            </span>
                            <span className={`font-bold ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Auto Trade Section */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-foreground uppercase flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-primary" /> Auto Trade
                        </h4>
                        {autoConfig && (
                          <Switch
                            checked={autoConfig.enabled}
                            onCheckedChange={(checked) => toggleAutoStrategy(autoConfig.id, checked)}
                            className="scale-75"
                          />
                        )}
                      </div>
                      {autoConfig ? (
                        <div className="flex gap-2 text-[9px] text-muted-foreground">
                          <span>Balance: ${Number(autoConfig.balance).toFixed(0)}</span>
                          <span>P&L: ${Number(autoConfig.total_pnl).toFixed(2)}</span>
                          <span>W/L: {autoConfig.win_count}/{autoConfig.loss_count}</span>
                          <span className={autoConfig.enabled ? 'text-profit' : ''}>
                            {autoConfig.enabled ? '● Aktif' : '○ Nonaktif'}
                          </span>
                        </div>
                      ) : (
                        <p className="text-[9px] text-muted-foreground">Auto trade belum dikonfigurasi</p>
                      )}
                    </div>

                    {/* Trade History */}
                    {stratTrades.length > 0 && (
                      <div className="space-y-1 pt-2 border-t border-border">
                        <h4 className="text-[10px] font-bold text-foreground uppercase flex items-center gap-1.5">
                          <BarChart3 className="w-3.5 h-3.5 text-accent" /> Riwayat ({stratTrades.length})
                        </h4>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {stratTrades.slice(0, 10).map(trade => (
                            <div key={trade.id} className="flex items-center gap-2 text-[9px] px-2 py-1 bg-muted rounded">
                              <span className={`font-bold ${trade.side === 'long' ? 'text-profit' : 'text-loss'}`}>
                                {trade.side.toUpperCase()} {trade.leverage}x
                              </span>
                              <span className="text-muted-foreground">${Number(trade.entry_price).toFixed(0)}→${Number(trade.exit_price).toFixed(0)}</span>
                              <span className={`font-bold ${Number(trade.pnl) >= 0 ? 'text-profit' : 'text-loss'}`}>
                                {Number(trade.pnl) >= 0 ? '+' : ''}${Number(trade.pnl).toFixed(2)}
                              </span>
                              <span className="text-muted-foreground ml-auto">{trade.reason || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Warning */}
        <div className="p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <p className="text-[10px] text-yellow-500 font-semibold">
            ⚠️ Trading futures dengan leverage tinggi memiliki risiko kerugian besar.
            Simulasi berjalan di background via edge function. Masukkan API Key untuk auto trade real.
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-1.5 py-1 bg-muted rounded border border-border text-center">
      <div className="text-[8px] text-muted-foreground uppercase font-semibold">{label}</div>
      <div className={`text-[11px] font-bold ${color}`}>{value}</div>
    </div>
  );
}
