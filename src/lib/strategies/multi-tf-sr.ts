import type { CandleData } from '@/hooks/useIndodax';

/**
 * Strategy 4: Multi-Timeframe Support & Resistance
 * - Identifies key S/R levels from higher timeframe (using candle grouping)
 * - Checks structure (BOS) on medium timeframe
 * - Enters on rejection at S/R on lower timeframe
 * - Partial TP at ~150 pips equivalent, then move SL to BE
 */

export interface MultiTFSignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  keyLevel: number;
  levelType: 'support' | 'resistance';
  sl: number;
  tp1: number;
  tp2: number;
  bosConfirmed: boolean;
}

export interface KeyLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // how many touches
}

function findKeyLevels(candles: CandleData[], numBins = 30): KeyLevel[] {
  if (candles.length < 5) return [];

  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const step = (max - min) / numBins;
  if (step <= 0) return [];

  // Count touches at price bins
  const bins = new Map<number, { touches: number; isSupport: number; isResistance: number }>();

  for (const c of candles) {
    const lowBin = Math.round((c.low - min) / step) * step + min;
    const highBin = Math.round((c.high - min) / step) * step + min;

    const lb = bins.get(lowBin) || { touches: 0, isSupport: 0, isResistance: 0 };
    lb.touches++;
    lb.isSupport++;
    bins.set(lowBin, lb);

    const hb = bins.get(highBin) || { touches: 0, isSupport: 0, isResistance: 0 };
    hb.touches++;
    hb.isResistance++;
    bins.set(highBin, hb);
  }

  const levels: KeyLevel[] = [];
  for (const [price, data] of bins) {
    if (data.touches >= 3) {
      levels.push({
        price,
        type: data.isSupport > data.isResistance ? 'support' : 'resistance',
        strength: data.touches,
      });
    }
  }

  // Sort by strength, keep top levels
  levels.sort((a, b) => b.strength - a.strength);
  return levels.slice(0, 8);
}

function detectBOS(candles: CandleData[], lookback = 20): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < lookback) return 'neutral';

  const recent = candles.slice(-lookback);
  let swingHighs = 0;
  let swingLows = 0;

  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      swingHighs++;
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      swingLows++;
    }
  }

  // Check if recent price broke above previous swing high (bullish BOS)
  const lastClose = recent[recent.length - 1].close;
  const midPoint = (Math.max(...recent.map(c => c.high)) + Math.min(...recent.map(c => c.low))) / 2;

  if (lastClose > midPoint && swingHighs > 0) return 'bullish';
  if (lastClose < midPoint && swingLows > 0) return 'bearish';
  return 'neutral';
}

export function calculateMultiTFSR(candles: CandleData[]): MultiTFSignal[] {
  if (candles.length < 30) return [];

  // Simulate higher TF by grouping candles (4x aggregation for "daily" from H1)
  const htfCandles: CandleData[] = [];
  for (let i = 0; i < candles.length - 3; i += 4) {
    const group = candles.slice(i, i + 4);
    htfCandles.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }

  const keyLevels = findKeyLevels(htfCandles);
  const bos = detectBOS(candles, 20);
  const signals: MultiTFSignal[] = [];

  const atr = calculateATR(candles, 14);
  const proximity = atr[atr.length - 1] * 0.5 || candles[candles.length - 1].close * 0.005;

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];
    const currentATR = atr[i] || proximity;

    for (const level of keyLevels) {
      const dist = Math.abs(c.close - level.price);
      if (dist > currentATR * 1.5) continue;

      // BUY: at support level with bullish BOS + rejection candle
      if (level.type === 'support' && c.low <= level.price + currentATR * 0.3 &&
          c.close > level.price && c.close > c.open && bos !== 'bearish') {
        const sl = level.price - currentATR * 1.2;
        const risk = c.close - sl;
        signals.push({
          index: i, time: c.time, type: 'buy', price: c.close,
          keyLevel: level.price, levelType: 'support',
          sl, tp1: c.close + risk * 1.5, tp2: c.close + risk * 3,
          bosConfirmed: bos === 'bullish',
        });
        break;
      }

      // SELL: at resistance level with bearish BOS + rejection candle
      if (level.type === 'resistance' && c.high >= level.price - currentATR * 0.3 &&
          c.close < level.price && c.close < c.open && bos !== 'bullish') {
        const sl = level.price + currentATR * 1.2;
        const risk = sl - c.close;
        signals.push({
          index: i, time: c.time, type: 'sell', price: c.close,
          keyLevel: level.price, levelType: 'resistance',
          sl, tp1: c.close - risk * 1.5, tp2: c.close - risk * 3,
          bosConfirmed: bos === 'bearish',
        });
        break;
      }
    }
  }

  return signals;
}

function calculateATR(candles: CandleData[], period = 14): number[] {
  const result = new Array(candles.length).fill(0);
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tr[j];
    result[i] = sum / period;
  }
  return result;
}

export { findKeyLevels, detectBOS };
