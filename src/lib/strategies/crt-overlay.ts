import type { CandleData } from '@/hooks/useIndodax';

/**
 * Strategy 1: CRT Overlay (4-Hour Candle Sweep)
 * - Marks High/Low of previous 4H candle as reference
 * - BUY: price sweeps below Low then reverses up
 * - SELL: price sweeps above High then reverses down
 */

export interface CRTSignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  crtHigh: number;
  crtLow: number;
  tp: number;
  sl: number;
}

export function calculateCRTOverlay(candles: CandleData[]): CRTSignal[] {
  if (candles.length < 10) return [];

  const signals: CRTSignal[] = [];

  // Group candles into 4H blocks (4 x 1h candles or use direct if already 4h)
  // We'll use a rolling window of previous candles to define CRT range
  const lookback = 4; // previous N candles define the CRT range

  for (let i = lookback + 1; i < candles.length; i++) {
    // CRT range from previous lookback candles
    let crtHigh = -Infinity;
    let crtLow = Infinity;
    for (let j = i - lookback; j < i; j++) {
      crtHigh = Math.max(crtHigh, candles[j].high);
      crtLow = Math.min(crtLow, candles[j].low);
    }

    const curr = candles[i];
    const prev = candles[i - 1];
    const range = crtHigh - crtLow;
    if (range <= 0) continue;

    // SELL: price sweeps above CRT High then closes back below it (rejection)
    if (curr.high > crtHigh && curr.close < crtHigh && curr.close < curr.open) {
      // Bearish reversal after sweep
      const sl = curr.high + range * 0.2;
      const tp = crtLow; // target opposite side of CRT range
      signals.push({
        index: i, time: curr.time, type: 'sell', price: curr.close,
        crtHigh, crtLow, tp, sl,
      });
    }
    // BUY: price sweeps below CRT Low then closes back above it (rejection)
    else if (curr.low < crtLow && curr.close > crtLow && curr.close > curr.open) {
      // Bullish reversal after sweep
      const sl = curr.low - range * 0.2;
      const tp = crtHigh; // target opposite side
      signals.push({
        index: i, time: curr.time, type: 'buy', price: curr.close,
        crtHigh, crtLow, tp, sl,
      });
    }
  }

  return signals;
}
