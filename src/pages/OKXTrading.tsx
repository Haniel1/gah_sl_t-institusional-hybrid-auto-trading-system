import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Settings, TrendingUp, TrendingDown, Minus, Play, Square, RotateCcw, Zap, Activity, BarChart3, Bot, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import { OKX_STRATEGIES, runStrategy, runAllStrategies, type OKXCandle, type OKXStrategyResult, type OKXSignal, type StrategyId } from '@/lib/okx-strategies';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

// ─── Simulation Engine ──────────────────────────────────────
interface SimPosition {
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  strategy: StrategyId;
}

interface SimTrade {
  id: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  amount: number;
  leverage: number;
  pnl: number;
  pnlPct: number;
  strategy: StrategyId;
  entryTime: number;
  exitTime: number;
  reason: string;
}

interface SimState {
  balance: number;
  initialBalance: number;
  position: SimPosition | null;
  trades: SimTrade[];
  isRunning: boolean;
}

const INITIAL_BALANCE = 1000; // USDT

// Generate fake candle data for simulation
function generateCandles(count: number, basePrice = 65000): OKXCandle[] {
  const candles: OKXCandle[] = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.498) * price * 0.005;
    const open = price;
    price += change;
    const high = Math.max(open, price) + Math.random() * price * 0.002;
    const low = Math.min(open, price) - Math.random() * price * 0.002;
    const volume = 50 + Math.random() * 200;
    candles.push({ time: now - (count - i) * 60000, open, high, low, close: price, volume });
  }
  return candles;
}

function addNewCandle(candles: OKXCandle[]): OKXCandle[] {
  const last = candles[candles.length - 1];
  const change = (Math.random() - 0.498) * last.close * 0.004;
  const open = last.close;
  const close = open + change;
  const high = Math.max(open, close) + Math.random() * last.close * 0.0015;
  const low = Math.min(open, close) - Math.random() * last.close * 0.0015;
  const volume = 50 + Math.random() * 200;
  return [...candles.slice(-199), { time: Date.now(), open, high, low, close, volume }];
}

export default function OKXTrading() {
  const { } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'simulation' | 'auto'>('simulation');
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId>('trend-scalping');
  const [leverage, setLeverage] = useState(20);
  const [candles, setCandles] = useState<OKXCandle[]>(() => generateCandles(200));
  const [simState, setSimState] = useState<SimState>({ balance: INITIAL_BALANCE, initialBalance: INITIAL_BALANCE, position: null, trades: [], isRunning: false });
  const [lastSignal, setLastSignal] = useState<OKXStrategyResult | null>(null);
  const [allSignals, setAllSignals] = useState<Record<StrategyId, OKXStrategyResult> | null>(null);
  const [autoStrategies, setAutoStrategies] = useState<Record<StrategyId, boolean>>({ 'trend-scalping': true, 'smart-money': false, 'multi-indicator': false });
  const [showStrategyDetails, setShowStrategyDetails] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPrice = candles[candles.length - 1]?.close || 0;

  // Run strategies on candle update
  useEffect(() => {
    if (candles.length > 50) {
      setLastSignal(runStrategy(selectedStrategy, candles));
      setAllSignals(runAllStrategies(candles));
    }
  }, [candles, selectedStrategy]);

  // Simulation tick
  const simTick = useCallback(() => {
    setCandles(prev => addNewCandle(prev));

    setSimState(prev => {
      if (!prev.isRunning) return prev;

      const newCandles = candles;
      const price = newCandles[newCandles.length - 1]?.close || 0;
      if (!price) return prev;

      // Check position SL/TP
      if (prev.position) {
        const pos = prev.position;
        const pnlPct = pos.side === 'long'
          ? ((price - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage
          : ((pos.entryPrice - price) / pos.entryPrice) * 100 * pos.leverage;
        const pnl = (pnlPct / 100) * pos.amount;

        const hitSL = pos.side === 'long' ? price <= pos.stopLoss : price >= pos.stopLoss;
        const hitTP = pos.side === 'long' ? price >= pos.takeProfit : price <= pos.takeProfit;

        if (hitSL || hitTP) {
          const trade: SimTrade = {
            id: crypto.randomUUID(),
            side: pos.side,
            entryPrice: pos.entryPrice,
            exitPrice: price,
            amount: pos.amount,
            leverage: pos.leverage,
            pnl,
            pnlPct,
            strategy: pos.strategy,
            entryTime: pos.entryTime,
            exitTime: Date.now(),
            reason: hitSL ? 'Stop Loss' : 'Take Profit',
          };
          return {
            ...prev,
            balance: prev.balance + pos.amount + pnl,
            position: null,
            trades: [trade, ...prev.trades].slice(0, 100),
          };
        }

        // Check for close signals
        const result = runStrategy(pos.strategy, newCandles);
        if ((pos.side === 'long' && result.signal === 'close_long') ||
            (pos.side === 'short' && result.signal === 'close_short')) {
          const trade: SimTrade = {
            id: crypto.randomUUID(),
            side: pos.side,
            entryPrice: pos.entryPrice,
            exitPrice: price,
            amount: pos.amount,
            leverage: pos.leverage,
            pnl,
            pnlPct,
            strategy: pos.strategy,
            entryTime: pos.entryTime,
            exitTime: Date.now(),
            reason: 'Signal Close',
          };
          return {
            ...prev,
            balance: prev.balance + pos.amount + pnl,
            position: null,
            trades: [trade, ...prev.trades].slice(0, 100),
          };
        }

        return prev;
      }

      // Look for entry signals
      const result = runStrategy(selectedStrategy, newCandles);
      if ((result.signal === 'long' || result.signal === 'short') && result.confidence >= 60) {
        const positionSize = prev.balance * 0.3; // Use 30% of balance
        if (positionSize < 10) return prev;

        return {
          ...prev,
          balance: prev.balance - positionSize,
          position: {
            side: result.signal,
            entryPrice: price,
            amount: positionSize,
            leverage,
            stopLoss: result.stopLoss,
            takeProfit: result.takeProfit,
            entryTime: Date.now(),
            strategy: selectedStrategy,
          },
        };
      }

      return prev;
    });
  }, [candles, selectedStrategy, leverage]);

  // Auto tick when simulation is running
  useEffect(() => {
    if (simState.isRunning) {
      intervalRef.current = setInterval(simTick, 2000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [simState.isRunning, simTick]);

  const toggleSimulation = () => {
    setSimState(prev => ({ ...prev, isRunning: !prev.isRunning }));
    toast({ title: simState.isRunning ? 'Simulasi dihentikan' : 'Simulasi dimulai' });
  };

  const resetSimulation = () => {
    setSimState({ balance: INITIAL_BALANCE, initialBalance: INITIAL_BALANCE, position: null, trades: [], isRunning: false });
    setCandles(generateCandles(200));
    toast({ title: 'Simulasi direset' });
  };

  const totalPnl = simState.trades.reduce((s, t) => s + t.pnl, 0);
  const winCount = simState.trades.filter(t => t.pnl > 0).length;
  const lossCount = simState.trades.filter(t => t.pnl < 0).length;
  const winRate = simState.trades.length > 0 ? (winCount / simState.trades.length * 100).toFixed(1) : '0';
  const unrealizedPnl = simState.position
    ? simState.position.side === 'long'
      ? ((currentPrice - simState.position.entryPrice) / simState.position.entryPrice) * 100 * simState.position.leverage
      : ((simState.position.entryPrice - currentPrice) / simState.position.entryPrice) * 100 * simState.position.leverage
    : 0;

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-11 border-b border-border flex items-center px-3 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all mr-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span className="font-mono font-bold text-xs text-primary">OKX Futures</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-semibold">BTCUSDT.P</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">${currentPrice.toFixed(2)}</span>
          <button onClick={() => navigate('/settings')} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

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
              <button key={id} onClick={() => setSelectedStrategy(id)}
                className={`text-left p-2 rounded-lg border transition-all ${
                  selectedStrategy === id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30'
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
                    leverage === lev ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-muted text-muted-foreground border border-border hover:border-yellow-500/20'
                  }`}>
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Strategy details */}
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
                <div className={signalColor(lastSignal.signal)}>
                  {signalIcon(lastSignal.signal)}
                </div>
                <div>
                  <div className={`text-sm font-bold ${signalColor(lastSignal.signal)}`}>
                    {lastSignal.signal.toUpperCase()}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Confidence: {lastSignal.confidence}%
                  </div>
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
                  Simulasi Trading
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
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label="Balance" value={`$${simState.balance.toFixed(2)}`} color="text-foreground" />
                <StatCard label="Total P&L" value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? 'text-profit' : 'text-loss'} />
                <StatCard label="Win Rate" value={`${winRate}%`} color="text-foreground" />
                <StatCard label="Trades" value={`${winCount}W / ${lossCount}L`} color="text-foreground" />
              </div>

              {/* Current Position */}
              {simState.position && (
                <div className={`p-2.5 rounded-lg border ${
                  simState.position.side === 'long' ? 'bg-profit/5 border-profit/30' : 'bg-loss/5 border-loss/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${simState.position.side === 'long' ? 'text-profit' : 'text-loss'}`}>
                        {simState.position.side.toUpperCase()} {simState.position.leverage}x
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Entry: ${simState.position.entryPrice.toFixed(2)}
                      </span>
                    </div>
                    <span className={`text-xs font-bold ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground">
                    <span>Size: ${simState.position.amount.toFixed(2)}</span>
                    <span className="text-loss">SL: ${simState.position.stopLoss.toFixed(2)}</span>
                    <span className="text-profit">TP: ${simState.position.takeProfit.toFixed(2)}</span>
                    <span>Strategi: {OKX_STRATEGIES[simState.position.strategy].name}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Trade History */}
            {simState.trades.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  Riwayat Simulasi ({simState.trades.length})
                </h3>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {simState.trades.map(trade => (
                    <div key={trade.id} className="flex items-center gap-2 text-[10px] px-2 py-1.5 bg-muted rounded">
                      <span className={`font-bold ${trade.side === 'long' ? 'text-profit' : 'text-loss'}`}>
                        {trade.side.toUpperCase()} {trade.leverage}x
                      </span>
                      <span className="text-muted-foreground">${trade.entryPrice.toFixed(0)} → ${trade.exitPrice.toFixed(0)}</span>
                      <span className={`font-bold ${trade.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(1)}%)
                      </span>
                      <span className="text-muted-foreground ml-auto">{trade.reason}</span>
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
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Auto Trading OKX</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-semibold">Segera Hadir</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Auto trading dengan koneksi real ke OKX API akan tersedia setelah simulasi diverifikasi.
              Pastikan strategi yang dipilih sudah menghasilkan profit konsisten di simulasi sebelum mengaktifkan auto trade.
            </p>

            <div className="space-y-2">
              {(Object.entries(OKX_STRATEGIES) as [StrategyId, typeof OKX_STRATEGIES[StrategyId]][]).map(([id, strat]) => (
                <div key={id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg border border-border">
                  <div>
                    <div className="text-[11px] font-bold text-foreground">{strat.name}</div>
                    <div className="text-[9px] text-muted-foreground">{strat.description}</div>
                  </div>
                  <Switch
                    checked={autoStrategies[id]}
                    onCheckedChange={() => {
                      setAutoStrategies(prev => ({ ...prev, [id]: !prev[id] }));
                      toast({ title: `${strat.name} ${autoStrategies[id] ? 'dinonaktifkan' : 'diaktifkan'} (simulasi)` });
                    }}
                    className="scale-75"
                  />
                </div>
              ))}
            </div>

            <div className="p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
              <p className="text-[10px] text-yellow-500 font-semibold">
                ⚠️ Untuk mengaktifkan auto trade real, masukkan API Key OKX di halaman Settings terlebih dahulu.
                Trading futures dengan leverage tinggi memiliki risiko kerugian besar.
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
