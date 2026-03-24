import type { CandleData } from '@/hooks/useIndodax';

/**
 * Strategy 3: Balance Area Analysis
 * - Identifies consolidation ranges where buyers/sellers agree on price
 * - Uses volume delta and aggression to detect breakout direction
 * - Trades breakouts with confirmation
 */

export interface BalanceAreaSignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  balanceHigh: number;
  balanceLow: number;
  volumeDelta: number;
  breakoutStrength: number;
}

export interface BalanceZone {
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  startTime: number;
  endTime: number;
}

function findBalanceAreas(candles: CandleData[], minPeriod = 8): BalanceZone[] {
  const zones: BalanceZone[] = [];
  let start = 0;

  while (start < candles.length - minPeriod) {
    const initHigh = candles[start].high;
    const initLow = candles[start].low;
    const initRange = initHigh - initLow;
    if (initRange <= 0) { start++; continue; }

    let rangeHigh = initHigh;
    let rangeLow = initLow;
    let end = start + 1;

    // Extend the range while candles stay within tolerance (1.5x initial range)
    const tolerance = initRange * 1.5;
    while (end < candles.length) {
      const c = candles[end];
      const newHigh = Math.max(rangeHigh, c.high);
      const newLow = Math.min(rangeLow, c.low);
      if (newHigh - newLow > tolerance) break;
      rangeHigh = newHigh;
      rangeLow = newLow;
      end++;
    }

    const length = end - start;
    if (length >= minPeriod) {
      zones.push({
        startIndex: start, endIndex: end - 1,
        high: rangeHigh, low: rangeLow,
        startTime: candles[start].time, endTime: candles[end - 1].time,
      });
      start = end; // skip past this zone
    } else {
      start++;
    }
  }

  return zones;
}

export function calculateBalanceArea(candles: CandleData[]): BalanceAreaSignal[] {
  if (candles.length < 15) return [];

  const zones = findBalanceAreas(candles, 6);
  const signals: BalanceAreaSignal[] = [];

  for (const zone of zones) {
    // Look at candles after the balance area for breakouts
    for (let i = zone.endIndex + 1; i < Math.min(zone.endIndex + 6, candles.length); i++) {
      const c = candles[i];
      
      // Calculate volume delta for confirmation
      const delta = c.close > c.open ? c.volume : -c.volume;
      const avgVol = candles.slice(Math.max(0, i - 10), i).reduce((s, x) => s + x.volume, 0) / 10;
      const strength = Math.abs(delta) / (avgVol || 1);

      // Bullish breakout: close above balance high with positive delta
      if (c.close > zone.high && c.close > c.open && delta > 0 && strength > 0.8) {
        signals.push({
          index: i, time: c.time, type: 'buy', price: c.close,
          balanceHigh: zone.high, balanceLow: zone.low,
          volumeDelta: delta, breakoutStrength: strength,
        });
        break;
      }
      // Bearish breakout: close below balance low with negative delta
      if (c.close < zone.low && c.close < c.open && delta < 0 && strength > 0.8) {
        signals.push({
          index: i, time: c.time, type: 'sell', price: c.close,
          balanceHigh: zone.high, balanceLow: zone.low,
          volumeDelta: delta, breakoutStrength: strength,
        });
        break;
      }
    }
  }

  return signals;
}

export { findBalanceAreas };
