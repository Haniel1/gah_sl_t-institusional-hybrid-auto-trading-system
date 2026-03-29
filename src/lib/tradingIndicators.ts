// ============================================================
// Trading Indicators Utility — Math functions & GainzAlgo Clone
// ============================================================

// --- Types ---
export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';
export type GainzVersion = 'Standard' | 'Pro' | 'V2_Essential' | 'V2_Proficient' | 'V2_Alpha';

export interface AlgoResult {
  signal: SignalType;
  version: string;
  confidenceScore?: number;
}

export interface GainzSignalMarker {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  version: string;
  confidenceScore?: number;
}

// ============================================================
// 1. Simple Moving Average (SMA) — returns single value
// ============================================================
export const calculateSMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

// SMA array (full series)
export const calculateSMAArray = (prices: number[], period: number): number[] => {
  const result: number[] = new Array(prices.length).fill(0);
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result[i] = prices[i]; continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    result[i] = sum / period;
  }
  return result;
};

// ============================================================
// 2. Exponential Moving Average (EMA)
// ============================================================
export const calculateEMA = (prices: number[], period: number): number => {
  if (prices.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }
  return ema;
};

// EMA array (full series)
export const calculateEMAArray = (prices: number[], period: number): number[] => {
  const result: number[] = new Array(prices.length).fill(0);
  const mult = 2 / (period + 1);
  result[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    result[i] = (prices[i] - result[i - 1]) * mult + result[i - 1];
  }
  return result;
};

// ============================================================
// 3. Relative Strength Index (RSI)
// ============================================================
export const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length <= period) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

// RSI array (full series, Wilder's smoothing)
export const calculateRSIArray = (prices: number[], period: number = 14): number[] => {
  const result: number[] = new Array(prices.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
};

// ============================================================
// 4. MACD
// ============================================================
export const calculateMACD = (prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  const emaFast = calculateEMAArray(prices, fastPeriod);
  const emaSlow = calculateEMAArray(prices, slowPeriod);
  const macdLine = emaFast.map((f, i) => f - emaSlow[i]);
  const signalLine = calculateEMAArray(macdLine, signalPeriod);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  
  return {
    line: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1],
    lineArray: macdLine,
    signalArray: signalLine,
    histogramArray: histogram,
  };
};

// ============================================================
// 5. Bollinger Bands
// ============================================================
export const calculateBollingerBands = (prices: number[], period: number = 20, multiplier: number = 2) => {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };
  
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const squaredDiffs = slice.map(price => Math.pow(price - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: middle + (stdDev * multiplier),
    middle,
    lower: middle - (stdDev * multiplier),
  };
};

// BB arrays (full series)
export const calculateBBArrays = (prices: number[], period: number = 20, multiplier: number = 2) => {
  const upper: number[] = new Array(prices.length).fill(0);
  const middle: number[] = new Array(prices.length).fill(0);
  const lower: number[] = new Array(prices.length).fill(0);
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = avg + stdDev * multiplier;
    middle[i] = avg;
    lower[i] = avg - stdDev * multiplier;
  }
  
  return { upper, middle, lower };
};

// ============================================================
// 6. Stochastic RSI
// ============================================================
export const calculateStochRSI = (prices: number[], period: number = 14) => {
  if (prices.length <= period) return { K: 50, D: 50 };
  
  const rsiHistory: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    const subset = prices.slice(0, i + 1);
    rsiHistory.push(calculateRSI(subset, period));
  }
  
  const currentRSI = rsiHistory[rsiHistory.length - 1];
  const recentRSI = rsiHistory.slice(-period);
  const minRSI = Math.min(...recentRSI);
  const maxRSI = Math.max(...recentRSI);
  
  let stochK = 50;
  if (maxRSI !== minRSI) {
    stochK = ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100;
  }
  
  // Simple %D as SMA(3) of %K — approximated as same value for single point
  return { K: stochK, D: stochK };
};

// Stoch RSI arrays (full series)
export const calculateStochRSIArrays = (prices: number[], rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) => {
  const rsiVals = calculateRSIArray(prices, rsiPeriod);
  const kRaw: number[] = new Array(prices.length).fill(50);
  
  for (let i = stochPeriod - 1; i < prices.length; i++) {
    const window = rsiVals.slice(i - stochPeriod + 1, i + 1);
    const minR = Math.min(...window);
    const maxR = Math.max(...window);
    kRaw[i] = maxR !== minR ? ((rsiVals[i] - minR) / (maxR - minR)) * 100 : 50;
  }
  
  const K = calculateSMAArray(kRaw, smoothK);
  const D = calculateSMAArray(K, smoothD);
  
  return { K, D };
};

// ============================================================
// 7. ATR (Average True Range)
// ============================================================
export const calculateATRArray = (highs: number[], lows: number[], closes: number[], period: number = 14): number[] => {
  const result: number[] = new Array(highs.length).fill(0);
  for (let i = 0; i < highs.length; i++) {
    const tr = i === 0
      ? highs[i] - lows[i]
      : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    if (i < period) {
      result[i] = tr;
    } else if (i === period) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += result[j];
      result[i] = (sum + tr) / (period + 1);
    } else {
      result[i] = (result[i - 1] * (period - 1) + tr) / period;
    }
  }
  return result;
};

// ============================================================
// GainzAlgo Clone — 5 versions
// ============================================================
export const calculateGainzClone = (
  prices: number[],
  highs: number[],
  lows: number[],
  version: GainzVersion
): AlgoResult => {
  if (prices.length < 2) return { signal: 'NEUTRAL', version };
  
  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  
  switch (version) {
    // ---------------------------------------------------------
    // 1. STANDARD (Structured Multi-Filter Logic)
    // EMA 50 (Trend) + RSI 14 (Momentum) + ATR (Volatility)
    // ---------------------------------------------------------
    case 'Standard': {
      const ema50 = calculateEMA(prices, 50);
      const rsi14 = calculateRSI(prices, 14);
      
      if (currentPrice > ema50 && rsi14 > 50 && rsi14 < 70) {
        return { signal: 'BUY', version: 'Standard' };
      } else if (currentPrice < ema50 && rsi14 < 50 && rsi14 > 30) {
        return { signal: 'SELL', version: 'Standard' };
      }
      return { signal: 'NEUTRAL', version: 'Standard' };
    }

    // ---------------------------------------------------------
    // 2. PRO (Multi-Layer Confidence-Scoring Engine)
    // Sistem skor. Sinyal muncul jika skor melampaui batas.
    // ---------------------------------------------------------
    case 'Pro': {
      let score = 0;
      const ema20 = calculateEMA(prices, 20);
      const rsiPro = calculateRSI(prices, 14);
      const macd = calculateMACD(prices);

      if (currentPrice > ema20) score += 2;
      if (rsiPro > 40 && rsiPro < 60) score += 1;
      if (macd.line > macd.signal) score += 2;

      if (currentPrice < ema20) score -= 2;
      if (rsiPro < 60 && rsiPro > 40) score -= 1;
      if (macd.line < macd.signal) score -= 2;

      if (score >= 4) return { signal: 'BUY', version: 'Pro', confidenceScore: score };
      if (score <= -4) return { signal: 'SELL', version: 'Pro', confidenceScore: score };
      return { signal: 'NEUTRAL', version: 'Pro', confidenceScore: score };
    }

    // ---------------------------------------------------------
    // 3. V2 ESSENTIAL (Expanded Structural Evaluation Model)
    // Macro-level, minim noise. SMA 200 & SMA 50
    // ---------------------------------------------------------
    case 'V2_Essential': {
      const sma200 = calculateSMA(prices, 200);
      const sma50 = calculateSMA(prices, 50);

      if (sma50 > sma200 && currentPrice > sma50) {
        return { signal: 'BUY', version: 'V2_Essential' };
      } else if (sma50 < sma200 && currentPrice < sma50) {
        return { signal: 'SELL', version: 'V2_Essential' };
      }
      return { signal: 'NEUTRAL', version: 'V2_Essential' };
    }

    // ---------------------------------------------------------
    // 4. V2 PROFICIENT (Balanced Adaptive Filtering Framework)
    // Bollinger Bands + EMA 9 crossover
    // ---------------------------------------------------------
    case 'V2_Proficient': {
      const bb = calculateBollingerBands(prices, 20, 2);
      const ema9 = calculateEMA(prices, 9);

      if (prevPrice <= bb.lower && currentPrice > ema9) {
        return { signal: 'BUY', version: 'V2_Proficient' };
      } else if (prevPrice >= bb.upper && currentPrice < ema9) {
        return { signal: 'SELL', version: 'V2_Proficient' };
      }
      return { signal: 'NEUTRAL', version: 'V2_Proficient' };
    }

    // ---------------------------------------------------------
    // 5. V2 ALPHA (Multi-Phase Micro-Cycle Evaluation Model)
    // Fast EMA (5 & 10) + Stochastic RSI
    // ---------------------------------------------------------
    case 'V2_Alpha': {
      const ema5 = calculateEMA(prices, 5);
      const ema10 = calculateEMA(prices, 10);
      const stochRSI = calculateStochRSI(prices, 14);

      if (ema5 > ema10 && stochRSI.K > stochRSI.D && stochRSI.K < 80) {
        return { signal: 'BUY', version: 'V2_Alpha' };
      } else if (ema5 < ema10 && stochRSI.K < stochRSI.D && stochRSI.K > 20) {
        return { signal: 'SELL', version: 'V2_Alpha' };
      }
      return { signal: 'NEUTRAL', version: 'V2_Alpha' };
    }

    default:
      return { signal: 'NEUTRAL', version: 'Unknown' };
  }
};

// ============================================================
// GainzAlgo Clone — Generate signal markers for chart (full series)
// Runs the selected version on a sliding window to produce markers
// ============================================================
export const calculateGainzCloneSignals = (
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[],
  version: GainzVersion,
  windowSize = 200
): GainzSignalMarker[] => {
  const signals: GainzSignalMarker[] = [];
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  const minWindow = version === 'V2_Essential' ? 201 : version === 'Standard' ? 51 : 30;
  
  let prevSignal: SignalType = 'NEUTRAL';
  
  for (let i = minWindow; i < candles.length; i++) {
    const windowStart = Math.max(0, i - windowSize);
    const priceSlice = closes.slice(windowStart, i + 1);
    const highSlice = highs.slice(windowStart, i + 1);
    const lowSlice = lows.slice(windowStart, i + 1);
    
    const result = calculateGainzClone(priceSlice, highSlice, lowSlice, version);
    
    // Only emit signal on state change (prevents flooding)
    if (result.signal !== 'NEUTRAL' && result.signal !== prevSignal) {
      signals.push({
        index: i,
        time: candles[i].time,
        type: result.signal === 'BUY' ? 'buy' : 'sell',
        price: closes[i],
        version: result.version,
        confidenceScore: result.confidenceScore,
      });
    }
    
    if (result.signal !== 'NEUTRAL') {
      prevSignal = result.signal;
    }
  }
  
  return signals;
};

// ============================================================
// Version metadata for UI display
// ============================================================
export const GAINZ_VERSIONS: { id: GainzVersion; name: string; desc: string; style: string }[] = [
  { id: 'Standard', name: 'Standard', desc: 'EMA 50 + RSI 14 — Filter berlapis', style: 'text-blue-400' },
  { id: 'Pro', name: 'Pro', desc: 'Skor multi-indikator (MACD + EMA + RSI)', style: 'text-yellow-400' },
  { id: 'V2_Essential', name: 'V2 Essential', desc: 'SMA 200/50 Golden Cross — Macro', style: 'text-green-400' },
  { id: 'V2_Proficient', name: 'V2 Proficient', desc: 'Bollinger Bands + EMA 9 — Intraday', style: 'text-purple-400' },
  { id: 'V2_Alpha', name: 'V2 Alpha', desc: 'Fast EMA + Stoch RSI — Scalping', style: 'text-red-400' },
];
