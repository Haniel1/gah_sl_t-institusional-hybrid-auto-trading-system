import { useState, useEffect, useCallback, useMemo } from 'react';
import { CoinData, WATCHLIST } from '@/types/crypto';
import { formatRupiah } from '@/utils/format';
import { supabase } from '@/integrations/supabase/client';
import {
  FlaskConical, TrendingUp, TrendingDown, Play, Pause,
  RotateCcw, ChevronDown, ChevronUp, DollarSign, Activity, Clock,
  BarChart3, RefreshCw, Plus, X, Search,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Props {
  coins: CoinData[];
}

interface SimState {
  coin_symbol: string;
  capital: number;
  coin_balance: number;
  entry_price: number | null;
  entry_time: string | null;
  entry_reasons: string[] | null;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  is_running: boolean;
  last_tick_at: string | null;
  strategy: string;
}

interface SimTrade {
  id: string;
  coin_symbol: string;
  trade_type: 'buy' | 'sell';
  price: number;
  coin_amount: number;
  idr_value: number;
  pnl: number;
  pnl_pct: number;
  hold_duration_ms: number;
  signal_action: string;
  signal_reasons: string[] | null;
  created_at: string;
  strategy: string;
}

interface SimSnapshot {
  coin_symbol: string;
  total_value: number;
  coin_price: number;
  signal_action: string | null;
  created_at: string;
  strategy: string;
}

const INITIAL_CAPITAL = 1_000_000;

const STRATEGY_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  dual_signal: { label: 'Dual Signal', desc: 'GainzAlgo + Fabio Valentini', color: 'text-accent' },
  swing_trading: { label: 'Swing Trading', desc: 'CRT Overlay (Sweep Reversal)', color: 'text-primary' },
  time_prediction: { label: 'Time Prediction', desc: 'Prediksi Jam Naik/Turun (WIT)', color: 'text-terminal-yellow' },
  zero_lag_trend: { label: 'Zero Lag Trend', desc: 'AlgoAlpha ZLEMA + ATR Band', color: 'text-terminal-cyan' },
};

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}d`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}h ${hr % 24}j`;
}

export function SimulationTrading({ coins }: Props) {
  const [activeStrategy, setActiveStrategy] = useState<string>('dual_signal');
  const [allStatesRaw, setAllStatesRaw] = useState<SimState[]>([]);
  const [allTradesRaw, setAllTradesRaw] = useState<SimTrade[]>([]);
  const [allSnapsRaw, setAllSnapsRaw] = useState<SimSnapshot[]>([]);
  const [simCoins, setSimCoins] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['BTC']));
  const [showChart, setShowChart] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [coinSearch, setCoinSearch] = useState('');

  const fetchSimCoins = useCallback(async () => {
    const { data } = await supabase.from('simulation_coins').select('coin_symbol').order('added_at');
    if (data) setSimCoins(data.map((r: any) => r.coin_symbol));
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [statesRes, tradesRes, snapsRes] = await Promise.all([
        supabase.from('simulation_state').select('*'),
        supabase.from('simulation_trades').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('simulation_snapshots').select('*').order('created_at', { ascending: true }).limit(5000),
      ]);

      if (statesRes.data) {
        setAllStatesRaw(statesRes.data as any[]);
        const lt = statesRes.data.reduce((max: string | null, s: any) => {
          if (s.last_tick_at && (!max || s.last_tick_at > max)) return s.last_tick_at;
          return max;
        }, null);
        if (lt) setLastTick(lt);
      }
      if (tradesRes.data) setAllTradesRaw(tradesRes.data as any[]);
      if (snapsRes.data) setAllSnapsRaw(snapsRes.data as any[]);
    } catch (e) {
      console.error('Fetch simulation data error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSimCoins();
    fetchAll();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchSimCoins]);

  const handleAddCoin = async (symbol: string) => {
    await supabase.from('simulation_coins').insert({ coin_symbol: symbol });
    await fetchSimCoins();
  };

  const handleRemoveCoin = async (symbol: string) => {
    await supabase.from('simulation_coins').delete().eq('coin_symbol', symbol);
    await fetchSimCoins();
  };

  const availableCoinsToAdd = useMemo(() => {
    return coins
      .filter(c => !simCoins.includes(c.symbol))
      .filter(c => {
        if (!coinSearch.trim()) return true;
        const q = coinSearch.toLowerCase();
        return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
      })
      .sort((a, b) => b.volumeIdr - a.volumeIdr)
      .slice(0, 50);
  }, [coins, simCoins, coinSearch]);

  useEffect(() => {
    const channel = supabase
      .channel('sim-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'simulation_trades' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'simulation_snapshots' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // Filter data by active strategy
  const states: Record<string, SimState> = {};
  allStatesRaw.filter(s => s.strategy === activeStrategy).forEach(s => { states[s.coin_symbol] = s; });

  const trades: Record<string, SimTrade[]> = {};
  allTradesRaw.filter(t => t.strategy === activeStrategy).forEach(t => {
    if (!trades[t.coin_symbol]) trades[t.coin_symbol] = [];
    trades[t.coin_symbol].push(t);
  });

  const snapshots: Record<string, SimSnapshot[]> = {};
  allSnapsRaw.filter(s => s.strategy === activeStrategy).forEach(s => {
    if (!snapshots[s.coin_symbol]) snapshots[s.coin_symbol] = [];
    snapshots[s.coin_symbol].push(s);
  });

  const isRunning = Object.keys(states).length > 0
    ? Object.values(states).some(s => s.is_running)
    : false;

  const [optimisticRunning, setOptimisticRunning] = useState<boolean | null>(null);
  const displayRunning = optimisticRunning !== null ? optimisticRunning : isRunning;

  // Sync optimistic state when real data arrives
  useEffect(() => {
    if (Object.keys(states).length > 0) setOptimisticRunning(null);
  }, [allStatesRaw, activeStrategy]);

  const handleToggle = async () => {
    const newRunning = !displayRunning;
    setOptimisticRunning(newRunning);
    
    // If no states exist yet for this strategy, trigger a tick first to create them
    if (Object.keys(states).length === 0 && newRunning) {
      // Run a tick which will create states with is_running=true by default
      await supabase.functions.invoke('simulation-tick', { body: {} });
      setTimeout(fetchAll, 3000);
      return;
    }
    
    await supabase.functions.invoke('simulation-tick', {
      body: { action: 'toggle', is_running: newRunning, strategy: activeStrategy },
    });
    setTimeout(fetchAll, 2000);
  };

  const handleReset = async () => {
    setLoading(true);
    await supabase.functions.invoke('simulation-tick', {
      body: { action: 'reset', strategy: activeStrategy },
    });
    setTimeout(fetchAll, 1000);
  };

  const handleManualTick = async () => {
    await supabase.functions.invoke('simulation-tick', { body: {} });
    setTimeout(fetchAll, 2000);
  };

  const toggleExpand = (s: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  const toggleChart = (s: string) => setShowChart(prev => {
    const n = new Set(prev);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  const allStates = Object.values(states);
  const totalPnl = allStates.reduce((s, st) => s + Number(st.total_pnl || 0), 0);
  const totalWins = allStates.reduce((s, st) => s + (st.win_count || 0), 0);
  const totalLosses = allStates.reduce((s, st) => s + (st.loss_count || 0), 0);
  const totalTrades = totalWins + totalLosses;
  const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;

  const allSymbols = new Set([...simCoins, ...Object.keys(states)]);
  const sortedCoins = Array.from(allSymbols)
    .map(s => ({ symbol: s, state: states[s] }))
    .filter(({ symbol }) => simCoins.includes(symbol) || states[symbol])
    .sort((a, b) => {
      const aActive = a.state ? (Number(a.state.total_pnl) !== 0 || a.state.entry_price !== null ? 1 : 0) : 0;
      const bActive = b.state ? (Number(b.state.total_pnl) !== 0 || b.state.entry_price !== null ? 1 : 0) : 0;
      if (bActive !== aActive) return bActive - aActive;
      return (Number(b.state?.total_pnl) || 0) - (Number(a.state?.total_pnl) || 0);
    });

  const topPerformers = sortedCoins
    .filter(c => c.state && Number(c.state.total_pnl) !== 0)
    .sort((a, b) => Number(b.state!.total_pnl) - Number(a.state!.total_pnl));
  const holdingCount = sortedCoins.filter(c => c.state?.entry_price !== null && Number(c.state?.coin_balance || 0) > 0).length;

  const stratMeta = STRATEGY_LABELS[activeStrategy] || STRATEGY_LABELS.dual_signal;

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Trading Simulator
          </h3>
          {displayRunning && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-profit/10 text-profit font-semibold animate-pulse">
              ● AKTIF
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1.5 rounded bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold hover:bg-primary/20 transition-colors">
                <Plus className="h-3 w-3" /> Tambah Koin
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-sm text-foreground">Kelola Koin Simulasi ({simCoins.length} koin)</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={coinSearch} onChange={e => setCoinSearch(e.target.value)} placeholder="Cari koin..." className="w-full pl-7 pr-3 py-2 text-xs rounded border border-border bg-background text-foreground" />
              </div>
              {/* Current coins */}
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Koin Aktif ({simCoins.length})</p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {simCoins.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent/10 text-accent text-[10px] font-semibold">
                      {s}
                      <button onClick={() => handleRemoveCoin(s)} className="hover:text-loss transition-colors"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
              {/* Available coins */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Tambah Koin</p>
                {availableCoinsToAdd.map(coin => (
                  <button key={coin.id} onClick={() => { handleAddCoin(coin.symbol); setCoinSearch(''); }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-muted transition-colors text-left">
                    <div>
                      <span className="text-xs font-bold text-foreground">{coin.symbol}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{coin.name}</span>
                    </div>
                    <div className="text-[10px] text-foreground">{formatRupiah(coin.last)}</div>
                  </button>
                ))}
                {availableCoinsToAdd.length === 0 && <p className="text-center text-[10px] text-muted-foreground py-2">Tidak ada koin tersedia</p>}
              </div>
            </DialogContent>
          </Dialog>
          <button onClick={handleManualTick} className="flex items-center gap-1 px-2 py-1.5 rounded border border-border bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-border transition-colors">
            <RefreshCw className="h-3 w-3" />
          </button>
          <button onClick={handleReset} className="flex items-center gap-1 px-2 py-1.5 rounded border border-border bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-border transition-colors">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button onClick={handleToggle} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-semibold transition-all ${
            displayRunning ? 'bg-warning/10 border border-warning/30 text-warning' : 'bg-profit/10 border border-profit/30 text-profit'
          }`}>
            {displayRunning ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Mulai</>}
          </button>
        </div>
      </div>

      {/* Strategy Tabs */}
      <div className="flex gap-2">
        {Object.entries(STRATEGY_LABELS).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setActiveStrategy(key)}
            className={`flex-1 px-3 py-2 rounded-md border text-left transition-all ${
              activeStrategy === key
                ? 'border-accent bg-accent/10'
                : 'border-border bg-muted hover:border-muted-foreground/30'
            }`}
          >
            <div className={`text-[11px] font-bold ${activeStrategy === key ? meta.color : 'text-muted-foreground'}`}>
              {meta.label}
            </div>
            <div className="text-[9px] text-muted-foreground">{meta.desc}</div>
          </button>
        ))}
      </div>

      <div className="px-2.5 py-2 rounded-md bg-accent/5 border border-accent/20">
        <p className="text-[10px] text-accent/80">
          💡 <strong>{stratMeta.label}:</strong> {stratMeta.desc}
          {lastTick && <span className="ml-1">· Tick terakhir: {new Date(lastTick).toLocaleTimeString('id-ID')}</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: DollarSign, label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}${formatRupiah(totalPnl)}`, color: totalPnl >= 0 ? 'text-profit' : 'text-loss' },
          { icon: Activity, label: 'Win Rate', value: `${winRate}%`, color: winRate >= 50 ? 'text-profit' : 'text-loss' },
          { icon: TrendingUp, label: 'Total Trade', value: `${totalTrades}x`, color: 'text-foreground' },
          { icon: Clock, label: 'Menang / Kalah', value: `${totalWins} / ${totalLosses}`, color: 'text-foreground' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-2 px-2.5 py-2 bg-muted rounded-md border border-border">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div>
              <div className="text-[9px] text-muted-foreground">{label}</div>
              <div className={`text-[11px] font-bold ${color}`}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Summary */}
      {topPerformers.length > 0 && (
        <div className="border border-border rounded-lg p-2.5 space-y-2">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-accent" />
            Ringkasan · {sortedCoins.length} koin · {holdingCount} holding
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            {topPerformers.slice(0, 10).map(({ symbol, state }) => {
              const pnl = Number(state!.total_pnl);
              const wins = state!.win_count || 0;
              const losses = state!.loss_count || 0;
              const total = wins + losses;
              const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
              const isHolding = state!.entry_price !== null && Number(state!.coin_balance) > 0;
              return (
                <div key={symbol} className="bg-muted rounded-md px-2 py-1.5 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-foreground">{symbol}</span>
                    {isHolding && <span className="text-[8px] px-1 rounded bg-accent/10 text-accent">HOLD</span>}
                  </div>
                  <div className={`text-[11px] font-bold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {pnl >= 0 ? '+' : ''}{formatRupiah(pnl)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    WR: <span className={`font-semibold ${wr >= 50 ? 'text-profit' : 'text-loss'}`}>{wr}%</span> · {total}x
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Memuat data simulasi...</p>
      ) : sortedCoins.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Belum ada data. Tekan <RefreshCw className="inline h-3 w-3" /> untuk memulai tick pertama.
        </p>
      ) : (
        <div className="space-y-1.5">
          {sortedCoins.map(({ symbol, state }) => {
            const coin = coins.find(c => c.symbol === symbol);
            const coinTrades = trades[symbol] || [];
            const coinSnaps = snapshots[symbol] || [];
            const isExpanded = expanded.has(symbol);
            const chartVisible = showChart.has(symbol);
            const sellTrades = coinTrades.filter(t => t.trade_type === 'sell');

            const capital = Number(state?.capital || INITIAL_CAPITAL);
            const coinBalance = Number(state?.coin_balance || 0);
            const currentPrice = coin?.last || 0;
            const totalValue = capital + coinBalance * currentPrice;
            const netPnl = totalValue - INITIAL_CAPITAL;
            const isHolding = state?.entry_price !== null && state?.entry_price !== undefined && coinBalance > 0;
            const unrealizedPnl = isHolding && state?.entry_price
              ? (coinBalance * currentPrice) - (coinBalance * Number(state.entry_price))
              : 0;

            return (
              <div key={symbol} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => toggleExpand(symbol)}>
                  <span className="text-xs font-bold text-foreground w-16 shrink-0">{symbol}</span>
                  {isHolding ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold shrink-0">HOLDING</span>
                  ) : state ? (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-muted border border-border text-muted-foreground shrink-0">TUNAI</span>
                  ) : null}
                  {isHolding && (
                    <span className={`text-[10px] font-semibold shrink-0 ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {unrealizedPnl >= 0 ? '+' : ''}{formatRupiah(unrealizedPnl)}
                    </span>
                  )}
                  <span className={`ml-auto text-[10px] font-bold shrink-0 ${netPnl > 0 ? 'text-profit' : netPnl < 0 ? 'text-loss' : 'text-muted-foreground'}`}>
                    {netPnl > 0 ? '+' : ''}{formatRupiah(netPnl)}
                  </span>
                  {sellTrades.length > 0 && <span className="text-[9px] text-muted-foreground shrink-0 ml-1">{sellTrades.length}x</span>}
                  {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-muted px-3 py-2 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10px]">
                      <div><span className="text-muted-foreground">Modal:</span> <span className="font-semibold text-foreground">{formatRupiah(INITIAL_CAPITAL)}</span></div>
                      <div><span className="text-muted-foreground">Tunai:</span> <span className="font-semibold text-foreground">{formatRupiah(capital)}</span></div>
                      <div><span className="text-muted-foreground">Koin:</span> <span className="font-semibold text-foreground">{coinBalance > 0 ? `${coinBalance.toFixed(6)} ${symbol}` : '–'}</span></div>
                      <div><span className="text-muted-foreground">Total:</span> <span className={`font-bold ${netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatRupiah(totalValue)}</span></div>
                    </div>

                    {isHolding && state?.entry_price && (
                      <div className="p-2 rounded-md bg-accent/5 border border-accent/20 text-[10px] space-y-0.5">
                        <p className="font-semibold text-accent">📍 Posisi Terbuka</p>
                        <p className="text-foreground">Beli {coinBalance.toFixed(6)} {symbol} @ {formatRupiah(Number(state.entry_price))}</p>
                        {state.entry_time && (
                          <p className="text-muted-foreground">Masuk: {new Date(state.entry_time).toLocaleString('id-ID')} · Sudah: {formatDuration(Date.now() - new Date(state.entry_time).getTime())}</p>
                        )}
                        <p className={`font-semibold ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                          P&L: {unrealizedPnl >= 0 ? '+' : ''}{formatRupiah(unrealizedPnl)}
                        </p>
                      </div>
                    )}

                    <button onClick={() => toggleChart(symbol)} className="flex items-center gap-1 text-[10px] text-accent font-semibold hover:underline">
                      <BarChart3 className="h-3 w-3" />
                      {chartVisible ? 'Sembunyikan Chart' : 'Lihat Chart P&L'}
                    </button>

                    {chartVisible && coinSnaps.length > 1 && (
                      <div className="bg-card border border-border rounded-md p-2">
                        <p className="text-[9px] text-muted-foreground font-semibold mb-1">Nilai Portfolio ({symbol})</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={coinSnaps.map(s => ({
                            time: new Date(s.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                            value: Number(s.total_value),
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} domain={['auto', 'auto']} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10 }} formatter={(value: number) => [formatRupiah(value), 'Nilai']} />
                            <ReferenceLine y={INITIAL_CAPITAL} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                            <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {coinTrades.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[9px] text-muted-foreground font-semibold uppercase">Riwayat Trade</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {coinTrades.map(trade => (
                            <div key={trade.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[10px] ${
                              trade.trade_type === 'buy' ? 'bg-profit/5 border border-profit/10' : 'bg-loss/5 border border-loss/10'
                            }`}>
                              {trade.trade_type === 'buy' ? <TrendingUp className="h-3 w-3 text-profit shrink-0" /> : <TrendingDown className="h-3 w-3 text-loss shrink-0" />}
                              <span className={`font-semibold w-8 shrink-0 ${trade.trade_type === 'buy' ? 'text-profit' : 'text-loss'}`}>{trade.trade_type.toUpperCase()}</span>
                              <span className="text-foreground">{formatRupiah(trade.price)}</span>
                              {trade.trade_type === 'sell' && (
                                <span className={`font-semibold ml-auto shrink-0 ${trade.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                                  {trade.pnl >= 0 ? '+' : ''}{formatRupiah(trade.pnl)} ({Number(trade.pnl_pct).toFixed(2)}%)
                                </span>
                              )}
                              <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                                {new Date(trade.created_at).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Belum ada trade. Menunggu sinyal...</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
