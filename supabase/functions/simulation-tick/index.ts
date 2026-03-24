import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FALLBACK_WATCHLIST = ['BTC', 'ETH', 'BNB', 'XRP', 'BCH', 'SOL', 'LINK', 'ICP', 'DOT', 'ADA', 'NEAR'];

const INITIAL_CAPITAL = 1_000_000;
const STRATEGIES = ['alpha_simons', 'institutional_smc'] as const;

// ═══════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

function sma(data: number[], period: number): number[] {
  const result = new Array(data.length).fill(0);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

function ema(data: number[], period: number): number[] {
  const result = new Array(data.length).fill(0);
  if (data.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function rsi(closes: number[], period = 14): number[] {
  const result = new Array(closes.length).fill(50);
  if (closes.length <= period) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function atr(candles: Candle[], period = 14): number[] {
  const result = new Array(candles.length).fill(0);
  if (candles.length < 2) return result;
  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) sum += trs[i];
  result[period - 1] = sum / Math.min(period, trs.length);
  for (let i = period; i < trs.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + trs[i]) / period;
  }
  return result;
}

async function fetchCandles(symbol: string, tf = '60', count = 300): Promise<Candle[]> {
  const to = Math.floor(Date.now() / 1000);
  const tfSeconds = parseInt(tf) * 60;
  const from = to - count * tfSeconds;
  const url = `https://indodax.com/tradingview/history_v2?symbol=${symbol.toUpperCase()}IDR&tf=${tf}&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => ({
      time: Number(d.Time), open: Number(d.Open), high: Number(d.High),
      low: Number(d.Low), close: Number(d.Close), volume: Number(d.Volume),
    })).sort((a: Candle, b: Candle) => a.time - b.time);
  } catch { return []; }
}

async function fetchSummaries(): Promise<any> {
  try {
    const res = await fetch('https://indodax.com/api/summaries');
    return await res.json();
  } catch { return null; }
}

// ═══════════════════════════════════════════════════
// STRATEGY 1: ALPHA SIMONS (Momentum & Scalping)
// ═══════════════════════════════════════════════════

const AS_TRADING_FEE = 0.0021;        // 0.21% per side
const AS_HARD_STOP_LOSS = 0.02;       // 2%
const AS_MAX_SPREAD = 0.008;          // 0.8%
const AS_MIN_PROFIT_TARGET = 0.008;   // 0.8% gross min for SELL
const AS_TS_ACTIVATION = 0.02;        // Trailing stop activates at 2%
const AS_TS_CALLBACK = 0.015;         // Trailing stop callback 1.5%

function alphaSimonsSignal(
  last: number, high: number, low: number, change24h: number,
  buyPrice: number, sellPrice: number
): { action: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasons: string[]; spreadPct: number } {
  const range = high - low;
  const position = range > 0 ? (last - low) / range : 0.5;
  const zScore = (position - 0.5) * 4;
  const spreadPct = (sellPrice - buyPrice) / last;

  let score = 50;
  const reasons: string[] = [];

  // zScore anomaly
  if (zScore < -0.8 && position < 0.25) { score += 18; reasons.push('Oversold Anomaly'); }
  if (zScore > 0.8 && position > 0.75) { score -= 18; reasons.push('Overbought Anomaly'); }

  // Momentum
  if (change24h > 3) { score += 12; reasons.push('Strong Momentum'); }
  if (change24h < -5) { score -= 10; reasons.push('High Selling Pressure'); }

  const confidence = Math.min(100, Math.max(0, score));
  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (confidence >= 62) action = 'BUY';
  else if (confidence <= 38) action = 'SELL';

  return { action, confidence, reasons, spreadPct };
}

function processAlphaSimons(
  state: any, ticker: any, change24h: number
): { updates: any; trade: any | null } {
  const last = parseFloat(ticker.last);
  const buyPrice = parseFloat(ticker.buy);   // Bid
  const sellPrice = parseFloat(ticker.sell);  // Ask
  const high = parseFloat(ticker.high);
  const low = parseFloat(ticker.low);

  const signal = alphaSimonsSignal(last, high, low, change24h, buyPrice, sellPrice);

  const capital = Number(state.capital);
  const coinBalance = Number(state.coin_balance);
  const entryPrice = Number(state.entry_price);
  let highestPrice = Number(state.highest_price_seen) || entryPrice;
  const hasPosition = entryPrice > 0 && coinBalance > 0;
  const now = new Date().toISOString();

  let updates: any = { last_tick_at: now, updated_at: now };
  let trade: any = null;

  if (hasPosition) {
    // Track highest price
    if (buyPrice > highestPrice) {
      highestPrice = buyPrice;
      updates.highest_price_seen = highestPrice;
    }

    const currentPnL = (buyPrice - entryPrice) / entryPrice;
    const dropFromPeak = highestPrice > 0 ? (highestPrice - buyPrice) / highestPrice : 0;

    const isHardSL = currentPnL <= -AS_HARD_STOP_LOSS;
    const isTrailingStop = (currentPnL >= AS_TS_ACTIVATION) && (dropFromPeak >= AS_TS_CALLBACK);
    const isSignalSell = (signal.action === 'SELL' && currentPnL >= (AS_TRADING_FEE * 2 + AS_MIN_PROFIT_TARGET));

    if (isHardSL || isTrailingStop || isSignalSell) {
      const netIDR = (coinBalance * buyPrice) * (1 - AS_TRADING_FEE);
      const pnl = netIDR - (coinBalance * entryPrice / (1 - AS_TRADING_FEE));
      const holdDuration = state.entry_time ? Date.now() - new Date(state.entry_time).getTime() : 0;

      updates = {
        ...updates,
        capital: netIDR,
        coin_balance: 0,
        entry_price: null,
        entry_time: null,
        entry_reasons: null,
        highest_price_seen: null,
        total_pnl: (state.total_pnl || 0) + pnl,
        win_count: pnl > 0 ? (state.win_count || 0) + 1 : state.win_count,
        loss_count: pnl <= 0 ? (state.loss_count || 0) + 1 : state.loss_count,
      };

      const sellReason = isHardSL ? 'STOP_LOSS' : (isTrailingStop ? 'TRAILING_STOP' : 'SIGNAL_SELL');
      trade = {
        coin_symbol: state.coin_symbol, trade_type: 'sell', price: buyPrice,
        coin_amount: coinBalance, idr_value: netIDR,
        pnl, pnl_pct: currentPnL * 100, hold_duration_ms: holdDuration,
        signal_action: sellReason, signal_reasons: [sellReason, ...signal.reasons],
        strategy: 'alpha_simons',
      };
    }
  } else if (!hasPosition && signal.action === 'BUY' && capital > 10000) {
    // Check spread
    if (signal.spreadPct <= AS_MAX_SPREAD) {
      const netCapital = capital * (1 - AS_TRADING_FEE);
      const amount = netCapital / sellPrice;

      updates = {
        ...updates,
        capital: 0,
        coin_balance: amount,
        entry_price: sellPrice,
        entry_time: now,
        entry_reasons: signal.reasons,
        highest_price_seen: sellPrice,
      };

      trade = {
        coin_symbol: state.coin_symbol, trade_type: 'buy', price: sellPrice,
        coin_amount: amount, idr_value: capital,
        pnl: 0, pnl_pct: 0, hold_duration_ms: 0,
        signal_action: 'BUY', signal_reasons: signal.reasons,
        strategy: 'alpha_simons',
      };
    }
  }

  return { updates, trade };
}

// ═══════════════════════════════════════════════════
// STRATEGY 2: INSTITUTIONAL 3.0 (Smart Money Concepts)
// ═══════════════════════════════════════════════════

function detectFVGs(candles: Candle[], lookback = 20): { type: 'bullish' | 'bearish'; top: number; bottom: number }[] {
  const zones: { type: 'bullish' | 'bearish'; top: number; bottom: number }[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i++) {
    const c1 = candles[i - 2], c3 = candles[i];
    if (c3.low > c1.high) zones.push({ type: 'bullish', top: c3.low, bottom: c1.high });
    else if (c3.high < c1.low) zones.push({ type: 'bearish', top: c1.low, bottom: c3.high });
  }
  return zones;
}

function detectLiquiditySweep(candles: Candle[], support: number): boolean {
  if (candles.length < 5) return false;
  for (let i = candles.length - 4; i < candles.length; i++) {
    const c = candles[i];
    if (c.low < support * 0.999 && candles[candles.length - 1].close > support) return true;
  }
  return false;
}

function getSwingLow(candles: Candle[], period = 20): number {
  return Math.min(...candles.slice(-period).map(c => c.low));
}
function getSwingHigh(candles: Candle[], period = 20): number {
  return Math.max(...candles.slice(-period).map(c => c.high));
}

function cumulativeDelta(candles: Candle[], window = 5): number {
  const slice = candles.slice(-window);
  let buyVol = 0, sellVol = 0;
  for (const c of slice) {
    if (c.close > c.open) buyVol += c.volume;
    else sellVol += c.volume;
  }
  return sellVol > 0 ? buyVol / sellVol : buyVol > 0 ? 10 : 1;
}

const INST_FEE = 0.0021;
const INST_HARD_SL = 0.02;
const INST_MIN_RR = 2.0;

function processInstitutional(
  state: any, h4Candles: Candle[], h1Candles: Candle[], currentPrice: number
): { updates: any; trade: any | null } {
  const now = new Date().toISOString();
  let updates: any = { last_tick_at: now, updated_at: now };
  let trade: any = null;

  const capital = Number(state.capital);
  const coinBalance = Number(state.coin_balance);
  const entryPrice = Number(state.entry_price);
  const hasPosition = entryPrice > 0 && coinBalance > 0;

  // Trend filter: EMA 200 on H4
  const h4Closes = h4Candles.map(c => c.close);
  const ema200 = ema(h4Closes, 200);
  const lastEma200 = ema200[ema200.length - 1];
  const isBullish = lastEma200 > 0 && currentPrice > lastEma200;
  const isBearish = lastEma200 > 0 && currentPrice < lastEma200;

  if (hasPosition) {
    const pnlPct = (currentPrice - entryPrice) / entryPrice;

    // Hard Stop Loss 2%
    if (pnlPct <= -INST_HARD_SL) {
      const sellValue = coinBalance * currentPrice * (1 - INST_FEE);
      const pnl = sellValue - (coinBalance * entryPrice / (1 - INST_FEE));
      const holdDuration = state.entry_time ? Date.now() - new Date(state.entry_time).getTime() : 0;

      updates = {
        ...updates, capital: sellValue, coin_balance: 0,
        entry_price: null, entry_time: null, entry_reasons: null, highest_price_seen: null,
        total_pnl: (state.total_pnl || 0) + pnl,
        win_count: state.win_count, loss_count: (state.loss_count || 0) + 1,
      };
      trade = {
        coin_symbol: state.coin_symbol, trade_type: 'sell', price: currentPrice,
        coin_amount: coinBalance, idr_value: sellValue,
        pnl, pnl_pct: pnlPct * 100, hold_duration_ms: holdDuration,
        signal_action: 'HARD_STOP_LOSS', signal_reasons: ['Hard SL 2%'],
        strategy: 'institutional_smc',
      };
      return { updates, trade };
    }

    // TP at R:R 1:2 achieved (roughly 4% profit assuming 2% SL)
    if (pnlPct >= 0.04) {
      const sellValue = coinBalance * currentPrice * (1 - INST_FEE);
      const pnl = sellValue - (coinBalance * entryPrice / (1 - INST_FEE));
      const holdDuration = state.entry_time ? Date.now() - new Date(state.entry_time).getTime() : 0;

      updates = {
        ...updates, capital: sellValue, coin_balance: 0,
        entry_price: null, entry_time: null, entry_reasons: null, highest_price_seen: null,
        total_pnl: (state.total_pnl || 0) + pnl,
        win_count: (state.win_count || 0) + 1, loss_count: state.loss_count,
      };
      trade = {
        coin_symbol: state.coin_symbol, trade_type: 'sell', price: currentPrice,
        coin_amount: coinBalance, idr_value: sellValue,
        pnl, pnl_pct: pnlPct * 100, hold_duration_ms: holdDuration,
        signal_action: 'TAKE_PROFIT_RR2', signal_reasons: ['TP R:R 1:2'],
        strategy: 'institutional_smc',
      };
      return { updates, trade };
    }

    // Sell if trend turned bearish
    if (isBearish && pnlPct >= (INST_FEE * 2)) {
      const sellValue = coinBalance * currentPrice * (1 - INST_FEE);
      const pnl = sellValue - (coinBalance * entryPrice / (1 - INST_FEE));
      const holdDuration = state.entry_time ? Date.now() - new Date(state.entry_time).getTime() : 0;

      updates = {
        ...updates, capital: sellValue, coin_balance: 0,
        entry_price: null, entry_time: null, entry_reasons: null, highest_price_seen: null,
        total_pnl: (state.total_pnl || 0) + pnl,
        win_count: pnl > 0 ? (state.win_count || 0) + 1 : state.win_count,
        loss_count: pnl <= 0 ? (state.loss_count || 0) + 1 : state.loss_count,
      };
      trade = {
        coin_symbol: state.coin_symbol, trade_type: 'sell', price: currentPrice,
        coin_amount: coinBalance, idr_value: sellValue,
        pnl, pnl_pct: pnlPct * 100, hold_duration_ms: holdDuration,
        signal_action: 'TREND_EXIT', signal_reasons: ['Bearish H4 trend exit'],
        strategy: 'institutional_smc',
      };
      return { updates, trade };
    }
  } else if (!hasPosition && capital > 10000 && isBullish) {
    // Entry: Need confluence of Liquidity Sweep + FVG + Order Flow
    const support = getSwingLow(h1Candles, 20);
    const resistance = getSwingHigh(h1Candles, 20);
    const hasSweep = detectLiquiditySweep(h1Candles, support);
    const fvgs = detectFVGs(h1Candles, 30);
    const atBullishFVG = fvgs.filter(f => f.type === 'bullish')
      .some(f => currentPrice >= f.bottom * 0.998 && currentPrice <= f.top * 1.002);
    const delta = cumulativeDelta(h1Candles, 5);
    const hasOrderFlow = delta >= 3.0;

    // RSI confirmation
    const closes = h1Candles.map(c => c.close);
    const rsiVals = rsi(closes, 14);
    const currentRsi = rsiVals[rsiVals.length - 1];
    const rsiOversold = currentRsi < 40;

    // Volume confirmation
    const avgVol = h1Candles.slice(-20, -1).reduce((s, c) => s + c.volume, 0) / 19;
    const lastVol = h1Candles[h1Candles.length - 1].volume;
    const volConfirmed = lastVol >= avgVol * 1.2;

    // Calculate R:R
    const atrValues = atr(h1Candles, 14);
    const currentAtr = atrValues[atrValues.length - 1];
    const slPrice = currentPrice - (currentAtr * 1.5);
    const tpPrice = resistance;
    const riskAmount = currentPrice - slPrice;
    const rewardAmount = tpPrice - currentPrice;
    const rrOk = riskAmount > 0 && rewardAmount / riskAmount >= INST_MIN_RR;

    // Score: need at least 3/5
    let score = 0;
    const reasons: string[] = [];
    if (hasSweep) { score++; reasons.push('Liquidity Sweep'); }
    if (atBullishFVG) { score++; reasons.push('Bullish FVG Zone'); }
    if (hasOrderFlow) { score++; reasons.push(`Order Flow (Delta ${delta.toFixed(1)})`); }
    if (rsiOversold) { score++; reasons.push(`RSI ${currentRsi.toFixed(0)}`); }
    if (volConfirmed) { score++; reasons.push('Volume confirmed'); }

    if (score >= 3 && rrOk) {
      reasons.push(`R:R ${(rewardAmount / riskAmount).toFixed(1)}:1`);
      reasons.push('H4 Bullish (>EMA200)');

      const netCapital = capital * (1 - INST_FEE);
      const amount = netCapital / currentPrice;

      updates = {
        ...updates,
        capital: 0, coin_balance: amount,
        entry_price: currentPrice, entry_time: now,
        entry_reasons: reasons, highest_price_seen: currentPrice,
      };
      trade = {
        coin_symbol: state.coin_symbol, trade_type: 'buy', price: currentPrice,
        coin_amount: amount, idr_value: capital,
        pnl: 0, pnl_pct: 0, hold_duration_ms: 0,
        signal_action: 'BUY', signal_reasons: reasons,
        strategy: 'institutional_smc',
      };
    }
  }

  return { updates, trade };
}

// ═══════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { action, is_running, strategy: targetStrategy } = body;

    // Toggle running state
    if (action === 'toggle') {
      if (targetStrategy) {
        await supabase.from('simulation_state').update({ is_running, updated_at: new Date().toISOString() }).eq('strategy', targetStrategy);
      } else {
        await supabase.from('simulation_state').update({ is_running, updated_at: new Date().toISOString() }).neq('id', '');
      }
      return new Response(JSON.stringify({ success: true, is_running }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reset
    if (action === 'reset') {
      if (targetStrategy) {
        await supabase.from('simulation_trades').delete().eq('strategy', targetStrategy);
        await supabase.from('simulation_snapshots').delete().eq('strategy', targetStrategy);
        await supabase.from('simulation_state').delete().eq('strategy', targetStrategy);
      } else {
        await supabase.from('simulation_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('simulation_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('simulation_state').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      return new Response(JSON.stringify({ success: true, action: 'reset' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normal tick
    const { data: coinRows } = await supabase.from('simulation_coins').select('coin_symbol');
    const WATCHLIST = coinRows?.map((r: any) => r.coin_symbol) || FALLBACK_WATCHLIST;

    const summaries = await fetchSummaries();
    const tickers = summaries?.tickers || {};
    const prices24h = summaries?.prices_24h || {};

    const results: any[] = [];

    for (const symbol of WATCHLIST) {
      const pair = `${symbol.toLowerCase()}_idr`;
      const t = tickers[pair];
      if (!t) { results.push({ symbol, status: 'no_ticker' }); continue; }

      const currentPrice = parseFloat(t.last);
      const price24h = parseFloat(prices24h[pair.replace('_', '')] || t.last);
      const change24h = price24h > 0 ? ((currentPrice - price24h) / price24h) * 100 : 0;

      // Pre-fetch candles for institutional strategy
      let h4Candles: Candle[] = [];
      let h1Candles: Candle[] = [];

      for (const stratName of STRATEGIES) {
        // Get or create state
        let { data: state } = await supabase
          .from('simulation_state')
          .select('*')
          .eq('coin_symbol', symbol)
          .eq('strategy', stratName)
          .single();

        if (!state) {
          const { data: newState } = await supabase
            .from('simulation_state')
            .insert({ coin_symbol: symbol, capital: INITIAL_CAPITAL, coin_balance: 0, is_running: true, strategy: stratName })
            .select()
            .single();
          state = newState;
        }

        if (!state || !state.is_running) {
          results.push({ symbol, strategy: stratName, status: 'paused' });
          continue;
        }

        let tradeResult: any = null;
        let stateUpdates: any = {};

        if (stratName === 'alpha_simons') {
          const result = processAlphaSimons(state, t, change24h);
          stateUpdates = result.updates;
          tradeResult = result.trade;
        } else if (stratName === 'institutional_smc') {
          // Lazy-load candles
          if (h4Candles.length === 0) h4Candles = await fetchCandles(symbol, '240', 250);
          if (h1Candles.length === 0) h1Candles = await fetchCandles(symbol, '60', 150);

          if (h4Candles.length >= 200 && h1Candles.length >= 30) {
            const result = processInstitutional(state, h4Candles, h1Candles, currentPrice);
            stateUpdates = result.updates;
            tradeResult = result.trade;
          } else {
            stateUpdates = { last_tick_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            results.push({ symbol, strategy: stratName, status: 'insufficient_data' });
          }
        }

        await supabase.from('simulation_state').update(stateUpdates).eq('id', state.id);

        if (tradeResult) {
          await supabase.from('simulation_trades').insert(tradeResult);
          results.push({ symbol, strategy: stratName, status: tradeResult.trade_type, price: tradeResult.price });
        } else {
          results.push({ symbol, strategy: stratName, status: 'hold' });
        }

        // Snapshot
        const updatedCapital = stateUpdates.capital !== undefined ? stateUpdates.capital : Number(state.capital);
        const updatedBalance = stateUpdates.coin_balance !== undefined ? stateUpdates.coin_balance : Number(state.coin_balance);
        const totalValue = updatedCapital + (updatedBalance * currentPrice);

        await supabase.from('simulation_snapshots').insert({
          coin_symbol: symbol, total_value: totalValue, coin_price: currentPrice,
          signal_action: tradeResult?.signal_action || null, strategy: stratName,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('Simulation tick error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
