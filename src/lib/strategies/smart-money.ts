// ============================================================
// Smart Money Structure | GainzAlgo — TypeScript Port
// Ported from Pine Script v5
// ============================================================

export interface SmartMoneyConfig {
  pivotLength: number;
  momentumThresholdBase: number;
  tpPoints: number;
  slPoints: number;
  minSignalDistance: number;
  preMomentumFactorBase: number;
  shortTrendPeriod: number;
  longTrendPeriod: number;
  volumeLongPeriod: number;
  volumeShortPeriod: number;
  breakoutPeriod: number;
  // Filters
  useMomentumFilter: boolean;
  useTrendFilter: boolean;
  useVolumeFilter: boolean;
  useBreakoutFilter: boolean;
  showGetReady: boolean;
  enableLiquidityZones: boolean;
  enableMarketProfile: boolean;
  enableDivergenceScanner: boolean;
  enableTrendAnalysis: boolean;
}

export const DEFAULT_SMC_CONFIG: SmartMoneyConfig = {
  pivotLength: 5,
  momentumThresholdBase: 0.01,
  tpPoints: 10,
  slPoints: 10,
  minSignalDistance: 5,
  preMomentumFactorBase: 0.5,
  shortTrendPeriod: 30,
  longTrendPeriod: 100,
  volumeLongPeriod: 50,
  volumeShortPeriod: 5,
  breakoutPeriod: 5,
  useMomentumFilter: true,
  useTrendFilter: true,
  useVolumeFilter: true,
  useBreakoutFilter: true,
  showGetReady: false,
  enableLiquidityZones: false,
  enableMarketProfile: true,
  enableDivergenceScanner: true,
  enableTrendAnalysis: true,
};

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SMCSignal {
  time: number;
  index: number;
  type: 'buy' | 'sell' | 'get_ready_buy' | 'get_ready_sell' | 'liq_high' | 'liq_low' | 'flow_buy' | 'flow_sell' | 'div_bull' | 'div_bear';
  price: number;
  label: string;
  color: string;
}

export interface SMCLevel {
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  price: number;
  type: 'choch_sell' | 'choch_buy' | 'bos_sell' | 'bos_buy';
  color: string;
}

export interface SMCTrendLine {
  x1Time: number;
  y1: number;
  x2Time: number;
  y2: number;
  color: string;
  type: 'support' | 'resistance';
}

export interface TrendStrengthData {
  trendStrength: number;
  confidence: number;
  predictions: { tf: string; direction: '▲' | '▼' | '━'; score: number }[];
  cvd: number;
}

export interface SMCResult {
  signals: SMCSignal[];
  levels: SMCLevel[];
  trendLines: SMCTrendLine[];
  trendData: TrendStrengthData | null;
}

// --- Helper functions ---
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

function computeEMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  const mult = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) result[i] = (data[i] - result[i - 1]) * mult + result[i - 1];
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

function computeRSI(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

function highest(data: number[], period: number, idx: number): number {
  let max = -Infinity;
  for (let i = Math.max(0, idx - period + 1); i <= idx; i++) if (data[i] > max) max = data[i];
  return max;
}

function lowest(data: number[], period: number, idx: number): number {
  let min = Infinity;
  for (let i = Math.max(0, idx - period + 1); i <= idx; i++) if (data[i] < min) min = data[i];
  return min;
}

// Compute VWAP approximation
function computeVWAP(candles: Candle[]): number[] {
  let cumVol = 0, cumPV = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume; cumPV += tp * c.volume;
    return cumVol > 0 ? cumPV / cumVol : tp;
  });
}

// ============================================================
// Main Smart Money Structure Calculator
// ============================================================
export function calculateSmartMoneyStructure(
  candles: Candle[],
  config: SmartMoneyConfig = DEFAULT_SMC_CONFIG
): SMCResult {
  if (candles.length < 50) return { signals: [], levels: [], trendLines: [], trendData: null };

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const opens = candles.map(c => c.open);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const len = config.pivotLength;

  const signals: SMCSignal[] = [];
  const levels: SMCLevel[] = [];

  // ATR for volatility adjustment
  const atrArr = computeATR(candles, 14);
  const ema20 = computeEMA(closes, 20);
  const vwapArr = computeVWAP(candles);
  const volAvg = computeSMA(volumes, config.volumeLongPeriod);
  const volShort = computeSMA(volumes, config.volumeShortPeriod);
  const rsiArr = computeRSI(closes, 14);

  // --- Pivot detection ---
  const pivotHighs: (number | null)[] = new Array(n).fill(null);
  const pivotLows: (number | null)[] = new Array(n).fill(null);

  for (let i = len; i < n - len; i++) {
    let isPH = true, isPL = true;
    for (let j = i - len; j <= i + len; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isPH = false;
      if (lows[j] <= lows[i]) isPL = false;
    }
    if (isPH) pivotHighs[i] = highs[i];
    if (isPL) pivotLows[i] = lows[i];
  }

  // Track last pivot levels
  let lastHigh = 0, lastLow = Infinity;
  let lastSignalBar = -config.minSignalDistance - 1;
  let lastSignalType = 'Neutral';
  let rawCVD = 0;

  // Multi-period trend approximation (simulate multi-TF using different EMA periods)
  const emaPeriods = [5, 20, 50, 100, 150, 200];
  const emaArrays = emaPeriods.map(p => computeEMA(closes, p));

  for (let i = 1; i < n; i++) {
    // Update pivots
    if (pivotHighs[i] !== null) lastHigh = pivotHighs[i]!;
    if (pivotLows[i] !== null) lastLow = pivotLows[i]!;

    // CVD tracking
    const deltaVol = closes[i] > closes[i - 1] ? volumes[i] : closes[i] < closes[i - 1] ? -volumes[i] : 0;
    rawCVD += deltaVol;

    if (i < len * 2) continue;

    const atrVal = atrArr[i] || (highs[i] - lows[i]);
    const volatilityFactor = atrVal / closes[i];
    const momentumThreshold = config.momentumThresholdBase * (1 + volatilityFactor * 2);
    const preMomentumFactor = config.preMomentumFactorBase * (1 - volatilityFactor * 0.5);
    const preMomentumThreshold = momentumThreshold * preMomentumFactor;
    const priceChange = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;

    // --- CHoCH detection ---
    // CHoCH Sell: low crosses under last pivot high & bearish candle
    if (lows[i] < lastHigh && lows[i - 1] >= lastHigh && closes[i] < opens[i] && lastHigh > 0) {
      levels.push({
        startIndex: i - 2, endIndex: i + 5,
        startTime: candles[Math.max(0, i - 2)].time, endTime: candles[Math.min(n - 1, i + 5)].time,
        price: lastHigh, type: 'choch_sell', color: '#00E5FF',
      });
    }
    // CHoCH Buy: high crosses over last pivot low & bullish candle
    if (highs[i] > lastLow && highs[i - 1] <= lastLow && closes[i] > opens[i] && lastLow < Infinity) {
      levels.push({
        startIndex: i - 2, endIndex: i + 5,
        startTime: candles[Math.max(0, i - 2)].time, endTime: candles[Math.min(n - 1, i + 5)].time,
        price: lastLow, type: 'choch_buy', color: '#76FF03',
      });
    }

    // --- BOS detection ---
    const prevLastLow = i > 1 ? (() => { for (let k = i - 1; k >= 0; k--) if (pivotLows[k] !== null) return pivotLows[k]!; return Infinity; })() : Infinity;
    const prevLastHigh = i > 1 ? (() => { for (let k = i - 1; k >= 0; k--) if (pivotHighs[k] !== null) return pivotHighs[k]!; return 0; })() : 0;

    if (lows[i] < prevLastLow && lows[i - 1] >= prevLastLow && closes[i] < opens[i] && prevLastLow < Infinity) {
      levels.push({
        startIndex: i - 2, endIndex: i + 5,
        startTime: candles[Math.max(0, i - 2)].time, endTime: candles[Math.min(n - 1, i + 5)].time,
        price: prevLastLow, type: 'bos_sell', color: '#E040FB',
      });
    }
    if (highs[i] > prevLastHigh && highs[i - 1] <= prevLastHigh && closes[i] > opens[i] && prevLastHigh > 0) {
      levels.push({
        startIndex: i - 2, endIndex: i + 5,
        startTime: candles[Math.max(0, i - 2)].time, endTime: candles[Math.min(n - 1, i + 5)].time,
        price: prevLastHigh, type: 'bos_buy', color: '#00BFA5',
      });
    }

    // --- Trend computation (simulate multi-TF using multiple EMAs) ---
    let trendScore = 0;
    for (const emaArr of emaArrays) {
      if (closes[i] > emaArr[i]) trendScore += 1;
      else if (closes[i] < emaArr[i]) trendScore -= 1;
    }
    const bullishTrendOk = !config.useTrendFilter || trendScore > 0;
    const bearishTrendOk = !config.useTrendFilter || trendScore < 0;

    // Volume filter
    const volCondition = !config.useVolumeFilter || (volumes[i] > volAvg[i] && (volShort[i] > (volShort[i - 1] || 0)));

    // Breakout filter
    const highestBreakout = highest(highs, config.breakoutPeriod, i - 1);
    const lowestBreakout = lowest(lows, config.breakoutPeriod, i - 1);
    const buyBreakoutOk = !config.useBreakoutFilter || closes[i] > highestBreakout;
    const sellBreakoutOk = !config.useBreakoutFilter || closes[i] < lowestBreakout;

    // Momentum filter
    const earlyBuySignal = !config.useMomentumFilter || priceChange > momentumThreshold;
    const earlySellSignal = !config.useMomentumFilter || priceChange < -momentumThreshold;

    const distanceOk = (i - lastSignalBar) >= config.minSignalDistance;

    // --- Buy Signal ---
    if (earlyBuySignal && distanceOk && bullishTrendOk && volCondition && buyBreakoutOk) {
      signals.push({
        time: candles[i].time, index: i, type: 'buy', price: closes[i],
        label: '🟢 BUY', color: '#00E676',
      });
      lastSignalBar = i; lastSignalType = 'Buy';
    }
    // --- Sell Signal ---
    else if (earlySellSignal && distanceOk && bearishTrendOk && volCondition && sellBreakoutOk) {
      signals.push({
        time: candles[i].time, index: i, type: 'sell', price: closes[i],
        label: '🔴 SELL', color: '#FF1744',
      });
      lastSignalBar = i; lastSignalType = 'Sell';
    }

    // --- Get Ready Signals ---
    if (config.showGetReady && config.useMomentumFilter) {
      if (priceChange > preMomentumThreshold && priceChange < momentumThreshold && distanceOk && bullishTrendOk && volCondition && buyBreakoutOk) {
        signals.push({ time: candles[i].time, index: i, type: 'get_ready_buy', price: closes[i], label: '⚠ READY', color: '#FFB627' });
      }
      if (priceChange < -preMomentumThreshold && priceChange > -momentumThreshold && distanceOk && bearishTrendOk && volCondition && sellBreakoutOk) {
        signals.push({ time: candles[i].time, index: i, type: 'get_ready_sell', price: closes[i], label: '⚠ READY', color: '#FFB627' });
      }
    }

    // --- Liquidity Zones ---
    if (config.enableLiquidityZones && i > 20) {
      const recentHigh = highest(highs, 20, i);
      if (highs[i] >= recentHigh * 0.9995 && highs[i] <= recentHigh * 1.0005) {
        signals.push({ time: candles[i].time, index: i, type: 'liq_high', price: highs[i], label: '💧 LIQ', color: '#FF6B35' });
      }
      const recentLow = lowest(lows, 20, i);
      if (lows[i] <= recentLow * 1.0005 && lows[i] >= recentLow * 0.9995) {
        signals.push({ time: candles[i].time, index: i, type: 'liq_low', price: lows[i], label: '💧 LIQ', color: '#FF6B35' });
      }
    }

    // --- Market Profile (Order Flow) ---
    if (config.enableMarketProfile && i >= 20) {
      let recentBuyVol = 0, recentSellVol = 0;
      for (let j = Math.max(0, i - 19); j <= i; j++) {
        if (closes[j] > opens[j]) recentBuyVol += volumes[j];
        else if (closes[j] < opens[j]) recentSellVol += volumes[j];
      }
      const volRatio = (recentBuyVol + recentSellVol) > 0 ? recentBuyVol / (recentBuyVol + recentSellVol) : 0.5;
      if (volRatio > 0.65 && volumes[i] > volAvg[i] * 1.5) {
        signals.push({ time: candles[i].time, index: i, type: 'flow_buy', price: lows[i], label: '🔥 BUY FLOW', color: '#00D9FF' });
      }
      if (volRatio < 0.35 && volumes[i] > volAvg[i] * 1.5) {
        signals.push({ time: candles[i].time, index: i, type: 'flow_sell', price: highs[i], label: '🔥 SELL FLOW', color: '#FF006E' });
      }
    }

    // --- Divergence Scanner ---
    if (config.enableDivergenceScanner && i >= 10) {
      const priceLowerLow = lows[i] < lows[Math.max(0, i - 5)] && lows[Math.max(0, i - 5)] < lows[Math.max(0, i - 10)];
      const rsiHigherLow = rsiArr[i] > rsiArr[Math.max(0, i - 5)] && rsiArr[Math.max(0, i - 5)] > rsiArr[Math.max(0, i - 10)];
      if (priceLowerLow && rsiHigherLow && rsiArr[i] < 40) {
        signals.push({ time: candles[i].time, index: i, type: 'div_bull', price: lows[i], label: '⚡ BULL DIV', color: '#00F5FF' });
      }
      const priceHigherHigh = highs[i] > highs[Math.max(0, i - 5)] && highs[Math.max(0, i - 5)] > highs[Math.max(0, i - 10)];
      const rsiLowerHigh = rsiArr[i] < rsiArr[Math.max(0, i - 5)] && rsiArr[Math.max(0, i - 5)] < rsiArr[Math.max(0, i - 10)];
      if (priceHigherHigh && rsiLowerHigh && rsiArr[i] > 60) {
        signals.push({ time: candles[i].time, index: i, type: 'div_bear', price: highs[i], label: '⚡ BEAR DIV', color: '#C77DFF' });
      }
    }
  }

  // --- Support / Resistance Trendlines ---
  const trendLines: SMCTrendLine[] = [];
  const lastIdx = n - 1;
  if (lastIdx > config.longTrendPeriod) {
    // Find lowest lows for support trendline
    let lowestY1 = Infinity, lowestX1 = 0, lowestY2 = Infinity, lowestX2 = 0;
    let highestY1 = -Infinity, highestX1 = 0, highestY2 = -Infinity, highestX2 = 0;
    const maxShort = Math.min(config.shortTrendPeriod, lastIdx);
    for (let i = 1; i <= maxShort; i++) {
      if (lows[lastIdx - i] < lowestY2) { lowestY2 = lows[lastIdx - i]; lowestX2 = i; }
      if (highs[lastIdx - i] > highestY2) { highestY2 = highs[lastIdx - i]; highestX2 = i; }
    }
    const maxLong = Math.min(config.longTrendPeriod, lastIdx);
    for (let j = config.shortTrendPeriod + 1; j <= maxLong; j++) {
      if (lows[lastIdx - j] < lowestY1) { lowestY1 = lows[lastIdx - j]; lowestX1 = j; }
      if (highs[lastIdx - j] > highestY1) { highestY1 = highs[lastIdx - j]; highestX1 = j; }
    }

    // Compute trend strength for line color
    let trendStrengthRaw = 0;
    for (const emaArr of emaArrays.slice(0, Math.min(emaArrays.length, 6))) {
      if (closes[lastIdx] > emaArr[lastIdx]) trendStrengthRaw += 1;
      else if (closes[lastIdx] < emaArr[lastIdx]) trendStrengthRaw -= 1;
    }

    if (lowestX1 > 0 && lowestX2 > 0) {
      const supColor = trendStrengthRaw >= 4 ? '#00E676' : trendStrengthRaw >= 2 ? '#76FF03' : trendStrengthRaw >= 1 ? '#FFEB3B' : '#9CA3AF';
      trendLines.push({
        x1Time: candles[lastIdx - lowestX1].time, y1: lowestY1,
        x2Time: candles[lastIdx - lowestX2].time, y2: lowestY2,
        color: supColor, type: 'support',
      });
    }
    if (highestX1 > 0 && highestX2 > 0) {
      const resColor = trendStrengthRaw <= -4 ? '#FF1744' : trendStrengthRaw <= -2 ? '#E040FB' : trendStrengthRaw <= -1 ? '#FFEB3B' : '#9CA3AF';
      trendLines.push({
        x1Time: candles[lastIdx - highestX1].time, y1: highestY1,
        x2Time: candles[lastIdx - highestX2].time, y2: highestY2,
        color: resColor, type: 'resistance',
      });
    }
  }

  // --- Trend Strength Matrix ---
  let trendData: TrendStrengthData | null = null;
  if (config.enableTrendAnalysis && n > 200) {
    const i = lastIdx;
    // Simulate multi-TF using different EMA+VWAP periods
    const tfConfigs = [
      { tf: '5M', emaPeriod: 5, vwapWeight: 0.3 },
      { tf: '15M', emaPeriod: 15, vwapWeight: 0.4 },
      { tf: '30M', emaPeriod: 30, vwapWeight: 0.5 },
      { tf: '1H', emaPeriod: 60, vwapWeight: 0.6 },
      { tf: '4H', emaPeriod: 120, vwapWeight: 0.7 },
      { tf: '1D', emaPeriod: 200, vwapWeight: 0.8 },
    ];

    const predictions: TrendStrengthData['predictions'] = [];
    let totalTrendScore = 0;

    for (const tf of tfConfigs) {
      const tfEma = computeEMA(closes, Math.min(tf.emaPeriod, n - 1));
      const aboveEma = closes[i] > tfEma[i] ? 1 : closes[i] < tfEma[i] ? -1 : 0;
      const aboveVwap = closes[i] > vwapArr[i] ? 1 : closes[i] < vwapArr[i] ? -1 : 0;
      const trend = (aboveEma + aboveVwap) > 0 ? 1 : (aboveEma + aboveVwap) < 0 ? -1 : 0;

      // Momentum: close change over 3 periods equivalent
      const lookback = Math.min(3, i);
      const momentum = closes[i] - closes[i - lookback];
      const momentumScore = momentum > 0 ? 0.5 : momentum < 0 ? -0.5 : 0;

      const atrNow = atrArr[i];
      const atrAvg = computeSMA(atrArr, 20)[i];
      const volScore = atrNow > atrAvg ? 0.5 : 0;

      const score = trend + momentumScore + volScore;
      totalTrendScore += trend;

      predictions.push({
        tf: tf.tf,
        direction: score > 0.5 ? '▲' : score < -0.5 ? '▼' : '━',
        score,
      });
    }

    const trendStrength = (totalTrendScore / tfConfigs.length) * 100;
    let confidence = 50;
    const absTrend = Math.abs(totalTrendScore);
    if (absTrend >= 6) confidence = 90;
    else if (absTrend >= 4) confidence = 75;
    else if (absTrend >= 2) confidence = 60;

    trendData = { trendStrength, confidence, predictions, cvd: rawCVD };
  }

  return { signals, levels, trendLines, trendData };
}
