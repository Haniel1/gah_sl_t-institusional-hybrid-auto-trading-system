import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FALLBACK_WATCHLIST = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'AVAX', 'LINK', 'XRP', 'DOGE'];

const INITIAL_CAPITAL = 1_000_000;
const STRATEGIES = ['dual_signal', 'swing_trading', 'time_prediction', 'zero_lag_trend'] as const;

// WIT = UTC+9
const WIT_OFFSET = 9;

// ---- Helpers ----

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
  const mult = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * mult + result[i - 1];
  }
  return result;
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

// ---- Strategy: Dual Signal (GainzAlgo + Fabio) ----
function calculateDualSignal(candles: Candle[]): { type: 'buy' | 'sell'; reasons: string[] } | null {
  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // GainzAlgo
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const atr = sma(tr, 14);
  const emaFast = ema(closes, 12);
  const emaSlow = ema(closes, 26);
  const momentum = emaFast.map((f, i) => f - emaSlow[i]);

  const last = candles.length - 1;
  const reasons: string[] = [];

  let rollingMax = -Infinity, rollingMin = Infinity;
  for (let j = last - 5; j < last; j++) {
    if (j >= 0) { rollingMax = Math.max(rollingMax, highs[j]); rollingMin = Math.min(rollingMin, lows[j]); }
  }

  const volCheck = atr[last] > atr[last - 1] * 0.95;
  let gainzBuy = false, gainzSell = false;
  if (closes[last] > rollingMax && momentum[last] > 0 && volCheck) { gainzBuy = true; reasons.push('GainzAlgo: Breakout BUY'); }
  if (closes[last] < rollingMin && momentum[last] < 0 && volCheck) { gainzSell = true; reasons.push('GainzAlgo: Breakdown SELL'); }

  // Fabio - Volume Profile
  const profileWindow = candles.slice(-24);
  const priceVol = new Map<number, number>();
  const allHighs = profileWindow.map(c => c.high);
  const allLows = profileWindow.map(c => c.low);
  const step = (Math.max(...allHighs) - Math.min(...allLows)) / 50 || 1;
  for (const c of profileWindow) {
    const bin = Math.round(((c.high + c.low) / 2) / step) * step;
    priceVol.set(bin, (priceVol.get(bin) || 0) + c.volume);
  }
  let poc = 0, maxVol = 0;
  for (const [price, vol] of priceVol) { if (vol > maxVol) { maxVol = vol; poc = price; } }
  const totalVol = Array.from(priceVol.values()).reduce((a, b) => a + b, 0);
  const target = totalVol * 0.7;
  const sorted = Array.from(priceVol.entries()).sort((a, b) => Math.abs(a[0] - poc) - Math.abs(b[0] - poc));
  let cumVol = 0, vah = poc, val = poc;
  for (const [price, vol] of sorted) { cumVol += vol; if (price > vah) vah = price; if (price < val) val = price; if (cumVol >= target) break; }

  const cvd: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].close > candles[i].open ? candles[i].volume : -candles[i].volume;
    cvd.push(cvd[i - 1] + delta);
  }
  const cvdWindow = cvd.slice(-50);
  const cvdMin = Math.min(...cvdWindow);
  const cvdMax = Math.max(...cvdWindow);
  const cvdRange = cvdMax - cvdMin || 1;
  const cvdNorm = (cvd[last] - cvdMin) / cvdRange;
  const delta = candles[last].close > candles[last].open ? candles[last].volume : -candles[last].volume;

  let fabioBuy = false, fabioSell = false;
  if (closes[last] <= val * 1.005 && cvdNorm < 0.3 && delta > 0) { fabioBuy = true; reasons.push('Fabio: VAL zone BUY'); }
  if (closes[last] >= vah * 0.995 && cvdNorm > 0.7 && delta < 0) { fabioSell = true; reasons.push('Fabio: VAH zone SELL'); }

  // BUY: both GainzAlgo AND Fabio agree
  if (gainzBuy && fabioBuy) return { type: 'buy', reasons };
  // SELL: Fabio says sell
  if (fabioSell) return { type: 'sell', reasons };

  return null;
}

// ---- Strategy: Swing Trading (CRT Overlay) ----
function calculateSwingTrading(candles: Candle[]): { type: 'buy' | 'sell'; reasons: string[] } | null {
  if (candles.length < 10) return null;

  const last = candles.length - 1;
  const lookback = 4;
  if (last < lookback + 1) return null;

  // CRT range from previous lookback candles
  let crtHigh = -Infinity;
  let crtLow = Infinity;
  for (let j = last - lookback; j < last; j++) {
    crtHigh = Math.max(crtHigh, candles[j].high);
    crtLow = Math.min(crtLow, candles[j].low);
  }

  const curr = candles[last];
  const range = crtHigh - crtLow;
  if (range <= 0) return null;

  const reasons: string[] = [];

  // SELL: price sweeps above CRT High then closes back below (rejection)
  if (curr.high > crtHigh && curr.close < crtHigh && curr.close < curr.open) {
    reasons.push(`CRT: Sweep High ${crtHigh.toFixed(0)} → Reversal SELL`);
    return { type: 'sell', reasons };
  }

  // BUY: price sweeps below CRT Low then closes back above (rejection)
  if (curr.low < crtLow && curr.close > crtLow && curr.close > curr.open) {
    reasons.push(`CRT: Sweep Low ${crtLow.toFixed(0)} → Reversal BUY`);
    return { type: 'buy', reasons };
  }

  return null;
}

async function fetchCandles(symbol: string, tf = '60'): Promise<Candle[]> {
  const to = Math.floor(Date.now() / 1000);
  const tfSeconds = parseInt(tf) * 60 || 3600;
  const from = to - 200 * tfSeconds;
  const url = `https://indodax.com/tradingview/history_v2?symbol=${symbol.toUpperCase()}IDR&tf=${tf}&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => ({
      time: Number(d.Time), open: Number(d.Open), high: Number(d.High),
      low: Number(d.Low), close: Number(d.Close), volume: Number(d.Volume),
    }));
  } catch { return []; }
}

// ---- Strategy: Time Prediction (Hourly Pattern Analysis) ----
function calculateTimePrediction(candles: Candle[]): { type: 'buy' | 'sell'; reasons: string[] } | null {
  if (candles.length < 48) return null;

  const now = new Date();
  const witHour = (now.getUTCHours() + WIT_OFFSET) % 24;

  // Group candles by WIT hour and calculate stats
  const hourBuckets: Map<number, { returns: number[]; volumes: number[] }> = new Map();
  for (let h = 0; h < 24; h++) hourBuckets.set(h, { returns: [], volumes: [] });

  for (let i = 1; i < candles.length; i++) {
    const candleDate = new Date(candles[i].time * 1000);
    const hour = (candleDate.getUTCHours() + WIT_OFFSET) % 24;
    const bucket = hourBuckets.get(hour)!;
    const ret = ((candles[i].close - candles[i].open) / candles[i].open) * 100;
    bucket.returns.push(ret);
    bucket.volumes.push(candles[i].volume);
  }

  const currentBucket = hourBuckets.get(witHour)!;
  if (currentBucket.returns.length < 3) return null;

  const avgReturn = currentBucket.returns.reduce((a, v) => a + v, 0) / currentBucket.returns.length;
  const bullishCount = currentBucket.returns.filter(r => r > 0).length;
  const winRate = (bullishCount / currentBucket.returns.length) * 100;
  const avgVolume = currentBucket.volumes.reduce((a, v) => a + v, 0) / currentBucket.volumes.length;

  // Also check momentum from last few candles
  const last = candles.length - 1;
  const shortMomentum = candles[last].close > candles[Math.max(0, last - 3)].close;

  const reasons: string[] = [];

  // BUY: high win rate for this hour + positive avg return + current momentum up
  if (avgReturn > 0.02 && winRate > 55 && shortMomentum) {
    reasons.push(`TimePred: Jam ${witHour}:00 WIT historis naik ${avgReturn.toFixed(3)}% (win ${winRate.toFixed(0)}%)`);
    return { type: 'buy', reasons };
  }

  // SELL: low win rate + negative returns + momentum down
  if (avgReturn < -0.02 && winRate < 45 && !shortMomentum) {
    reasons.push(`TimePred: Jam ${witHour}:00 WIT historis turun ${avgReturn.toFixed(3)}% (loss ${(100 - winRate).toFixed(0)}%)`);
    return { type: 'sell', reasons };
  }

  return null;
}

// ---- Strategy: Zero Lag Trend Signals (AlgoAlpha) ----
function calculateZeroLagTrend(candles: Candle[]): { type: 'buy' | 'sell'; reasons: string[] } | null {
  const length = 70;
  const bandMult = 1.2;
  if (candles.length < length * 3 + 1) return null;

  const closes = candles.map(c => c.close);
  const lag = Math.floor((length - 1) / 2);

  // ZLEMA: ema(src + (src - src[lag]), length)
  const zlSrc = closes.map((c, i) => i >= lag ? c + (c - closes[i - lag]) : c);
  const zlemaData = ema(zlSrc, length);

  // ATR
  const trData: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    trData.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - closes[i - 1]),
      Math.abs(candles[i].low - closes[i - 1])
    ));
  }
  const atrData = sma(trData, length);

  // Highest ATR over length*3 for volatility band
  const volBand: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    let maxAtr = 0;
    for (let j = Math.max(0, i - length * 3 + 1); j <= i; j++) {
      if (atrData[j] > maxAtr) maxAtr = atrData[j];
    }
    volBand[i] = maxAtr * bandMult;
  }

  // Trend state
  const trend: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    trend[i] = trend[i - 1];
    if (closes[i] > zlemaData[i] + volBand[i]) trend[i] = 1;
    if (closes[i] < zlemaData[i] - volBand[i]) trend[i] = -1;
  }

  const last = candles.length - 1;
  const reasons: string[] = [];

  // Trend change: Bullish
  if (trend[last] === 1 && trend[last - 1] !== 1) {
    reasons.push('ZeroLag: Bullish trend change (price > ZLEMA + band)');
    return { type: 'buy', reasons };
  }

  // Trend change: Bearish
  if (trend[last] === -1 && trend[last - 1] !== -1) {
    reasons.push('ZeroLag: Bearish trend change (price < ZLEMA - band)');
    return { type: 'sell', reasons };
  }

  // Entry signal: ZLEMA crossover in confirmed bullish trend
  if (trend[last] === 1 && trend[last - 1] === 1 &&
      closes[last] > zlemaData[last] && closes[last - 1] <= zlemaData[last - 1]) {
    reasons.push('ZeroLag: Entry BUY (ZLEMA crossover in bullish trend)');
    return { type: 'buy', reasons };
  }

  // Entry signal: ZLEMA crossunder in confirmed bearish trend
  if (trend[last] === -1 && trend[last - 1] === -1 &&
      closes[last] < zlemaData[last] && closes[last - 1] >= zlemaData[last - 1]) {
    reasons.push('ZeroLag: Entry SELL (ZLEMA crossunder in bearish trend)');
    return { type: 'sell', reasons };
  }

  return null;
}

function getSignalForStrategy(strategy: string, candles: Candle[]) {
  if (strategy === 'dual_signal') return calculateDualSignal(candles);
  if (strategy === 'swing_trading') return calculateSwingTrading(candles);
  if (strategy === 'time_prediction') return calculateTimePrediction(candles);
  if (strategy === 'zero_lag_trend') return calculateZeroLagTrend(candles);
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    // Reset simulation data
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

    // Normal tick: fetch coin list from database
    const { data: coinRows } = await supabase.from('simulation_coins').select('coin_symbol');
    const WATCHLIST = coinRows?.map((r: any) => r.coin_symbol) || FALLBACK_WATCHLIST;

    const results: any[] = [];

    for (const symbol of WATCHLIST) {
      // Fetch 1h candles (default) and 15m candles (for swing_trading)
      const candles1h = await fetchCandles(symbol, '60');
      const candles15m = await fetchCandles(symbol, '15');

      if (candles1h.length < 10 && candles15m.length < 10) {
        results.push({ symbol, status: 'insufficient_data' });
        continue;
      }

      const currentPrice = (candles15m.length > 0 ? candles15m[candles15m.length - 1] : candles1h[candles1h.length - 1]).close;

      for (const stratName of STRATEGIES) {
        // Use 15m candles for swing_trading, 1h for others
        const candles = stratName === 'swing_trading' ? candles15m : candles1h;
        if (candles.length < 10) {
          results.push({ symbol, strategy: stratName, status: 'insufficient_data' });
          continue;
        }
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

        const signal = getSignalForStrategy(stratName, candles);
        const capital = Number(state.capital);
        const coinBalance = Number(state.coin_balance);
        const isHolding = state.entry_price !== null && coinBalance > 0;

        let tradeExecuted = false;

        // BUY
        if (!isHolding && signal?.type === 'buy' && capital > 10000) {
          const buyAmount = capital * 0.95;
          const coinAmount = buyAmount / currentPrice;

          await supabase.from('simulation_state').update({
            capital: capital - buyAmount,
            coin_balance: coinAmount,
            entry_price: currentPrice,
            entry_time: new Date().toISOString(),
            entry_reasons: signal.reasons,
            last_tick_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', state.id);

          await supabase.from('simulation_trades').insert({
            coin_symbol: symbol,
            trade_type: 'buy',
            price: currentPrice,
            coin_amount: coinAmount,
            idr_value: buyAmount,
            pnl: 0,
            pnl_pct: 0,
            hold_duration_ms: 0,
            signal_action: 'buy',
            signal_reasons: signal.reasons,
            strategy: stratName,
          });

          tradeExecuted = true;
          results.push({ symbol, strategy: stratName, status: 'bought', price: currentPrice });
        }

        // SELL
        if (isHolding && coinBalance > 0) {
          const entryPrice = Number(state.entry_price);
          const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
          const shouldSell = signal?.type === 'sell' || pnlPct >= 5 || pnlPct <= -3;

          if (shouldSell) {
            const sellValue = coinBalance * currentPrice;
            const pnl = sellValue - (coinBalance * entryPrice);
            const holdDuration = state.entry_time ? Date.now() - new Date(state.entry_time).getTime() : 0;
            const isWin = pnl > 0;

            await supabase.from('simulation_state').update({
              capital: capital + sellValue,
              coin_balance: 0,
              entry_price: null,
              entry_time: null,
              entry_reasons: null,
              total_pnl: Number(state.total_pnl) + pnl,
              win_count: state.win_count + (isWin ? 1 : 0),
              loss_count: state.loss_count + (isWin ? 0 : 1),
              last_tick_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', state.id);

            const sellReasons = signal?.reasons || [pnlPct >= 5 ? 'TP hit (+5%)' : 'SL hit (-3%)'];

            await supabase.from('simulation_trades').insert({
              coin_symbol: symbol,
              trade_type: 'sell',
              price: currentPrice,
              coin_amount: coinBalance,
              idr_value: sellValue,
              pnl,
              pnl_pct: pnlPct,
              hold_duration_ms: holdDuration,
              signal_action: 'sell',
              signal_reasons: sellReasons,
              strategy: stratName,
            });

            tradeExecuted = true;
            results.push({ symbol, strategy: stratName, status: 'sold', price: currentPrice, pnl, pnlPct });
          }
        }

        if (!tradeExecuted) {
          await supabase.from('simulation_state').update({
            last_tick_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', state.id);
        }

        // Snapshot
        const totalValue = (Number(state.capital) || capital) + (Number(state.coin_balance) || coinBalance) * currentPrice;
        await supabase.from('simulation_snapshots').insert({
          coin_symbol: symbol,
          total_value: tradeExecuted ? (capital + coinBalance * currentPrice) : totalValue,
          capital: Number(state.capital) || capital,
          coin_balance: Number(state.coin_balance) || coinBalance,
          coin_price: currentPrice,
          signal_action: signal?.type || 'hold',
          strategy: stratName,
        });

        if (!tradeExecuted) {
          results.push({ symbol, strategy: stratName, status: 'hold', price: currentPrice });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
