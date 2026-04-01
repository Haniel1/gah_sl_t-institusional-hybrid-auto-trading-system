// ============================================================
// Volatility Regimes | GainzAlgo — TypeScript Port
// Ported from Pine Script v6
// ============================================================

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolRegimeConfig {
  atrLength: number;
  band1Mult: number;
  band2Mult: number;
  band3Mult: number;
  showBands: boolean;
  showVolSignals: boolean;
  volThreshold: number;
  showTrend: boolean;
  trendLength: number;
  // Regime
  enableRegimeDetection: boolean;
  regimeBaselineLength: number;
  compressionThreshold: number;
  expansionThreshold: number;
  highVolThreshold: number;
  exhaustionLookback: number;
  // Dynamic SL
  enableDynamicSL: boolean;
  slMultiplier: number;
  // TP
  enableMultipleTP: boolean;
  tp1Mult: number;
  tp2Mult: number;
  tp3Mult: number;
  // S/R
  enableSR: boolean;
  srLookback: number;
  // Risk
  enableRiskCalc: boolean;
  accountSize: number;
  riskPercent: number;
  // ATR Percentile
  enableATRPercentile: boolean;
  percentileLookback: number;
  // Contraction
  enableContraction: boolean;
  contractionBars: number;
  contractionThreshold: number;
}

export const DEFAULT_VOL_REGIME_CONFIG: VolRegimeConfig = {
  atrLength: 14,
  band1Mult: 1.0,
  band2Mult: 2.0,
  band3Mult: 3.0,
  showBands: true,
  showVolSignals: true,
  volThreshold: 1.5,
  showTrend: true,
  trendLength: 21,
  enableRegimeDetection: true,
  regimeBaselineLength: 50,
  compressionThreshold: 0.70,
  expansionThreshold: 1.15,
  highVolThreshold: 1.40,
  exhaustionLookback: 5,
  enableDynamicSL: true,
  slMultiplier: 2.0,
  enableMultipleTP: true,
  tp1Mult: 1.5,
  tp2Mult: 2.5,
  tp3Mult: 4.0,
  enableSR: true,
  srLookback: 20,
  enableRiskCalc: true,
  accountSize: 10000,
  riskPercent: 1.0,
  enableATRPercentile: true,
  percentileLookback: 100,
  enableContraction: true,
  contractionBars: 7,
  contractionThreshold: 0.5,
};

export type RegimeType = 'COMPRESSION' | 'EXPANSION' | 'HIGH_VOLATILITY' | 'EXHAUSTION' | 'NEUTRAL';

export interface VolRegimeBands {
  upper1: number[];
  lower1: number[];
  upper2: number[];
  lower2: number[];
  upper3: number[];
  lower3: number[];
}

export interface VolRegimeSignal {
  time: number;
  index: number;
  type: 'vol_breakout' | 'bull_trend' | 'bear_trend' | 'contraction' | 'regime_change';
  label: string;
  color: string;
  position: 'above' | 'below';
}

export interface VolRegimeLevel {
  time: number;
  index: number;
  bullSL: number;
  bearSL: number;
  bullTP1: number;
  bullTP2: number;
  bullTP3: number;
  bearTP1: number;
  bearTP2: number;
  bearTP3: number;
  support: number;
  resistance: number;
}

export interface VolRegimeInfo {
  regime: RegimeType;
  regimeColor: string;
  atrRatio: number;
  atrPercentile: number;
  positionSize: number;
  riskAmount: number;
}

export interface VolRegimeResult {
  bands: VolRegimeBands;
  signals: VolRegimeSignal[];
  regimes: RegimeType[];
  regimeColors: string[];
  lastInfo: VolRegimeInfo | null;
  levels: VolRegimeLevel | null;
  atrValues: number[];
}

// --- Helpers ---
function computeATR(candles: Candle[], period: number): number[] {
  const result: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const tr = i === 0
      ? candles[i].high - candles[i].low
      : Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    if (i < period) result[i] = tr;
    else if (i === period) {
      let sum = 0; for (let j = 0; j < period; j++) sum += result[j];
      result[i] = (sum + tr) / (period + 1);
    } else result[i] = (result[i - 1] * (period - 1) + tr) / period;
  }
  return result;
}

function computeSMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result[i] = data[i]; continue; }
    let sum = 0; for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

function computeEMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  const mult = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) result[i] = (data[i] - result[i - 1]) * mult + result[i - 1];
  return result;
}

function highestN(data: number[], period: number, idx: number): number {
  let max = -Infinity;
  for (let i = Math.max(0, idx - period + 1); i <= idx; i++) if (data[i] > max) max = data[i];
  return max;
}

function lowestN(data: number[], period: number, idx: number): number {
  let min = Infinity;
  for (let i = Math.max(0, idx - period + 1); i <= idx; i++) if (data[i] < min) min = data[i];
  return min;
}

// ============================================================
// Main Calculator
// ============================================================
export function calculateVolatilityRegimes(
  candles: Candle[],
  config: VolRegimeConfig = DEFAULT_VOL_REGIME_CONFIG
): VolRegimeResult {
  const n = candles.length;
  if (n < 30) return {
    bands: { upper1: [], lower1: [], upper2: [], lower2: [], upper3: [], lower3: [] },
    signals: [], regimes: [], regimeColors: [], lastInfo: null, levels: null, atrValues: [],
  };

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const atrArr = computeATR(candles, config.atrLength);
  const atrSma = computeSMA(atrArr, config.atrLength);
  const atrBaseline = computeSMA(atrArr, config.regimeBaselineLength);
  const closeSma = computeSMA(closes, config.trendLength);

  // Bands
  const bands: VolRegimeBands = {
    upper1: closes.map((c, i) => c + atrArr[i] * config.band1Mult),
    lower1: closes.map((c, i) => c - atrArr[i] * config.band1Mult),
    upper2: closes.map((c, i) => c + atrArr[i] * config.band2Mult),
    lower2: closes.map((c, i) => c - atrArr[i] * config.band2Mult),
    upper3: closes.map((c, i) => c + atrArr[i] * config.band3Mult),
    lower3: closes.map((c, i) => c - atrArr[i] * config.band3Mult),
  };

  const signals: VolRegimeSignal[] = [];
  const regimes: RegimeType[] = new Array(n).fill('NEUTRAL');
  const regimeColors: string[] = new Array(n).fill('transparent');

  const REGIME_COLORS: Record<RegimeType, string> = {
    COMPRESSION: 'rgba(76, 175, 80, 0.08)',
    EXPANSION: 'rgba(255, 152, 0, 0.08)',
    HIGH_VOLATILITY: 'rgba(244, 67, 54, 0.08)',
    EXHAUSTION: 'rgba(156, 39, 176, 0.08)',
    NEUTRAL: 'transparent',
  };

  for (let i = 1; i < n; i++) {
    // Volatility breakout signal
    if (config.showVolSignals) {
      const isBreakout = atrArr[i] > atrSma[i] * config.volThreshold;
      const wasBreakout = atrArr[i - 1] > atrSma[i - 1] * config.volThreshold;
      if (isBreakout && !wasBreakout) {
        signals.push({
          time: candles[i].time, index: i, type: 'vol_breakout',
          label: '⚡ VOL', color: '#FFEB3B', position: 'above',
        });
      }
    }

    // Trend signals
    if (config.showTrend && i >= config.trendLength) {
      const priceAboveSma = closes[i] > closeSma[i];
      const atrRising = atrArr[i] > atrSma[i];
      const prevAbove = closes[i - 1] > closeSma[i - 1];
      const prevRising = atrArr[i - 1] > atrSma[i - 1];

      const currTrend = priceAboveSma && atrRising ? 1 : !priceAboveSma && atrRising ? -1 : 0;
      const prevTrend = prevAbove && prevRising ? 1 : !prevAbove && prevRising ? -1 : 0;

      if (currTrend === 1 && prevTrend !== 1) {
        signals.push({ time: candles[i].time, index: i, type: 'bull_trend', label: '↑ BULL', color: '#26A69A', position: 'below' });
      }
      if (currTrend === -1 && prevTrend !== -1) {
        signals.push({ time: candles[i].time, index: i, type: 'bear_trend', label: '↓ BEAR', color: '#EF5350', position: 'above' });
      }
    }

    // Regime detection
    if (config.enableRegimeDetection && i >= config.regimeBaselineLength) {
      const ratio = atrBaseline[i] > 0 ? atrArr[i] / atrBaseline[i] : 1;

      // Check if recently high vol
      let wasRecentlyHighVol = false;
      for (let k = 1; k <= Math.min(10, i); k++) {
        const pastRatio = atrBaseline[i - k] > 0 ? atrArr[i - k] / atrBaseline[i - k] : 1;
        if (pastRatio >= config.highVolThreshold) { wasRecentlyHighVol = true; break; }
      }

      // Check ATR declining
      let atrDeclining = true;
      for (let k = 1; k <= Math.min(config.exhaustionLookback, i - 1); k++) {
        if (atrArr[i - k] <= atrArr[i - k - 1]) { atrDeclining = false; break; }
      }

      let regime: RegimeType;
      if (ratio >= config.highVolThreshold) regime = 'HIGH_VOLATILITY';
      else if (ratio >= config.expansionThreshold) regime = 'EXPANSION';
      else if (ratio < config.compressionThreshold) regime = 'COMPRESSION';
      else if (wasRecentlyHighVol && atrDeclining) regime = 'EXHAUSTION';
      else regime = 'EXPANSION';

      regimes[i] = regime;
      regimeColors[i] = REGIME_COLORS[regime];

      // Regime change signal
      if (regimes[i] !== regimes[i - 1] && regimes[i - 1] !== 'NEUTRAL') {
        signals.push({
          time: candles[i].time, index: i, type: 'regime_change',
          label: regime.replace('_', ' '), color: regime === 'COMPRESSION' ? '#4CAF50' : regime === 'EXPANSION' ? '#FF9800' : regime === 'HIGH_VOLATILITY' ? '#F44336' : '#9C27B0',
          position: 'above',
        });
      }
    }

    // Contraction pattern
    if (config.enableContraction && i >= config.contractionBars * 2) {
      const avgATR = computeSMA(atrArr.slice(0, i + 1), config.contractionBars * 2);
      const avg = avgATR[avgATR.length - 1];
      let contracted = true;
      for (let k = 0; k < config.contractionBars && k < i; k++) {
        if (atrArr[i - k] > avg * config.contractionThreshold) { contracted = false; break; }
      }
      // Check previous bar wasn't contracted
      let prevContracted = true;
      if (i > config.contractionBars) {
        for (let k = 1; k <= config.contractionBars && k < i; k++) {
          if (atrArr[i - 1 - k] > avg * config.contractionThreshold) { prevContracted = false; break; }
        }
      } else prevContracted = false;

      if (contracted && !prevContracted) {
        signals.push({
          time: candles[i].time, index: i, type: 'contraction',
          label: '🔻 SQUEEZE', color: '#FFEB3B', position: 'below',
        });
      }
    }
  }

  // Last bar info
  const lastIdx = n - 1;
  const lastATR = atrArr[lastIdx];
  const lastRatio = atrBaseline[lastIdx] > 0 ? lastATR / atrBaseline[lastIdx] : 1;

  // ATR Percentile
  let percentile = 50;
  if (config.enableATRPercentile) {
    const lookback = Math.min(config.percentileLookback, lastIdx);
    let count = 0;
    for (let i = lastIdx - lookback; i < lastIdx; i++) {
      if (i >= 0 && atrArr[i] < lastATR) count++;
    }
    percentile = lookback > 0 ? (count / lookback) * 100 : 50;
  }

  // Position size
  const bullSL = closes[lastIdx] - lastATR * config.slMultiplier;
  const stopDist = Math.abs(closes[lastIdx] - bullSL);
  const riskAmount = config.accountSize * (config.riskPercent / 100);
  const posSize = stopDist > 0 ? riskAmount / stopDist : 0;

  // Levels for last bar
  const levels: VolRegimeLevel = {
    time: candles[lastIdx].time, index: lastIdx,
    bullSL, bearSL: closes[lastIdx] + lastATR * config.slMultiplier,
    bullTP1: closes[lastIdx] + lastATR * config.tp1Mult,
    bullTP2: closes[lastIdx] + lastATR * config.tp2Mult,
    bullTP3: closes[lastIdx] + lastATR * config.tp3Mult,
    bearTP1: closes[lastIdx] - lastATR * config.tp1Mult,
    bearTP2: closes[lastIdx] - lastATR * config.tp2Mult,
    bearTP3: closes[lastIdx] - lastATR * config.tp3Mult,
    support: lowestN(lows, config.srLookback, lastIdx),
    resistance: highestN(highs, config.srLookback, lastIdx),
  };

  const lastInfo: VolRegimeInfo = {
    regime: regimes[lastIdx],
    regimeColor: regimeColors[lastIdx],
    atrRatio: lastRatio,
    atrPercentile: percentile,
    positionSize: posSize,
    riskAmount,
  };

  return { bands, signals, regimes, regimeColors, lastInfo, levels, atrValues: atrArr };
}
