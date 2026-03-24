import type { CandleData } from '@/hooks/useIndodax';

// ============================================================
// STRATEGY A: Bitcoin Halving Cycle Profit
// ============================================================

const HALVINGS = [
  { date: new Date('2012-11-28'), label: '1st Halving' },
  { date: new Date('2016-07-09'), label: '2nd Halving' },
  { date: new Date('2020-05-11'), label: '3rd Halving' },
  { date: new Date('2024-04-19'), label: '4th Halving' },
];

export interface HalvingZone {
  type: 'profit-start' | 'profit-end' | 'dca';
  startDate: Date;
  endDate: Date;
  label: string;
  color: string;
}

export function getHalvingCycleZones(): HalvingZone[] {
  const zones: HalvingZone[] = [];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (const h of HALVINGS) {
    const base = h.date.getTime();
    zones.push({
      type: 'profit-start',
      startDate: new Date(base + 40 * WEEK_MS),
      endDate: new Date(base + 80 * WEEK_MS),
      label: `Profit START (40w post ${h.label})`,
      color: '#22c55e',
    });
    zones.push({
      type: 'profit-end',
      startDate: new Date(base + 80 * WEEK_MS),
      endDate: new Date(base + 100 * WEEK_MS),
      label: `Profit END (80w post ${h.label})`,
      color: '#ef4444',
    });
    zones.push({
      type: 'dca',
      startDate: new Date(base + 135 * WEEK_MS),
      endDate: new Date(base + 180 * WEEK_MS),
      label: `DCA Zone (135w post ${h.label})`,
      color: '#eab308',
    });
  }
  return zones;
}

export function getCurrentHalvingPhase(): { phase: string; weeksPost: number; color: string } {
  const now = Date.now();
  const lastHalving = HALVINGS[HALVINGS.length - 1];
  const weeksSince = Math.floor((now - lastHalving.date.getTime()) / (7 * 24 * 60 * 60 * 1000));

  if (weeksSince < 40) return { phase: 'Accumulation', weeksPost: weeksSince, color: '#3b82f6' };
  if (weeksSince < 80) return { phase: 'Profit Zone', weeksPost: weeksSince, color: '#22c55e' };
  if (weeksSince < 135) return { phase: 'Last Call / Bear', weeksPost: weeksSince, color: '#ef4444' };
  return { phase: 'DCA Zone', weeksPost: weeksSince, color: '#eab308' };
}

// ============================================================
// STRATEGY B: GainzAlgo V2 Alpha
// ============================================================

export interface GainzSignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  tp: number;
  sl: number;
  atr: number;
  momentum: number;
}

export function calculateGainzAlgo(candles: CandleData[], atrPeriod = 14, fastEma = 12, slowEma = 26): GainzSignal[] {
  if (candles.length < Math.max(atrPeriod, slowEma) + 5) return [];

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // ATR
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const atr = sma(tr, atrPeriod);

  // EMA
  const emaFast = ema(closes, fastEma);
  const emaSlow = ema(closes, slowEma);
  const momentum = emaFast.map((f, i) => f - emaSlow[i]);

  // Rolling Max/Min (5 periods, shifted by 1)
  const rollingMax: number[] = new Array(candles.length).fill(0);
  const rollingMin: number[] = new Array(candles.length).fill(Infinity);
  for (let i = 5; i < candles.length; i++) {
    let max = -Infinity, min = Infinity;
    for (let j = i - 5; j < i; j++) {
      max = Math.max(max, highs[j]);
      min = Math.min(min, lows[j]);
    }
    rollingMax[i] = max;
    rollingMin[i] = min;
  }

  const signals: GainzSignal[] = [];
  for (let i = slowEma + 5; i < candles.length; i++) {
    const volCheck = atr[i] > atr[i - 1] * 0.95;

    if (closes[i] > rollingMax[i] && momentum[i] > 0 && volCheck) {
      const sl = lows[i] - atr[i] * 1.5;
      const risk = closes[i] - sl;
      signals.push({
        index: i, time: candles[i].time, type: 'buy',
        price: closes[i], tp: closes[i] + risk * 2, sl,
        atr: atr[i], momentum: momentum[i],
      });
    } else if (closes[i] < rollingMin[i] && momentum[i] < 0 && volCheck) {
      const sl = highs[i] + atr[i] * 1.5;
      const risk = sl - closes[i];
      signals.push({
        index: i, time: candles[i].time, type: 'sell',
        price: closes[i], tp: closes[i] - risk * 2, sl,
        atr: atr[i], momentum: momentum[i],
      });
    }
  }
  return signals;
}

// ============================================================
// STRATEGY C: Fabio Valentini Order Flow
// ============================================================

export interface FabioSignal {
  index: number;
  time: number;
  type: 'buy' | 'sell';
  price: number;
  poc: number;
  vah: number;
  val: number;
  cvd: number;
  delta: number;
}

export function calculateFabioValentini(candles: CandleData[]): FabioSignal[] {
  if (candles.length < 24) return [];

  // Volume Profile from last 24 candles
  const profileWindow = candles.slice(-24);
  const { poc, vah, val } = calculateVolumeProfile(profileWindow);

  // CVD approximation
  const cvd: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].close > candles[i].open
      ? candles[i].volume
      : -candles[i].volume;
    cvd.push(cvd[i - 1] + delta);
  }

  // CVD bounds for oversold/overbought
  const cvdWindow = cvd.slice(-50);
  const cvdMin = Math.min(...cvdWindow);
  const cvdMax = Math.max(...cvdWindow);
  const cvdRange = cvdMax - cvdMin || 1;

  const signals: FabioSignal[] = [];
  
  for (let i = 24; i < candles.length; i++) {
    const price = candles[i].close;
    const delta = candles[i].close > candles[i].open ? candles[i].volume : -candles[i].volume;
    const cvdNorm = (cvd[i] - cvdMin) / cvdRange;
    
    // Absorption: price doesn't make new low/high
    const prevLow = Math.min(candles[i - 1].low, candles[i - 2]?.low || Infinity);
    const prevHigh = Math.max(candles[i - 1].high, candles[i - 2]?.high || 0);

    // BUY: price near VAL + CVD oversold + aggressive buyer delta
    if (price <= val * 1.005 && cvdNorm < 0.3 && delta > 0 && candles[i].low >= prevLow * 0.999) {
      signals.push({
        index: i, time: candles[i].time, type: 'buy', price,
        poc, vah, val, cvd: cvd[i], delta,
      });
    }
    // SELL: price near VAH + CVD overbought + aggressive seller
    else if (price >= vah * 0.995 && cvdNorm > 0.7 && delta < 0 && candles[i].high <= prevHigh * 1.001) {
      signals.push({
        index: i, time: candles[i].time, type: 'sell', price,
        poc, vah, val, cvd: cvd[i], delta,
      });
    }
  }
  return signals;
}

function calculateVolumeProfile(candles: CandleData[]) {
  const priceVol: Map<number, number> = new Map();
  const step = (Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low))) / 50;
  
  for (const c of candles) {
    const bin = Math.round(((c.high + c.low) / 2) / step) * step;
    priceVol.set(bin, (priceVol.get(bin) || 0) + c.volume);
  }

  let poc = 0, maxVol = 0;
  for (const [price, vol] of priceVol) {
    if (vol > maxVol) { maxVol = vol; poc = price; }
  }

  const totalVol = Array.from(priceVol.values()).reduce((a, b) => a + b, 0);
  const target = totalVol * 0.7;
  
  const sorted = Array.from(priceVol.entries()).sort((a, b) => Math.abs(a[0] - poc) - Math.abs(b[0] - poc));
  let cumVol = 0;
  let vah = poc, val = poc;
  for (const [price, vol] of sorted) {
    cumVol += vol;
    if (price > vah) vah = price;
    if (price < val) val = price;
    if (cumVol >= target) break;
  }

  return { poc, vah, val };
}

// ============================================================
// Helpers
// ============================================================

function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  const mult = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * mult + result[i - 1];
  }
  return result;
}
