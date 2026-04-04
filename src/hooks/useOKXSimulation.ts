import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runStrategy, type OKXCandle, type StrategyId } from '@/lib/okx-strategies';
import { toast } from '@/hooks/use-toast';

interface SimPosition {
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: string;
  strategy: StrategyId;
}

interface SimState {
  id?: string;
  symbol: string;
  balance: number;
  initialBalance: number;
  position: SimPosition | null;
  isRunning: boolean;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  strategy: StrategyId;
  leverage: number;
}

interface SimTrade {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number;
  amount: number;
  leverage: number;
  pnl: number;
  pnl_pct: number;
  strategy: string;
  reason: string | null;
  created_at: string;
}

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

export function useOKXSimulation(symbol: string) {
  const [simState, setSimState] = useState<SimState>({
    symbol, balance: 1000, initialBalance: 1000, position: null,
    isRunning: false, totalPnl: 0, winCount: 0, lossCount: 0,
    strategy: 'trend-scalping', leverage: 20,
  });
  const [trades, setTrades] = useState<SimTrade[]>([]);
  const [candles, setCandles] = useState<OKXCandle[]>(() => generateCandles(200));
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPrice = candles[candles.length - 1]?.close || 0;

  // Load state from DB
  useEffect(() => {
    async function load() {
      const { data: state } = await supabase
        .from('okx_sim_state')
        .select('*')
        .eq('symbol', symbol)
        .maybeSingle();

      if (state) {
        setSimState({
          id: state.id,
          symbol: state.symbol,
          balance: Number(state.balance),
          initialBalance: Number(state.initial_balance),
          position: state.position_side ? {
            side: state.position_side as 'long' | 'short',
            entryPrice: Number(state.entry_price),
            amount: Number(state.position_amount),
            leverage: state.leverage,
            stopLoss: Number(state.stop_loss),
            takeProfit: Number(state.take_profit),
            entryTime: state.entry_time || new Date().toISOString(),
            strategy: state.strategy as StrategyId,
          } : null,
          isRunning: state.is_running,
          totalPnl: Number(state.total_pnl),
          winCount: state.win_count,
          lossCount: state.loss_count,
          strategy: state.strategy as StrategyId,
          leverage: state.leverage,
        });
      } else {
        // Create initial state
        const { data: created } = await supabase
          .from('okx_sim_state')
          .insert({ symbol })
          .select()
          .single();
        if (created) setSimState(prev => ({ ...prev, id: created.id }));
      }

      const { data: tradeData } = await supabase
        .from('okx_sim_trades')
        .select('*')
        .eq('symbol', symbol)
        .order('created_at', { ascending: false })
        .limit(100);

      if (tradeData) setTrades(tradeData as SimTrade[]);
      setLoading(false);
    }
    load();
  }, [symbol]);

  // Save state to DB
  const saveState = useCallback(async (state: SimState) => {
    if (!state.id) return;
    await supabase.from('okx_sim_state').update({
      balance: state.balance,
      position_side: state.position?.side || null,
      entry_price: state.position?.entryPrice || null,
      position_amount: state.position?.amount || 0,
      leverage: state.leverage,
      stop_loss: state.position?.stopLoss || null,
      take_profit: state.position?.takeProfit || null,
      entry_time: state.position?.entryTime || null,
      strategy: state.strategy,
      is_running: state.isRunning,
      total_pnl: state.totalPnl,
      win_count: state.winCount,
      loss_count: state.lossCount,
      last_tick_at: new Date().toISOString(),
    }).eq('id', state.id);
  }, []);

  // Save trade to DB
  const saveTrade = useCallback(async (trade: {
    symbol: string; side: string; entryPrice: number; exitPrice: number;
    amount: number; leverage: number; pnl: number; pnlPct: number;
    strategy: string; reason: string;
  }) => {
    const { data } = await supabase.from('okx_sim_trades').insert({
      symbol: trade.symbol,
      side: trade.side,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      amount: trade.amount,
      leverage: trade.leverage,
      pnl: trade.pnl,
      pnl_pct: trade.pnlPct,
      strategy: trade.strategy,
      reason: trade.reason,
      entry_time: new Date().toISOString(),
      exit_time: new Date().toISOString(),
    }).select().single();

    if (data) setTrades(prev => [data as SimTrade, ...prev].slice(0, 100));
  }, []);

  // Simulation tick
  const simTick = useCallback(() => {
    setCandles(prev => addNewCandle(prev));

    setSimState(prev => {
      if (!prev.isRunning) return prev;

      const price = candles[candles.length - 1]?.close || 0;
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

        const result = runStrategy(pos.strategy, candles);
        const signalClose = (pos.side === 'long' && result.signal === 'close_long') ||
                           (pos.side === 'short' && result.signal === 'close_short');

        if (hitSL || hitTP || signalClose) {
          const reason = hitSL ? 'Stop Loss' : hitTP ? 'Take Profit' : 'Signal Close';
          const newState = {
            ...prev,
            balance: prev.balance + pos.amount + pnl,
            position: null,
            totalPnl: prev.totalPnl + pnl,
            winCount: prev.winCount + (pnl > 0 ? 1 : 0),
            lossCount: prev.lossCount + (pnl < 0 ? 1 : 0),
          };

          saveTrade({
            symbol: prev.symbol, side: pos.side, entryPrice: pos.entryPrice,
            exitPrice: price, amount: pos.amount, leverage: pos.leverage,
            pnl, pnlPct, strategy: pos.strategy, reason,
          });

          saveState(newState);
          return newState;
        }

        return prev;
      }

      // Look for entry signals
      const result = runStrategy(prev.strategy, candles);
      if ((result.signal === 'long' || result.signal === 'short') && result.confidence >= 60) {
        const positionSize = prev.balance * 0.3;
        if (positionSize < 10) return prev;

        const newState: SimState = {
          ...prev,
          balance: prev.balance - positionSize,
          position: {
            side: result.signal,
            entryPrice: price,
            amount: positionSize,
            leverage: prev.leverage,
            stopLoss: result.stopLoss,
            takeProfit: result.takeProfit,
            entryTime: new Date().toISOString(),
            strategy: prev.strategy,
          },
        };

        saveState(newState);
        return newState;
      }

      return prev;
    });
  }, [candles, saveState, saveTrade]);

  // Auto tick
  useEffect(() => {
    if (simState.isRunning) {
      intervalRef.current = setInterval(simTick, 2000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [simState.isRunning, simTick]);

  const toggleSimulation = useCallback(() => {
    setSimState(prev => {
      const newState = { ...prev, isRunning: !prev.isRunning };
      saveState(newState);
      toast({ title: prev.isRunning ? 'Simulasi dihentikan' : 'Simulasi dimulai' });
      return newState;
    });
  }, [saveState]);

  const resetSimulation = useCallback(async () => {
    const newState: SimState = {
      ...simState,
      balance: 1000, initialBalance: 1000, position: null,
      isRunning: false, totalPnl: 0, winCount: 0, lossCount: 0,
    };
    setSimState(newState);
    setCandles(generateCandles(200));
    await saveState(newState);
    // Delete old trades
    await supabase.from('okx_sim_trades').delete().eq('symbol', symbol);
    setTrades([]);
    toast({ title: 'Simulasi direset' });
  }, [simState, saveState, symbol]);

  const setStrategy = useCallback((strategy: StrategyId) => {
    setSimState(prev => {
      const newState = { ...prev, strategy };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  const setLeverage = useCallback((leverage: number) => {
    setSimState(prev => {
      const newState = { ...prev, leverage };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  return {
    simState, trades, candles, currentPrice, loading,
    toggleSimulation, resetSimulation, setStrategy, setLeverage,
  };
}
