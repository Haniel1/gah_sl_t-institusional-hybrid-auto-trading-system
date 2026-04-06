import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Price Generation ───
function generatePrice(lastPrice: number): number {
  const change = (Math.random() - 0.498) * lastPrice * 0.004;
  return lastPrice + change;
}

function generateCandles(basePrice: number, count = 50) {
  const candles: { open: number; high: number; low: number; close: number; volume: number }[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.498) * price * 0.005;
    const open = price;
    price += change;
    const high = Math.max(open, price) + Math.random() * price * 0.002;
    const low = Math.min(open, price) - Math.random() * price * 0.002;
    const volume = 50 + Math.random() * 200;
    candles.push({ open, high, low, close: price, volume });
  }
  return candles;
}

// ─── Indicator Helpers ───
function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = data[0];
  for (let i = 0; i < data.length; i++) {
    prev = i === 0 ? data[0] : data[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(data[i]); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function rsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  if (period < closes.length) {
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function atr(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const tr = i === 0
      ? candles[i].high - candles[i].low
      : Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    if (i < period) {
      result.push(tr);
    } else if (i === period) {
      const avg = result.reduce((a, b) => a + b, 0) / period;
      result.push(avg);
    } else {
      result.push((result[result.length - 1] * (period - 1) + tr) / period);
    }
  }
  return result;
}

function macd(closes: number[]): { macdLine: number[]; signal: number[]; histogram: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signal[i]);
  return { macdLine, signal, histogram };
}

function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(mid[i]); lower.push(mid[i]); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = mid[i];
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - avg) ** 2, 0) / period);
    upper.push(avg + mult * std);
    lower.push(avg - mult * std);
  }
  return { upper, mid, lower };
}

// ─── Strategy Implementations ───
interface StrategyResult {
  signal: 'long' | 'short' | 'none';
  sl: number;
  tp: number;
  confidence: number;
}

function strategyTrendScalping(candles: { open: number; high: number; low: number; close: number; volume: number }[]): StrategyResult {
  const closes = candles.map(c => c.close);
  const last = closes[closes.length - 1];
  const ema8 = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsiVals = rsi(closes, 14);
  const atrVals = atr(candles, 14);
  const i = closes.length - 1;
  const atrVal = atrVals[i] || last * 0.01;

  // StochRSI approximation
  const rsiSlice = rsiVals.slice(-14);
  const rsiMin = Math.min(...rsiSlice);
  const rsiMax = Math.max(...rsiSlice);
  const stochRsi = rsiMax === rsiMin ? 50 : ((rsiVals[i] - rsiMin) / (rsiMax - rsiMin)) * 100;

  if (ema8[i] > ema21[i] && ema21[i] > ema50[i] && stochRsi < 30 && rsiVals[i] < 45) {
    return { signal: 'long', sl: last - atrVal * 1.5, tp: last + atrVal * 2.5, confidence: 72 };
  }
  if (ema8[i] < ema21[i] && ema21[i] < ema50[i] && stochRsi > 70 && rsiVals[i] > 55) {
    return { signal: 'short', sl: last + atrVal * 1.5, tp: last - atrVal * 2.5, confidence: 72 };
  }
  return { signal: 'none', sl: 0, tp: 0, confidence: 0 };
}

function strategySmartMoney(candles: { open: number; high: number; low: number; close: number; volume: number }[]): StrategyResult {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const last = closes[closes.length - 1];
  const i = closes.length - 1;
  const atrVals = atr(candles, 14);
  const atrVal = atrVals[i] || last * 0.01;

  // Order Block detection
  let bullishOB = false, bearishOB = false;
  for (let j = Math.max(3, i - 10); j < i - 1; j++) {
    if (closes[j] < candles[j].open && closes[j + 1] > candles[j + 1].open && closes[j + 1] > highs[j]) {
      if (last >= lows[j] && last <= highs[j]) bullishOB = true;
    }
    if (closes[j] > candles[j].open && closes[j + 1] < candles[j + 1].open && closes[j + 1] < lows[j]) {
      if (last >= lows[j] && last <= highs[j]) bearishOB = true;
    }
  }

  // FVG detection
  let bullishFVG = false, bearishFVG = false;
  if (i >= 2) {
    if (lows[i] > highs[i - 2]) bullishFVG = true;
    if (highs[i] < lows[i - 2]) bearishFVG = true;
  }

  // Liquidity sweep
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const sweepHigh = highs[i] > recentHigh && closes[i] < recentHigh;
  const sweepLow = lows[i] < recentLow && closes[i] > recentLow;

  if ((bullishOB || bullishFVG || sweepLow) && closes[i] > closes[i - 1]) {
    return { signal: 'long', sl: last - atrVal * 2, tp: last + atrVal * 3, confidence: 68 };
  }
  if ((bearishOB || bearishFVG || sweepHigh) && closes[i] < closes[i - 1]) {
    return { signal: 'short', sl: last + atrVal * 2, tp: last - atrVal * 3, confidence: 68 };
  }
  return { signal: 'none', sl: 0, tp: 0, confidence: 0 };
}

function strategyMultiIndicator(candles: { open: number; high: number; low: number; close: number; volume: number }[]): StrategyResult {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const last = closes[closes.length - 1];
  const i = closes.length - 1;
  const atrVals = atr(candles, 14);
  const atrVal = atrVals[i] || last * 0.01;

  const rsiVals = rsi(closes, 14);
  const { macdLine, signal: macdSignal, histogram } = macd(closes);
  const bb = bollingerBands(closes);
  const volSma = sma(volumes, 20);

  let score = 0;
  // RSI
  if (rsiVals[i] < 35) score += 2; else if (rsiVals[i] < 45) score += 1;
  if (rsiVals[i] > 65) score -= 2; else if (rsiVals[i] > 55) score -= 1;
  // MACD
  if (histogram[i] > 0 && histogram[i] > histogram[i - 1]) score += 2;
  if (histogram[i] < 0 && histogram[i] < histogram[i - 1]) score -= 2;
  // Bollinger
  if (last <= bb.lower[i]) score += 2;
  if (last >= bb.upper[i]) score -= 2;
  // Volume
  if (volumes[i] > volSma[i] * 1.5) score += (closes[i] > closes[i - 1] ? 1 : -1);

  if (score >= 4) {
    return { signal: 'long', sl: last - atrVal * 1.5, tp: last + atrVal * 2, confidence: 60 + score * 3 };
  }
  if (score <= -4) {
    return { signal: 'short', sl: last + atrVal * 1.5, tp: last - atrVal * 2, confidence: 60 + Math.abs(score) * 3 };
  }
  return { signal: 'none', sl: 0, tp: 0, confidence: 0 };
}

function strategyGainzAlgoV3(candles: { open: number; high: number; low: number; close: number; volume: number }[]): StrategyResult {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const last = closes[closes.length - 1];
  const i = closes.length - 1;
  const atrVals = atr(candles, 14);
  const atrVal = atrVals[i] || last * 0.01;

  // EMA Ribbon
  const ema5 = ema(closes, 5);
  const ema8 = ema(closes, 8);
  const ema13 = ema(closes, 13);
  const ema21 = ema(closes, 21);
  const ema34 = ema(closes, 34);

  const ribbonBullish = ema5[i] > ema8[i] && ema8[i] > ema13[i] && ema13[i] > ema21[i] && ema21[i] > ema34[i];
  const ribbonBearish = ema5[i] < ema8[i] && ema8[i] < ema13[i] && ema13[i] < ema21[i] && ema21[i] < ema34[i];

  // RSI divergence approximation
  const rsiVals = rsi(closes, 14);
  const rsiRising = rsiVals[i] > rsiVals[i - 1] && rsiVals[i - 1] > rsiVals[i - 2];
  const rsiFalling = rsiVals[i] < rsiVals[i - 1] && rsiVals[i - 1] < rsiVals[i - 2];
  const priceFalling = closes[i] < closes[i - 2];
  const priceRising = closes[i] > closes[i - 2];
  const bullishDiv = rsiRising && priceFalling;
  const bearishDiv = rsiFalling && priceRising;

  // MACD confirmation
  const { histogram } = macd(closes);
  const macdBullish = histogram[i] > 0 && histogram[i] > histogram[i - 1];
  const macdBearish = histogram[i] < 0 && histogram[i] < histogram[i - 1];

  // Volume confirmation
  const volSma = sma(volumes, 20);
  const highVol = volumes[i] > volSma[i] * 1.3;

  let bullScore = 0, bearScore = 0;
  if (ribbonBullish) bullScore += 3;
  if (ribbonBearish) bearScore += 3;
  if (bullishDiv) bullScore += 2;
  if (bearishDiv) bearScore += 2;
  if (macdBullish) bullScore += 2;
  if (macdBearish) bearScore += 2;
  if (highVol) { bullScore += 1; bearScore += 1; }

  if (bullScore >= 5) {
    return { signal: 'long', sl: last - atrVal * 1.5, tp: last + atrVal * 2.5, confidence: 65 + bullScore * 2 };
  }
  if (bearScore >= 5) {
    return { signal: 'short', sl: last + atrVal * 1.5, tp: last - atrVal * 2.5, confidence: 65 + bearScore * 2 };
  }
  return { signal: 'none', sl: 0, tp: 0, confidence: 0 };
}

function strategyLuxAlgoIOF(candles: { open: number; high: number; low: number; close: number; volume: number }[]): StrategyResult {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const last = closes[closes.length - 1];
  const i = closes.length - 1;
  const atrVals = atr(candles, 14);
  const atrVal = atrVals[i] || last * 0.01;

  // Order Flow Imbalance (Delta)
  const deltas: number[] = candles.map(c => c.close > c.open ? c.volume : c.close < c.open ? -c.volume : 0);
  const cumDelta = ema(deltas, 14);
  const deltaRising = cumDelta[i] > cumDelta[i - 1] && cumDelta[i - 1] > cumDelta[i - 2];
  const deltaFalling = cumDelta[i] < cumDelta[i - 1] && cumDelta[i - 1] < cumDelta[i - 2];

  // Institutional accumulation/distribution
  const volSma = sma(volumes, 20);
  const highVol = volumes[i] > volSma[i] * 1.5;
  const smallBody = Math.abs(closes[i] - candles[i].open) < atrVal * 0.3;
  const accumulation = highVol && smallBody && closes[i] > closes[i - 1];
  const distribution = highVol && smallBody && closes[i] < closes[i - 1];

  // Liquidity sweep
  const recentHigh = Math.max(...highs.slice(-15));
  const recentLow = Math.min(...lows.slice(-15));
  const sweepUp = highs[i] > recentHigh && closes[i] < candles[i].open;
  const sweepDown = lows[i] < recentLow && closes[i] > candles[i].open;

  let bullScore = 0, bearScore = 0;
  if (deltaRising) bullScore += 3;
  if (deltaFalling) bearScore += 3;
  if (accumulation) bullScore += 3;
  if (distribution) bearScore += 3;
  if (sweepDown) bullScore += 2;
  if (sweepUp) bearScore += 2;

  if (bullScore >= 5) {
    return { signal: 'long', sl: last - atrVal * 2, tp: last + atrVal * 3, confidence: 62 + bullScore * 2 };
  }
  if (bearScore >= 5) {
    return { signal: 'short', sl: last + atrVal * 2, tp: last - atrVal * 3, confidence: 62 + bearScore * 2 };
  }
  return { signal: 'none', sl: 0, tp: 0, confidence: 0 };
}

function runStrategy(strategyId: string, candles: { open: number; high: number; low: number; close: number; volume: number }[]): StrategyResult {
  switch (strategyId) {
    case 'trend-scalping': return strategyTrendScalping(candles);
    case 'smart-money': return strategySmartMoney(candles);
    case 'multi-indicator': return strategyMultiIndicator(candles);
    case 'gainz-algo-v3': return strategyGainzAlgoV3(candles);
    case 'luxalgo-iof': return strategyLuxAlgoIOF(candles);
    default: return strategyTrendScalping(candles);
  }
}

// ─── Main Handler ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get ALL running simulations (all strategies)
    const { data: states } = await supabase
      .from("okx_sim_state")
      .select("*")
      .eq("is_running", true);

    if (!states || states.length === 0) {
      return new Response(JSON.stringify({ message: "No running simulations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    // Group by symbol so we generate candles once per symbol
    const bySymbol: Record<string, typeof states> = {};
    for (const state of states) {
      if (!bySymbol[state.symbol]) bySymbol[state.symbol] = [];
      bySymbol[state.symbol].push(state);
    }

    for (const [symbol, symbolStates] of Object.entries(bySymbol)) {
      // Generate candles once per symbol
      const basePrice = symbolStates[0].entry_price || 65000;
      const candles = generateCandles(basePrice, 60);
      const currentPrice = candles[candles.length - 1].close;

      // Process each strategy for this symbol
      for (const state of symbolStates) {
        let updated = false;

        // Check existing position for SL/TP
        if (state.position_side) {
          const pnlPct = state.position_side === 'long'
            ? ((currentPrice - state.entry_price) / state.entry_price) * 100 * state.leverage
            : ((state.entry_price - currentPrice) / state.entry_price) * 100 * state.leverage;
          const pnl = (pnlPct / 100) * state.position_amount;

          const hitSL = state.position_side === 'long'
            ? currentPrice <= state.stop_loss
            : currentPrice >= state.stop_loss;
          const hitTP = state.position_side === 'long'
            ? currentPrice >= state.take_profit
            : currentPrice <= state.take_profit;

          if (hitSL || hitTP) {
            const reason = hitSL ? 'Stop Loss (background)' : 'Take Profit (background)';

            await supabase.from("okx_sim_trades").insert({
              symbol: state.symbol,
              side: state.position_side,
              entry_price: state.entry_price,
              exit_price: currentPrice,
              amount: state.position_amount,
              leverage: state.leverage,
              pnl,
              pnl_pct: pnlPct,
              strategy: state.strategy,
              reason,
              entry_time: state.entry_time,
              exit_time: new Date().toISOString(),
            });

            await supabase.from("okx_sim_state").update({
              balance: Number(state.balance) + Number(state.position_amount) + pnl,
              position_side: null,
              entry_price: null,
              position_amount: 0,
              stop_loss: null,
              take_profit: null,
              entry_time: null,
              total_pnl: Number(state.total_pnl) + pnl,
              win_count: state.win_count + (pnl > 0 ? 1 : 0),
              loss_count: state.loss_count + (pnl < 0 ? 1 : 0),
              last_tick_at: new Date().toISOString(),
            }).eq("id", state.id);

            results.push({ symbol, strategy: state.strategy, action: 'closed', reason, pnl: Math.round(pnl * 100) / 100 });
            updated = true;
          }
        }

        // Look for new entry using the strategy-specific algorithm
        if (!updated && !state.position_side) {
          const result = runStrategy(state.strategy, candles);

          if ((result.signal === 'long' || result.signal === 'short') && result.confidence >= 60) {
            const positionSize = Number(state.balance) * 0.3;

            if (positionSize >= 10) {
              await supabase.from("okx_sim_state").update({
                balance: Number(state.balance) - positionSize,
                position_side: result.signal,
                entry_price: currentPrice,
                position_amount: positionSize,
                stop_loss: result.sl,
                take_profit: result.tp,
                entry_time: new Date().toISOString(),
                last_tick_at: new Date().toISOString(),
              }).eq("id", state.id);

              results.push({ symbol, strategy: state.strategy, action: 'opened', side: result.signal, price: Math.round(currentPrice * 100) / 100 });
              updated = true;
            }
          }
        }

        // Just update last tick time
        if (!updated) {
          await supabase.from("okx_sim_state").update({
            last_tick_at: new Date().toISOString(),
          }).eq("id", state.id);
        }
      }
    }

    return new Response(JSON.stringify({ processed: states.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
