import type { CandleData } from '@/hooks/useIndodax';

/**
 * Darvas Box Theory (Nicolas Darvas)
 * - Identifies consolidation boxes where price trades within a range
 * - Box valid when price touches top/bottom multiple times without breaking
 * - BUY signal on breakout above box top with significant volume
 * - SELL signal on breakdown below box bottom with significant volume
 * - Stop loss just below the broken box top (for buys)
 */

export interface DarvasBox {
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  startTime: number;
  endTime: number;
  touchesTop: number;
  touchesBottom: number;
}

export interface DarvasSignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  boxTop: number;
  boxBottom: number;
  volumeRatio: number;
  stopLoss: number;
}

/**
 * Find Darvas Boxes: consolidation ranges where price bounces between top/bottom
 */
export function findDarvasBoxes(candles: CandleData[], minPeriod = 6, tolerance = 0.005): DarvasBox[] {
  const boxes: DarvasBox[] = [];
  if (candles.length < minPeriod) return boxes;

  let i = 0;
  while (i < candles.length - minPeriod) {
    // Find a local high as potential box top
    let boxTop = candles[i].high;
    let boxBottom = candles[i].low;

    // Look ahead to establish the box range within first few candles
    for (let j = i; j < Math.min(i + 3, candles.length); j++) {
      boxTop = Math.max(boxTop, candles[j].high);
      boxBottom = Math.min(boxBottom, candles[j].low);
    }

    const range = boxTop - boxBottom;
    if (range <= 0) { i++; continue; }

    // Extend box while candles stay within tolerance
    let end = i + 3;
    let touchesTop = 0;
    let touchesBottom = 0;
    const topTolerance = boxTop * tolerance;
    const bottomTolerance = boxBottom * tolerance;

    while (end < candles.length) {
      const c = candles[end];
      // Check if candle breaks out of box
      if (c.close > boxTop + topTolerance || c.close < boxBottom - bottomTolerance) break;

      // Count touches near top/bottom
      if (Math.abs(c.high - boxTop) <= topTolerance) touchesTop++;
      if (Math.abs(c.low - boxBottom) <= bottomTolerance) touchesBottom++;

      end++;
    }

    const length = end - i;
    // Valid box: minimum period and at least 1 touch on each side
    if (length >= minPeriod && touchesTop >= 1 && touchesBottom >= 1) {
      boxes.push({
        startIndex: i,
        endIndex: end - 1,
        top: boxTop,
        bottom: boxBottom,
        startTime: candles[i].time,
        endTime: candles[end - 1].time,
        touchesTop,
        touchesBottom,
      });
      i = end; // skip past this box
    } else {
      i++;
    }
  }

  return boxes;
}

/**
 * Calculate Darvas Box breakout/breakdown signals
 */
export function calculateDarvasBox(candles: CandleData[]): DarvasSignal[] {
  if (candles.length < 10) return [];

  const boxes = findDarvasBoxes(candles, 5, 0.004);
  const signals: DarvasSignal[] = [];

  for (const box of boxes) {
    // Look at candles after the box for breakouts
    const lookAhead = Math.min(box.endIndex + 8, candles.length);
    const avgVol = candles
      .slice(box.startIndex, box.endIndex + 1)
      .reduce((s, c) => s + c.volume, 0) / (box.endIndex - box.startIndex + 1);

    for (let j = box.endIndex + 1; j < lookAhead; j++) {
      const c = candles[j];
      const volRatio = avgVol > 0 ? c.volume / avgVol : 0;

      // Bullish breakout: close above box top + volume confirmation
      if (c.close > box.top && c.close > c.open && volRatio > 1.2) {
        signals.push({
          index: j,
          time: c.time,
          type: 'buy',
          price: c.close,
          boxTop: box.top,
          boxBottom: box.bottom,
          volumeRatio: volRatio,
          stopLoss: box.top - (box.top - box.bottom) * 0.1, // SL just below box top
        });
        break; // one signal per box
      }

      // Bearish breakdown: close below box bottom + volume confirmation
      if (c.close < box.bottom && c.close < c.open && volRatio > 1.2) {
        signals.push({
          index: j,
          time: c.time,
          type: 'sell',
          price: c.close,
          boxTop: box.top,
          boxBottom: box.bottom,
          volumeRatio: volRatio,
          stopLoss: box.bottom + (box.top - box.bottom) * 0.1, // SL just above box bottom
        });
        break;
      }
    }
  }

  return signals;
}
