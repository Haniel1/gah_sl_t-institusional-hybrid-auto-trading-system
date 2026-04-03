// OKX Futures Trading Strategies for BTCUSDT Perpetual
// Supports Long & Short positions with leverage 20x-100x

export type OKXSignal = 'long' | 'short' | 'close_long' | 'close_short' | 'hold';
export type StrategyId = 'trend-scalping' | 'smart-money' | 'multi-indicator';

export interface OKXCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OKXStrategyResult {
  signal: OKXSignal;
  confidence: number; // 0-100
  reasons: string[];
  stopLoss: number;
  takeProfit: number;
  suggestedLeverage: number;
}

// ─── Utility Functions ───────────────────────────────────────

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function rsi(closes: number[], period = 14): number[] {
  const result: number[] = [50];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function stochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3): { k: number[]; d: number[] } {
  const rsiVals = rsi(closes, rsiPeriod);
  const stoch: number[] = [];
  for (let i = 0; i < rsiVals.length; i++) {
    if (i < stochPeriod - 1) { stoch.push(50); continue; }
    const slice = rsiVals.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    stoch.push(max === min ? 50 : ((rsiVals[i] - min) / (max - min)) * 100);
  }
  const k = sma(stoch, kSmooth);
  const d = sma(k.map(v => isNaN(v) ? 50 : v), kSmooth);
  return { k, d };
}

function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(mid[i])) { upper.push(NaN); lower.push(NaN); continue; }
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const stdDev = Math.sqrt(slice.reduce((s, v) => s + (v - mid[i]) ** 2, 0) / slice.length);
    upper.push(mid[i] + mult * stdDev);
    lower.push(mid[i] - mult * stdDev);
  }
  return { upper, mid, lower };
}

function atr(candles: OKXCandle[], period = 14): number[] {
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  return ema(tr, period);
}

// ─── Strategy 1: Trend Following + Scalping ─────────────────

function trendScalpingStrategy(candles: OKXCandle[]): OKXStrategyResult {
  if (candles.length < 55) return { signal: 'hold', confidence: 0, reasons: ['Data tidak cukup'], stopLoss: 0, takeProfit: 0, suggestedLeverage: 20 };

  const closes = candles.map(c => c.close);
  const last = closes[closes.length - 1];
  const ema5 = ema(closes, 5);
  const ema10 = ema(closes, 10);
  const ema50 = ema(closes, 50);
  const { k: stochK, d: stochD } = stochRSI(closes);
  const atrVals = atr(candles);
  const currentATR = atrVals[atrVals.length - 1];

  const i = closes.length - 1;
  const trendUp = ema5[i] > ema50[i] && ema10[i] > ema50[i];
  const trendDown = ema5[i] < ema50[i] && ema10[i] < ema50[i];
  const emaCrossUp = ema5[i] > ema10[i] && ema5[i - 1] <= ema10[i - 1];
  const emaCrossDown = ema5[i] < ema10[i] && ema5[i - 1] >= ema10[i - 1];
  const stochOversold = stochK[i] < 20 && stochD[i] < 20;
  const stochOverbought = stochK[i] > 80 && stochD[i] > 80;
  const stochCrossUp = stochK[i] > stochD[i] && stochK[i - 1] <= stochD[i - 1];
  const stochCrossDown = stochK[i] < stochD[i] && stochK[i - 1] >= stochD[i - 1];

  let signal: OKXSignal = 'hold';
  let confidence = 0;
  const reasons: string[] = [];

  // Long signal
  if (trendUp && (emaCrossUp || (stochOversold && stochCrossUp))) {
    signal = 'long';
    confidence = 70;
    if (trendUp) { confidence += 10; reasons.push('Trend bullish (EMA5/10 > EMA50)'); }
    if (emaCrossUp) { confidence += 10; reasons.push('EMA5 cross up EMA10'); }
    if (stochOversold) { confidence += 5; reasons.push('StochRSI oversold'); }
    if (stochCrossUp) { confidence += 5; reasons.push('StochRSI cross up'); }
  }
  // Short signal
  else if (trendDown && (emaCrossDown || (stochOverbought && stochCrossDown))) {
    signal = 'short';
    confidence = 70;
    if (trendDown) { confidence += 10; reasons.push('Trend bearish (EMA5/10 < EMA50)'); }
    if (emaCrossDown) { confidence += 10; reasons.push('EMA5 cross down EMA10'); }
    if (stochOverbought) { confidence += 5; reasons.push('StochRSI overbought'); }
    if (stochCrossDown) { confidence += 5; reasons.push('StochRSI cross down'); }
  }
  // Close signals
  else if (stochOverbought && stochCrossDown) {
    signal = 'close_long';
    confidence = 60;
    reasons.push('StochRSI overbought crossdown - tutup Long');
  }
  else if (stochOversold && stochCrossUp) {
    signal = 'close_short';
    confidence = 60;
    reasons.push('StochRSI oversold crossup - tutup Short');
  }

  const slMultiplier = 1.5;
  const tpMultiplier = 2.5;
  const stopLoss = signal === 'long' ? last - currentATR * slMultiplier :
                   signal === 'short' ? last + currentATR * slMultiplier : 0;
  const takeProfit = signal === 'long' ? last + currentATR * tpMultiplier :
                     signal === 'short' ? last - currentATR * tpMultiplier : 0;

  const volatilityPct = (currentATR / last) * 100;
  const suggestedLeverage = volatilityPct > 2 ? 20 : volatilityPct > 1 ? 50 : 75;

  return { signal, confidence: Math.min(confidence, 100), reasons, stopLoss, takeProfit, suggestedLeverage };
}

// ─── Strategy 2: Smart Money Concept ─────────────────────────

function smartMoneyStrategy(candles: OKXCandle[]): OKXStrategyResult {
  if (candles.length < 30) return { signal: 'hold', confidence: 0, reasons: ['Data tidak cukup'], stopLoss: 0, takeProfit: 0, suggestedLeverage: 20 };

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const last = closes[closes.length - 1];
  const atrVals = atr(candles);
  const currentATR = atrVals[atrVals.length - 1];

  // Find swing highs and lows (last 20 candles)
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < Math.min(candles.length, 22); i++) {
    const idx = candles.length - 1 - i;
    if (idx < 1 || idx >= candles.length - 1) continue;
    if (highs[idx] > highs[idx - 1] && highs[idx] > highs[idx + 1]) swingHighs.push(highs[idx]);
    if (lows[idx] < lows[idx - 1] && lows[idx] < lows[idx + 1]) swingLows.push(lows[idx]);
  }

  // Detect order blocks (large candles with imbalance)
  const orderBlocks: { type: 'bullish' | 'bearish'; price: number }[] = [];
  for (let i = candles.length - 10; i < candles.length - 1; i++) {
    if (i < 0) continue;
    const bodySize = Math.abs(candles[i].close - candles[i].open);
    const avgBody = closes.slice(Math.max(0, i - 10), i).reduce((s, _, j, arr) => {
      const ci = candles[Math.max(0, i - 10) + j];
      return s + Math.abs(ci.close - ci.open);
    }, 0) / 10;
    if (bodySize > avgBody * 2) {
      orderBlocks.push({
        type: candles[i].close > candles[i].open ? 'bullish' : 'bearish',
        price: candles[i].close > candles[i].open ? candles[i].low : candles[i].high,
      });
    }
  }

  // Detect Fair Value Gaps (FVG)
  const fvgs: { type: 'bullish' | 'bearish'; top: number; bottom: number }[] = [];
  for (let i = candles.length - 10; i < candles.length - 1; i++) {
    if (i < 2) continue;
    if (lows[i] > highs[i - 2]) fvgs.push({ type: 'bullish', top: lows[i], bottom: highs[i - 2] });
    if (highs[i] < lows[i - 2]) fvgs.push({ type: 'bearish', top: lows[i - 2], bottom: highs[i] });
  }

  // Liquidity sweep detection
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const sweptHigh = last > recentHigh && closes[closes.length - 1] < closes[closes.length - 2];
  const sweptLow = last < recentLow && closes[closes.length - 1] > closes[closes.length - 2];

  let signal: OKXSignal = 'hold';
  let confidence = 0;
  const reasons: string[] = [];

  // Bullish SMC: liquidity sweep low + bullish OB + bullish FVG
  const bullishOB = orderBlocks.find(ob => ob.type === 'bullish' && last >= ob.price * 0.998);
  const bullishFVG = fvgs.find(f => f.type === 'bullish' && last >= f.bottom && last <= f.top);

  if (sweptLow || bullishOB || bullishFVG) {
    let score = 0;
    if (sweptLow) { score += 35; reasons.push('Liquidity sweep di bawah (bearish trap)'); }
    if (bullishOB) { score += 30; reasons.push('Harga di area Bullish Order Block'); }
    if (bullishFVG) { score += 25; reasons.push('Harga mengisi Bullish FVG'); }
    if (score >= 55) { signal = 'long'; confidence = score; }
  }

  // Bearish SMC
  const bearishOB = orderBlocks.find(ob => ob.type === 'bearish' && last <= ob.price * 1.002);
  const bearishFVG = fvgs.find(f => f.type === 'bearish' && last <= f.top && last >= f.bottom);

  if (signal === 'hold' && (sweptHigh || bearishOB || bearishFVG)) {
    let score = 0;
    if (sweptHigh) { score += 35; reasons.push('Liquidity sweep di atas (bullish trap)'); }
    if (bearishOB) { score += 30; reasons.push('Harga di area Bearish Order Block'); }
    if (bearishFVG) { score += 25; reasons.push('Harga mengisi Bearish FVG'); }
    if (score >= 55) { signal = 'short'; confidence = score; }
  }

  const slMult = 2;
  const tpMult = 3;
  const stopLoss = signal === 'long' ? last - currentATR * slMult :
                   signal === 'short' ? last + currentATR * slMult : 0;
  const takeProfit = signal === 'long' ? last + currentATR * tpMult :
                     signal === 'short' ? last - currentATR * tpMult : 0;

  const volatilityPct = (currentATR / last) * 100;
  const suggestedLeverage = volatilityPct > 2 ? 20 : volatilityPct > 1 ? 40 : 60;

  return { signal, confidence: Math.min(confidence, 100), reasons, stopLoss, takeProfit, suggestedLeverage };
}

// ─── Strategy 3: Multi-Indicator Scoring ─────────────────────

function multiIndicatorStrategy(candles: OKXCandle[]): OKXStrategyResult {
  if (candles.length < 30) return { signal: 'hold', confidence: 0, reasons: ['Data tidak cukup'], stopLoss: 0, takeProfit: 0, suggestedLeverage: 20 };

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const last = closes[closes.length - 1];
  const i = closes.length - 1;
  const atrVals = atr(candles);
  const currentATR = atrVals[atrVals.length - 1];

  // Indicators
  const rsiVals = rsi(closes, 14);
  const { macdLine, signalLine, histogram } = macd(closes);
  const { upper, lower } = bollingerBands(closes);
  const ema20 = ema(closes, 20);
  const sma50 = sma(closes, 50);
  const avgVol = sma(volumes, 20);

  let bullScore = 0;
  let bearScore = 0;
  const reasons: string[] = [];

  // RSI
  if (rsiVals[i] < 35) { bullScore += 20; reasons.push(`RSI oversold (${rsiVals[i].toFixed(1)})`); }
  else if (rsiVals[i] > 65) { bearScore += 20; reasons.push(`RSI overbought (${rsiVals[i].toFixed(1)})`); }

  // MACD
  if (histogram[i] > 0 && histogram[i - 1] <= 0) { bullScore += 25; reasons.push('MACD histogram cross bullish'); }
  else if (histogram[i] < 0 && histogram[i - 1] >= 0) { bearScore += 25; reasons.push('MACD histogram cross bearish'); }
  else if (macdLine[i] > signalLine[i]) { bullScore += 10; reasons.push('MACD di atas signal'); }
  else if (macdLine[i] < signalLine[i]) { bearScore += 10; reasons.push('MACD di bawah signal'); }

  // Bollinger Bands
  if (!isNaN(lower[i]) && last <= lower[i]) { bullScore += 20; reasons.push('Harga di lower Bollinger Band'); }
  else if (!isNaN(upper[i]) && last >= upper[i]) { bearScore += 20; reasons.push('Harga di upper Bollinger Band'); }

  // EMA20 trend
  if (last > ema20[i]) { bullScore += 10; reasons.push('Harga di atas EMA20'); }
  else { bearScore += 10; reasons.push('Harga di bawah EMA20'); }

  // SMA50 trend
  if (!isNaN(sma50[i]) && last > sma50[i]) { bullScore += 10; reasons.push('Harga di atas SMA50'); }
  else if (!isNaN(sma50[i])) { bearScore += 10; reasons.push('Harga di bawah SMA50'); }

  // Volume confirmation
  if (!isNaN(avgVol[i]) && volumes[i] > avgVol[i] * 1.5) {
    const boost = 15;
    if (closes[i] > closes[i - 1]) { bullScore += boost; reasons.push('Volume spike bullish'); }
    else { bearScore += boost; reasons.push('Volume spike bearish'); }
  }

  let signal: OKXSignal = 'hold';
  let confidence = 0;

  if (bullScore >= 55 && bullScore > bearScore + 15) {
    signal = 'long';
    confidence = Math.min(bullScore, 100);
  } else if (bearScore >= 55 && bearScore > bullScore + 15) {
    signal = 'short';
    confidence = Math.min(bearScore, 100);
  }

  const slMult = 1.8;
  const tpMult = 2.5;
  const stopLoss = signal === 'long' ? last - currentATR * slMult :
                   signal === 'short' ? last + currentATR * slMult : 0;
  const takeProfit = signal === 'long' ? last + currentATR * tpMult :
                     signal === 'short' ? last - currentATR * tpMult : 0;

  const volatilityPct = (currentATR / last) * 100;
  const suggestedLeverage = volatilityPct > 2 ? 20 : volatilityPct > 1 ? 50 : 75;

  return { signal, confidence: Math.min(confidence, 100), reasons, stopLoss, takeProfit, suggestedLeverage };
}

// ─── Exports ─────────────────────────────────────────────────

export const OKX_STRATEGIES: Record<StrategyId, { name: string; description: string; run: (candles: OKXCandle[]) => OKXStrategyResult }> = {
  'trend-scalping': {
    name: 'Trend Following + Scalping',
    description: 'EMA crossover untuk tren, StochRSI untuk scalping. Cocok untuk leverage tinggi.',
    run: trendScalpingStrategy,
  },
  'smart-money': {
    name: 'Smart Money Concept',
    description: 'Order block, FVG, liquidity sweep. Cocok untuk futures dengan SL ketat.',
    run: smartMoneyStrategy,
  },
  'multi-indicator': {
    name: 'Multi-Indicator Scoring',
    description: 'Sistem skor dari RSI, MACD, Bollinger, Volume. Sinyal lebih akurat.',
    run: multiIndicatorStrategy,
  },
};

export function runStrategy(id: StrategyId, candles: OKXCandle[]): OKXStrategyResult {
  return OKX_STRATEGIES[id].run(candles);
}

export function runAllStrategies(candles: OKXCandle[]): Record<StrategyId, OKXStrategyResult> {
  return {
    'trend-scalping': trendScalpingStrategy(candles),
    'smart-money': smartMoneyStrategy(candles),
    'multi-indicator': multiIndicatorStrategy(candles),
  };
}
