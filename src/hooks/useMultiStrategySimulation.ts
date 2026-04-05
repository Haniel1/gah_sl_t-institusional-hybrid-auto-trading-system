import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runStrategy, type OKXCandle, type StrategyId, OKX_STRATEGIES } from '@/lib/okx-strategies';
import { toast } from '@/hooks/use-toast';

export interface StrategySimState {
  id?: string;
  symbol: string;
  strategy: StrategyId;
  balance: number;
  initialBalance: number;
  position: {
    side: 'long' | 'short';
    entryPrice: number;
    amount: number;
    leverage: number;
    stopLoss: number;
    takeProfit: number;
    entryTime: string;
  } | null;
  isRunning: boolean;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  leverage: number;
}

export interface SimTrade {
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

const ALL_STRATEGIES: StrategyId[] = ['trend-scalping', 'smart-money', 'multi-indicator', 'gainz-algo-v3', 'luxalgo-iof'];

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

export function useMultiStrategySimulation(symbol: string) {
  const [simStates, setSimStates] = useState<Record<StrategyId, StrategySimState>>(() => {
    const initial: any = {};
    ALL_STRATEGIES.forEach(s => {
      initial[s] = {
        symbol, strategy: s, balance: 1000, initialBalance: 1000,
        position: null, isRunning: false, totalPnl: 0, winCount: 0, lossCount: 0, leverage: 20,
      };
    });
    return initial;
  });
  const [trades, setTrades] = useState<Record<StrategyId, SimTrade[]>>(() => {
    const t: any = {};
    ALL_STRATEGIES.forEach(s => { t[s] = []; });
    return t;
  });
  const [candles, setCandles] = useState<OKXCandle[]>(() => generateCandles(200));
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simStatesRef = useRef(simStates);
  simStatesRef.current = simStates;

  const currentPrice = candles[candles.length - 1]?.close || 0;

  // Load states from DB
  useEffect(() => {
    async function load() {
      const { data: states } = await supabase
        .from('okx_sim_state')
        .select('*')
        .eq('symbol', symbol);

      const loadedStates: any = { ...simStates };
      const existingStrategies = new Set<string>();

      if (states) {
        for (const state of states) {
          const sid = state.strategy as StrategyId;
          existingStrategies.add(sid);
          loadedStates[sid] = {
            id: state.id, symbol: state.symbol, strategy: sid,
            balance: Number(state.balance), initialBalance: Number(state.initial_balance),
            position: state.position_side ? {
              side: state.position_side as 'long' | 'short',
              entryPrice: Number(state.entry_price),
              amount: Number(state.position_amount),
              leverage: state.leverage,
              stopLoss: Number(state.stop_loss),
              takeProfit: Number(state.take_profit),
              entryTime: state.entry_time || new Date().toISOString(),
            } : null,
            isRunning: state.is_running, totalPnl: Number(state.total_pnl),
            winCount: state.win_count, lossCount: state.loss_count, leverage: state.leverage,
          };
        }
      }

      // Create missing strategy states in DB
      for (const sid of ALL_STRATEGIES) {
        if (!existingStrategies.has(sid)) {
          const { data: created } = await supabase
            .from('okx_sim_state')
            .insert({ symbol, strategy: sid })
            .select().single();
          if (created) loadedStates[sid] = { ...loadedStates[sid], id: created.id };
        }
      }

      setSimStates(loadedStates);

      // Load trades per strategy
      const { data: tradeData } = await supabase
        .from('okx_sim_trades')
        .select('*')
        .eq('symbol', symbol)
        .order('created_at', { ascending: false })
        .limit(500);

      if (tradeData) {
        const grouped: any = {};
        ALL_STRATEGIES.forEach(s => { grouped[s] = []; });
        (tradeData as SimTrade[]).forEach(t => {
          if (grouped[t.strategy]) grouped[t.strategy].push(t);
        });
        setTrades(grouped);
      }

      setLoading(false);
    }
    load();
  }, [symbol]);

  const saveState = useCallback(async (state: StrategySimState) => {
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

  const saveTrade = useCallback(async (trade: {
    symbol: string; side: string; entryPrice: number; exitPrice: number;
    amount: number; leverage: number; pnl: number; pnlPct: number;
    strategy: string; reason: string;
  }) => {
    const { data } = await supabase.from('okx_sim_trades').insert({
      symbol: trade.symbol, side: trade.side,
      entry_price: trade.entryPrice, exit_price: trade.exitPrice,
      amount: trade.amount, leverage: trade.leverage,
      pnl: trade.pnl, pnl_pct: trade.pnlPct,
      strategy: trade.strategy, reason: trade.reason,
      entry_time: new Date().toISOString(), exit_time: new Date().toISOString(),
    }).select().single();

    if (data) {
      setTrades(prev => {
        const sid = trade.strategy as StrategyId;
        return { ...prev, [sid]: [data as SimTrade, ...(prev[sid] || [])].slice(0, 50) };
      });
    }
  }, []);

  // Simulation tick - processes all running strategies
  const simTick = useCallback(() => {
    setCandles(prev => addNewCandle(prev));

    setSimStates(prev => {
      const next = { ...prev };
      let changed = false;

      for (const sid of ALL_STRATEGIES) {
        const state = next[sid];
        if (!state.isRunning) continue;

        const price = candles[candles.length - 1]?.close || 0;
        if (!price) continue;

        if (state.position) {
          const pos = state.position;
          const pnlPct = pos.side === 'long'
            ? ((price - pos.entryPrice) / pos.entryPrice) * 100 * pos.leverage
            : ((pos.entryPrice - price) / pos.entryPrice) * 100 * pos.leverage;
          const pnl = (pnlPct / 100) * pos.amount;

          const hitSL = pos.side === 'long' ? price <= pos.stopLoss : price >= pos.stopLoss;
          const hitTP = pos.side === 'long' ? price >= pos.takeProfit : price <= pos.takeProfit;

          const result = runStrategy(sid, candles);
          const signalClose = (pos.side === 'long' && result.signal === 'close_long') ||
                             (pos.side === 'short' && result.signal === 'close_short');

          if (hitSL || hitTP || signalClose) {
            const reason = hitSL ? 'Stop Loss' : hitTP ? 'Take Profit' : 'Signal Close';
            next[sid] = {
              ...state,
              balance: state.balance + pos.amount + pnl,
              position: null,
              totalPnl: state.totalPnl + pnl,
              winCount: state.winCount + (pnl > 0 ? 1 : 0),
              lossCount: state.lossCount + (pnl < 0 ? 1 : 0),
            };
            saveTrade({
              symbol: state.symbol, side: pos.side, entryPrice: pos.entryPrice,
              exitPrice: price, amount: pos.amount, leverage: pos.leverage,
              pnl, pnlPct, strategy: sid, reason,
            });
            saveState(next[sid]);
            changed = true;
            continue;
          }
        }

        // Look for entry
        if (!state.position) {
          const result = runStrategy(sid, candles);
          if ((result.signal === 'long' || result.signal === 'short') && result.confidence >= 60) {
            const positionSize = state.balance * 0.3;
            if (positionSize < 10) continue;

            next[sid] = {
              ...state,
              balance: state.balance - positionSize,
              position: {
                side: result.signal,
                entryPrice: price,
                amount: positionSize,
                leverage: state.leverage,
                stopLoss: result.stopLoss,
                takeProfit: result.takeProfit,
                entryTime: new Date().toISOString(),
              },
            };
            saveState(next[sid]);
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [candles, saveState, saveTrade]);

  // Auto tick - runs if any strategy is running
  useEffect(() => {
    const anyRunning = Object.values(simStates).some(s => s.isRunning);
    if (anyRunning) {
      intervalRef.current = setInterval(simTick, 2000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [Object.values(simStates).some(s => s.isRunning), simTick]);

  const toggleStrategy = useCallback((sid: StrategyId) => {
    setSimStates(prev => {
      const state = prev[sid];
      const newState = { ...state, isRunning: !state.isRunning };
      saveState(newState);
      toast({ title: state.isRunning ? `${OKX_STRATEGIES[sid].name} dihentikan` : `${OKX_STRATEGIES[sid].name} dimulai` });
      return { ...prev, [sid]: newState };
    });
  }, [saveState]);

  const resetStrategy = useCallback(async (sid: StrategyId) => {
    setSimStates(prev => {
      const state = prev[sid];
      const newState: StrategySimState = {
        ...state, balance: 1000, initialBalance: 1000, position: null,
        isRunning: false, totalPnl: 0, winCount: 0, lossCount: 0,
      };
      saveState(newState);
      return { ...prev, [sid]: newState };
    });
    await supabase.from('okx_sim_trades').delete().eq('symbol', symbol).eq('strategy', sid);
    setTrades(prev => ({ ...prev, [sid]: [] }));
    toast({ title: `${OKX_STRATEGIES[sid].name} direset` });
  }, [symbol, saveState]);

  const setLeverage = useCallback((sid: StrategyId, leverage: number) => {
    setSimStates(prev => {
      const newState = { ...prev[sid], leverage };
      saveState(newState);
      return { ...prev, [sid]: newState };
    });
  }, [saveState]);

  return {
    simStates, trades, candles, currentPrice, loading,
    toggleStrategy, resetStrategy, setLeverage,
  };
}
