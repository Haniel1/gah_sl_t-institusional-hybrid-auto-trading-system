import type { CandleData } from '@/hooks/useIndodax';

/**
 * Strategy 2: POI - Fair Value Gap & Order Block
 * - FVG: gap between wick of candle 1 and wick of candle 3 in a 3-candle formation
 * - Order Block: last opposing candle before an impulsive move with significant volume
 */

export interface POISignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  poiType: 'fvg' | 'order_block';
  zoneHigh: number;
  zoneLow: number;
}

export interface FVGZone {
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
}

export interface OrderBlockZone {
  time: number;
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
}

export function detectFVGs(candles: CandleData[]): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    // Bullish FVG: gap up - candle 3 low > candle 1 high
    if (c3.low > c1.high) {
      zones.push({
        startTime: c1.time,
        endTime: c3.time,
        high: c3.low,
        low: c1.high,
        type: 'bullish',
      });
    }
    // Bearish FVG: gap down - candle 3 high < candle 1 low
    else if (c3.high < c1.low) {
      zones.push({
        startTime: c1.time,
        endTime: c3.time,
        high: c1.low,
        low: c3.high,
        type: 'bearish',
      });
    }
  }
  return zones;
}

export function detectOrderBlocks(candles: CandleData[]): OrderBlockZone[] {
  const zones: OrderBlockZone[] = [];
  const avgVolume = candles.reduce((s, c) => s + c.volume, 0) / candles.length;

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    const impulsiveMove = Math.abs(next.close - next.open);
    const avgBody = Math.abs(curr.close - curr.open);
    const isImpulsive = impulsiveMove > avgBody * 2 && next.volume > avgVolume * 1.3;

    if (!isImpulsive) continue;

    // Bullish OB: bearish candle before bullish impulse
    if (curr.close < curr.open && next.close > next.open) {
      zones.push({ time: curr.time, high: curr.open, low: curr.close, type: 'bullish' });
    }
    // Bearish OB: bullish candle before bearish impulse
    else if (curr.close > curr.open && next.close < next.open) {
      zones.push({ time: curr.time, high: curr.close, low: curr.open, type: 'bearish' });
    }
  }
  return zones;
}

export function calculatePOIStrategy(candles: CandleData[]): POISignal[] {
  if (candles.length < 10) return [];

  const fvgs = detectFVGs(candles);
  const obs = detectOrderBlocks(candles);
  const signals: POISignal[] = [];

  // Check if price returns to fill an FVG or test an OB
  for (let i = 5; i < candles.length; i++) {
    const c = candles[i];

    // Check FVG fills
    for (const fvg of fvgs) {
      if (c.time <= fvg.endTime) continue; // FVG must be in the past
      
      // Bullish FVG: price dips into the gap = buy opportunity
      if (fvg.type === 'bullish' && c.low <= fvg.high && c.low >= fvg.low && c.close > fvg.high) {
        signals.push({
          index: i, time: c.time, type: 'buy', price: c.close,
          poiType: 'fvg', zoneHigh: fvg.high, zoneLow: fvg.low,
        });
        break;
      }
      // Bearish FVG: price rallies into gap = sell opportunity
      if (fvg.type === 'bearish' && c.high >= fvg.low && c.high <= fvg.high && c.close < fvg.low) {
        signals.push({
          index: i, time: c.time, type: 'sell', price: c.close,
          poiType: 'fvg', zoneHigh: fvg.high, zoneLow: fvg.low,
        });
        break;
      }
    }

    // Check Order Block tests
    for (const ob of obs) {
      if (c.time <= ob.time) continue;
      
      if (ob.type === 'bullish' && c.low <= ob.high && c.low >= ob.low && c.close > ob.high && c.close > c.open) {
        signals.push({
          index: i, time: c.time, type: 'buy', price: c.close,
          poiType: 'order_block', zoneHigh: ob.high, zoneLow: ob.low,
        });
        break;
      }
      if (ob.type === 'bearish' && c.high >= ob.low && c.high <= ob.high && c.close < ob.low && c.close < c.open) {
        signals.push({
          index: i, time: c.time, type: 'sell', price: c.close,
          poiType: 'order_block', zoneHigh: ob.high, zoneLow: ob.low,
        });
        break;
      }
    }
  }

  // Deduplicate: max 1 signal per candle
  const seen = new Set<number>();
  return signals.filter(s => {
    if (seen.has(s.index)) return false;
    seen.add(s.index);
    return true;
  });
}
