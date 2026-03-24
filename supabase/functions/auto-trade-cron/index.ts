import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ Types ============
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface FVGZone { type: 'bullish' | 'bearish'; top: number; bottom: number; candleIndex: number; }
interface LiquiditySweep { detected: boolean; sweepLow: number; recoveryConfirmed: boolean; }

// ============ Technical Indicators ============
function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function rsi(closes: number[], period = 14): number[] {
  const result = new Array(closes.length).fill(50);
  if (closes.length <= period) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  if (avgLoss === 0) result[period] = 100;
  else result[period] = 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

function atr(candles: Candle[], period = 14): number[] {
  const result = new Array(candles.length).fill(0);
  if (candles.length < 2) return result;
  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) sum += trs[i];
  result[period - 1] = sum / Math.min(period, trs.length);
  for (let i = period; i < trs.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + trs[i]) / period;
  }
  return result;
}

function adx(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 25;
  const n = candles.length;
  const plusDM: number[] = [];
  const mdList: number[] = [];
  const trList: number[] = [];

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    mdList.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trList.push(tr);
  }

  let smoothTR = 0, smoothPDM = 0, smoothMDM = 0;
  for (let i = 0; i < period; i++) {
    smoothTR += trList[i]; smoothPDM += plusDM[i]; smoothMDM += mdList[i];
  }
  const dxValues: number[] = [];
  for (let i = period; i < trList.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trList[i];
    smoothPDM = smoothPDM - smoothPDM / period + plusDM[i];
    smoothMDM = smoothMDM - smoothMDM / period + mdList[i];
    const plusDI = smoothTR === 0 ? 0 : (smoothPDM / smoothTR) * 100;
    const minusDI = smoothTR === 0 ? 0 : (smoothMDM / smoothTR) * 100;
    const diSum = plusDI + minusDI;
    dxValues.push(diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100);
  }
  if (dxValues.length === 0) return 25;
  const recent = dxValues.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function stochRsi(closes: number[], rsiPeriod = 14, stochPeriod = 14): { k: number; d: number } {
  const rsiVals = rsi(closes, rsiPeriod);
  const recent = rsiVals.slice(-stochPeriod);
  const minRsi = Math.min(...recent), maxRsi = Math.max(...recent);
  const range = maxRsi - minRsi;
  const k = range === 0 ? 50 : ((rsiVals[rsiVals.length - 1] - minRsi) / range) * 100;
  const kArr = rsiVals.slice(-(stochPeriod + 2)).map((_, idx, arr) => {
    const slice = arr.slice(Math.max(0, idx - stochPeriod + 1), idx + 1);
    const mn = Math.min(...slice), mx = Math.max(...slice);
    return mx === mn ? 50 : ((arr[idx] - mn) / (mx - mn)) * 100;
  });
  const d = kArr.slice(-3).reduce((a, b) => a + b, 0) / 3;
  return { k, d };
}

// TRAMA - Trend Regularity Adaptive Moving Average
function trama(closes: number[], period = 99): number {
  if (closes.length < period) return closes[closes.length - 1] || 0;
  let amaVal = closes[closes.length - period];
  for (let i = closes.length - period + 1; i < closes.length; i++) {
    const slice = closes.slice(Math.max(0, i - period), i + 1);
    const highest = Math.max(...slice);
    const lowest = Math.min(...slice);
    const prevHighest = Math.max(...closes.slice(Math.max(0, i - period - 1), i));
    const prevLowest = Math.min(...closes.slice(Math.max(0, i - period - 1), i));
    const hh = highest > prevHighest ? 1 : 0;
    const ll = lowest < prevLowest ? 1 : 0;
    // tc = sma(hh or ll, period)^2
    const recentSlice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const hhll = recentSlice.map((_, j, arr) => {
      const s = closes.slice(Math.max(0, i - period + 1 + j - period), i + 1 + j - period + 1);
      const h = Math.max(...s), l = Math.min(...s);
      const ph = Math.max(...closes.slice(Math.max(0, i + j - period - period), i + j - period + 1));
      const pl = Math.min(...closes.slice(Math.max(0, i + j - period - period), i + j - period + 1));
      return (h > ph || l < pl) ? 1 : 0;
    });
    const tc = Math.pow(hhll.reduce((a, b) => a + b, 0) / period, 2);
    amaVal = amaVal + tc * (closes[i] - amaVal);
  }
  return amaVal;
}

// ============ Trend Detection (H4 EMA 50 + EMA 200) ============
function detectTrend(h4Candles: Candle[]): { trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; ema50: number; ema200: number } {
  if (h4Candles.length < 200) return { trend: 'NEUTRAL', ema50: 0, ema200: 0 };
  const closes = h4Candles.map(c => c.close);
  const ema200vals = ema(closes, 200);
  const ema50vals = ema(closes, 50);
  const lastEma200 = ema200vals[ema200vals.length - 1];
  const lastEma50 = ema50vals[ema50vals.length - 1];
  const lastPrice = closes[closes.length - 1];
  if (lastEma200 === 0) return { trend: 'NEUTRAL', ema50: lastEma50, ema200: lastEma200 };
  if (lastPrice > lastEma200 && lastEma50 > lastEma200) return { trend: 'BULLISH', ema50: lastEma50, ema200: lastEma200 };
  if (lastPrice < lastEma200 && lastEma50 < lastEma200) return { trend: 'BEARISH', ema50: lastEma50, ema200: lastEma200 };
  return { trend: 'NEUTRAL', ema50: lastEma50, ema200: lastEma200 };
}

// ============ SWING HIGH / LOW ============
function getSwingLow(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period);
  return Math.min(...slice.map(c => c.low));
}
function getSwingHigh(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period);
  return Math.max(...slice.map(c => c.high));
}
function getNextResistance(candles: Candle[], currentPrice: number, lookback = 50): number {
  const highs = candles.slice(-lookback).map(c => c.high).filter(h => h > currentPrice * 1.005);
  return highs.length > 0 ? Math.min(...highs) : currentPrice * 1.05;
}
function getNextSupport(candles: Candle[], currentPrice: number, lookback = 50): number {
  const lows = candles.slice(-lookback).map(c => c.low).filter(l => l < currentPrice * 0.995);
  return lows.length > 0 ? Math.max(...lows) : currentPrice * 0.95;
}
function getFibLevels(swingHigh: number, swingLow: number) {
  const range = swingHigh - swingLow;
  return { fib382: swingHigh - range * 0.382, fib500: swingHigh - range * 0.500, fib618: swingHigh - range * 0.618 };
}

// ============ FAIR VALUE GAP DETECTION ============
function detectFVGs(candles: Candle[], lookback = 20): FVGZone[] {
  const zones: FVGZone[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i++) {
    const c1 = candles[i - 2], c3 = candles[i];
    // Bullish FVG: c3.low > c1.high (gap up)
    if (c3.low > c1.high) {
      zones.push({ type: 'bullish', top: c3.low, bottom: c1.high, candleIndex: i });
    }
    // Bearish FVG: c3.high < c1.low (gap down)
    else if (c3.high < c1.low) {
      zones.push({ type: 'bearish', top: c1.low, bottom: c3.high, candleIndex: i });
    }
  }
  return zones;
}

// Price returns to fill an FVG (magnet effect)
function checkPriceAtFVG(currentPrice: number, fvgs: FVGZone[]): { atFVG: boolean; fvgType: 'bullish' | 'bearish' | null; fvgMid: number } {
  for (const fvg of fvgs.slice().reverse()) {
    const mid = (fvg.top + fvg.bottom) / 2;
    // Bullish FVG: price dips to fill it (buy zone)
    if (fvg.type === 'bullish' && currentPrice >= fvg.bottom * 0.998 && currentPrice <= fvg.top * 1.002) {
      return { atFVG: true, fvgType: 'bullish', fvgMid: mid };
    }
    // Bearish FVG: price rallies into it (sell zone)
    if (fvg.type === 'bearish' && currentPrice >= fvg.bottom * 0.998 && currentPrice <= fvg.top * 1.002) {
      return { atFVG: true, fvgType: 'bearish', fvgMid: mid };
    }
  }
  return { atFVG: false, fvgType: null, fvgMid: 0 };
}

// ============ LIQUIDITY SWEEP DETECTOR (AMD Anti-Manipulation) ============
// Detects when price briefly breaks below support then recovers (Spring/Sweep = manipulation done)
function detectLiquiditySweep(candles: Candle[], supportLevel: number): LiquiditySweep {
  if (candles.length < 5) return { detected: false, sweepLow: 0, recoveryConfirmed: false };
  // Check last 5 candles for a wick below support that then closed above
  for (let i = candles.length - 4; i < candles.length; i++) {
    const c = candles[i];
    // Wick below support = sweep (manipulation)
    if (c.low < supportLevel * 0.999) {
      // Check if subsequent candles recovered above support
      const latestClose = candles[candles.length - 1].close;
      if (latestClose > supportLevel) {
        return { detected: true, sweepLow: c.low, recoveryConfirmed: true };
      }
    }
  }
  return { detected: false, sweepLow: 0, recoveryConfirmed: false };
}

// ============ CANDLESTICK PATTERNS ============
function isBullishReversal(candles: Candle[]): { confirmed: boolean; pattern: string } {
  if (candles.length < 3) return { confirmed: false, pattern: '' };
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const bodySize = Math.abs(curr.close - curr.open);
  const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
  const upperShadow = curr.high - Math.max(curr.open, curr.close);
  const isHammer = curr.close > curr.open && lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5;
  const isBullishEngulfing = prev.close < prev.open && curr.close > curr.open &&
    curr.open <= prev.close && curr.close >= prev.open && bodySize > Math.abs(prev.close - prev.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const prev2Body = Math.abs(prev2.close - prev2.open);
  const isMorningStar = prev2.close < prev2.open && prevBody < prev2Body * 0.5 &&
    curr.close > curr.open && curr.close > (prev2.open + prev2.close) / 2;
  const breakout = curr.close > prev.high && curr.close > prev2.high;
  if (isMorningStar) return { confirmed: true, pattern: 'Morning Star' };
  if (isBullishEngulfing) return { confirmed: true, pattern: 'Bullish Engulfing' };
  if (isHammer) return { confirmed: true, pattern: 'Hammer' };
  if (breakout) return { confirmed: true, pattern: 'Breakout' };
  return { confirmed: false, pattern: '' };
}

function isBearishReversal(candles: Candle[]): { confirmed: boolean; pattern: string } {
  if (candles.length < 3) return { confirmed: false, pattern: '' };
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const bodySize = Math.abs(curr.close - curr.open);
  const upperShadow = curr.high - Math.max(curr.open, curr.close);
  const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
  const isShootingStar = curr.close < curr.open && upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5;
  const isBearishEngulfing = prev.close > prev.open && curr.close < curr.open &&
    curr.open >= prev.close && curr.close <= prev.open && bodySize > Math.abs(prev.close - prev.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const prev2Body = Math.abs(prev2.close - prev2.open);
  const isEveningStar = prev2.close > prev2.open && prevBody < prev2Body * 0.5 &&
    curr.close < curr.open && curr.close < (prev2.open + prev2.close) / 2;
  const breakdown = curr.close < prev.low && curr.close < prev2.low;
  if (isEveningStar) return { confirmed: true, pattern: 'Evening Star' };
  if (isBearishEngulfing) return { confirmed: true, pattern: 'Bearish Engulfing' };
  if (isShootingStar) return { confirmed: true, pattern: 'Shooting Star' };
  if (breakdown) return { confirmed: true, pattern: 'Breakdown' };
  return { confirmed: false, pattern: '' };
}

// ============ VOLUME CONFIRMATION ============
function isVolumeConfirmed(candles: Candle[], multiplier = 1.2): boolean {
  if (candles.length < 20) return true;
  const avgVol = candles.slice(-20, -1).reduce((s, c) => s + c.volume, 0) / 19;
  const lastVol = candles[candles.length - 1].volume;
  return lastVol >= avgVol * multiplier;
}

// ============ DYNAMIC RISK SIZING (ATR-based) ============
function calculateDynamicRiskSize(capital: number, currentPrice: number, atrValue: number, atrThreshold: number): number {
  const riskPct = atrValue > atrThreshold ? 0.005 : 0.02; // 0.5% if high volatility, 2% normal
  return capital * riskPct;
}

// ============ GLOBAL DRAWDOWN CHECK (Emergency Brake) ============
const GLOBAL_DRAWDOWN_LIMIT = 0.10; // 10% total drawdown → stop all
function isEmergencyBrake(initialCapital: number, currentCapital: number): boolean {
  if (initialCapital <= 0) return false;
  return (initialCapital - currentCapital) / initialCapital >= GLOBAL_DRAWDOWN_LIMIT;
}

// ============ Indodax API ============
async function fetchCandles(symbol: string, tf = '60', count = 300): Promise<Candle[]> {
  const to = Math.floor(Date.now() / 1000);
  const tfSeconds = parseInt(tf) * 60;
  const from = to - count * tfSeconds;
  const url = `https://indodax.com/tradingview/history_v2?symbol=${symbol.toUpperCase()}&tf=${tf}&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => ({
      time: Number(d.Time), open: Number(d.Open), high: Number(d.High),
      low: Number(d.Low), close: Number(d.Close), volume: Number(d.Volume),
    })).sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function signRequest(params: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(params));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function indodaxTrade(apiKey: string, secret: string, method: string, extraParams: Record<string, string> = {}) {
  const timestamp = Date.now();
  const params = new URLSearchParams({ method, timestamp: timestamp.toString(), recvWindow: '30000', ...extraParams });
  const sign = await signRequest(params.toString(), secret);
  const res = await fetch('https://indodax.com/tapi', {
    method: 'POST',
    headers: { 'Key': apiKey, 'Sign': sign, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return await res.json();
}

async function sendTelegram(token: string, chatId: string, message: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('Telegram error:', e); }
}

// ============ Cancel Stale Orders ============
const STALE_ORDER_MS = 3 * 60 * 1000;
async function cancelStaleOrders(apiKey: string, secret: string, pair: string, telegramToken: string, chatId: string, notifyTelegram: boolean) {
  const coinSymbol = pair.replace('_idr', '');
  try {
    const openOrders = await indodaxTrade(apiKey, secret, 'openOrders', { pair });
    if (!openOrders?.return?.orders || !Array.isArray(openOrders.return.orders)) return { cancelled: 0, reordered: 0 };
    let cancelledCount = 0, reorderedCount = 0;
    const now = Date.now();
    for (const order of openOrders.return.orders) {
      const orderTime = Number(order.submit_time) * 1000;
      if (now - orderTime > STALE_ORDER_MS) {
        const orderType = order.type as 'buy' | 'sell';
        const cancelResult = await indodaxTrade(apiKey, secret, 'cancelOrder', { pair, order_id: order.order_id.toString(), type: orderType });
        if (cancelResult?.success === 1 || cancelResult?.return) {
          cancelledCount++;
          const tickerRes = await fetch(`https://indodax.com/api/ticker/${coinSymbol}idr`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const tickerData = await tickerRes.json();
          const newPrice = Math.floor(Number(tickerData?.ticker?.last || 0));
          if (newPrice > 0) {
            const reorderParams: Record<string, string> = { pair, type: orderType, price: newPrice.toString() };
            if (orderType === 'buy') {
              const idrAmount = order.order_idr || order.remain_idr || '0';
              if (Number(idrAmount) >= 100000) { reorderParams.idr = Math.floor(Number(idrAmount)).toString(); await indodaxTrade(apiKey, secret, 'trade', reorderParams); reorderedCount++; }
            } else {
              const coinAmount = order[coinSymbol] || '0';
              if (Number(coinAmount) > 0) { reorderParams[coinSymbol] = coinAmount; await indodaxTrade(apiKey, secret, 'trade', reorderParams); reorderedCount++; }
            }
          }
        }
      }
    }
    return { cancelled: cancelledCount, reordered: reorderedCount };
  } catch (err) { console.error(`[${pair}] Stale orders error:`, err); return { cancelled: 0, reordered: 0 }; }
}

// ============ Fixed Capital Allocation (Isolated Compounding / Silo) ============
const COIN_ALLOCATION: Record<string, number> = {
  btc: 400000, eth: 400000, sol: 400000, bnb: 400000, link: 400000, icp: 200000,
};
function getInitialCapital(coinSymbol: string): number {
  return COIN_ALLOCATION[coinSymbol.toLowerCase()] || 400000;
}

// ============ PRO-LEVEL CONFLUENCE SCORING ============
// Score meanings:
//  H4 Trend aligned:     +1
//  Liquidity Sweep (AMD):+2  ← THE MANIPULATION FILTER (strongest signal)
//  Price at FVG:         +1  ← INSTITUTIONAL IMBALANCE ZONE
//  Near Support/Resist:  +2
//  Near Fib level:       +1
//  RSI oversold <30:     +2, <40: +1
//  Stoch K <20:          +1, crossed up: +1
//  Bullish candle:       +2
//  Volume confirmed:     +1
//  ADX > 20:             +1  (trend strength)
//  TRAMA below price:    +1  (price above adaptive MA = bullish)
// BUY threshold: 5/14 (was 5/10) — easier to trigger with more signals
// SELL threshold: 4/10

// ============ MAIN HANDLER ============
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const envApiKey = Deno.env.get('INDODAX_API_KEY')!;
    const envSecret = Deno.env.get('INDODAX_SECRET')!;
    const envTelegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const envChatId = Deno.env.get('TELEGRAM_CHAT_ID')!;

    const { data: configs } = await supabase
      .from('auto_trade_config')
      .select('*')
      .eq('enabled', true)
      .eq('strategy', 'trend-following');

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: 'No active configs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];
    const INDODAX_FEE_RATE = 0.003;
    const MIN_ORDER_IDR = 100000;

    for (const config of configs) {
      let apiKey = envApiKey, secret = envSecret, telegramToken = envTelegramToken, chatId = envChatId;

      if (config.user_id) {
        const { data: usr } = await supabase.from('trading_users').select('indodax_api_key, indodax_secret, telegram_bot_token, telegram_chat_id').eq('id', config.user_id).single();
        if (usr) {
          if (usr.indodax_api_key) apiKey = usr.indodax_api_key;
          if (usr.indodax_secret) secret = usr.indodax_secret;
          if (usr.telegram_bot_token) telegramToken = usr.telegram_bot_token;
          if (usr.telegram_chat_id) chatId = usr.telegram_chat_id;
        }
      }

      const coinSymbol = config.pair.replace('_idr', '');
      const symbol = coinSymbol.toUpperCase() + 'IDR';

      try {
        // ── EMERGENCY BRAKE: Global 10% drawdown → sell all coins first, then stop ──
        const initialCap = config.initial_capital || getInitialCapital(coinSymbol);
        if (isEmergencyBrake(initialCap, config.current_capital)) {
          let emergencySellMsg = '';
          let emergencySellPrice = 0;

          // Step 1: Sell all coin balance before stopping
          try {
            const infoRes = await indodaxTrade(apiKey, secret, 'getInfo');
            const coinBal = Number(infoRes?.return?.balance?.[coinSymbol] || 0);

            if (coinBal > 0) {
              // Get current market price
              const tickerRes = await fetch(`https://indodax.com/api/ticker/${coinSymbol}idr`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
              const tickerData = await tickerRes.json();
              emergencySellPrice = Math.floor(Number(tickerData?.ticker?.last || 0));

              if (emergencySellPrice > 0) {
                const sellParams: Record<string, string> = {
                  pair: config.pair,
                  type: 'sell',
                  price: emergencySellPrice.toString(),
                  [coinSymbol]: coinBal.toString(),
                };
                const sellResult = await indodaxTrade(apiKey, secret, 'trade', sellParams);
                const sellTotal = coinBal * emergencySellPrice;
                const fee = sellTotal * 0.003;
                const profitLoss = config.entry_price ? sellTotal - (config.entry_price * coinBal) - fee : -fee;

                // Log the emergency sell trade
                await supabase.from('trade_history').insert({
                  pair: config.pair,
                  type: 'sell',
                  price: emergencySellPrice,
                  amount: coinBal,
                  total: sellTotal,
                  strategy: config.strategy || 'trend-following',
                  profit_loss: profitLoss,
                  balance_after: (config.current_capital || 0) + sellTotal - fee,
                });

                emergencySellMsg = `\n🔴 JUAL DARURAT: ${coinBal.toFixed(8)} ${coinSymbol.toUpperCase()} @ Rp ${emergencySellPrice.toLocaleString('id-ID')}\n💵 Total: Rp ${Math.floor(sellTotal).toLocaleString('id-ID')}`;
                console.log(`[${config.pair}] Emergency sell executed: ${coinBal} @ ${emergencySellPrice}`, sellResult);
              }
            }
          } catch (sellErr) {
            console.error(`[${config.pair}] Emergency sell failed:`, sellErr);
            emergencySellMsg = '\n⚠️ Jual darurat GAGAL — harap jual manual!';
          }

          // Step 2: Disable bot
          await supabase.from('auto_trade_config').update({
            enabled: false,
            status: 'emergency_brake',
            position: 'none',
            entry_price: null,
            entry_time: null,
            last_check_at: new Date().toISOString(),
          }).eq('id', config.id);

          if (config.notify_telegram && telegramToken && chatId) {
            await sendTelegram(telegramToken, chatId,
              `🚨 <b>EMERGENCY BRAKE AKTIF</b> ${coinSymbol.toUpperCase()}/IDR\n` +
              `⛔ Drawdown melebihi 10%! Bot dihentikan otomatis.${emergencySellMsg}\n` +
              `💼 Modal awal: Rp ${Math.floor(initialCap).toLocaleString('id-ID')}\n` +
              `💼 Modal saat ini: Rp ${Math.floor(config.current_capital).toLocaleString('id-ID')}`
            );
          }
          results.push({ pair: config.pair, status: 'emergency_brake', message: 'Bot stopped: 10% drawdown limit reached, coin sold' });
          continue;
        }

        // ── Cancel stale orders ──
        const cancelResult = await cancelStaleOrders(apiKey, secret, config.pair, telegramToken, chatId, config.notify_telegram);
        if (cancelResult.cancelled > 0 && cancelResult.reordered > 0) {
          results.push({ pair: config.pair, status: 'reordered', cancelled: cancelResult.cancelled });
          continue;
        }

        // ── STEP 1: H4 Candles → Trend (EMA 50/200) ──
        const h4Candles = await fetchCandles(symbol, '240', 250);
        if (h4Candles.length < 200) {
          results.push({ pair: config.pair, status: 'skipped', reason: 'insufficient H4 candles' });
          continue;
        }
        const { trend, ema50: h4Ema50, ema200: h4Ema200 } = detectTrend(h4Candles);

        // ── STEP 2: H1 Candles → Entry indicators ──
        const h1Candles = await fetchCandles(symbol, '60', 150);
        if (h1Candles.length < 30) {
          results.push({ pair: config.pair, status: 'skipped', reason: 'insufficient H1 candles' });
          continue;
        }

        const currentPrice = h1Candles[h1Candles.length - 1].close;
        const closes = h1Candles.map(c => c.close);
        const rsiValues = rsi(closes, 14);
        const atrValues = atr(h1Candles, 14);
        const currentRsi = rsiValues[rsiValues.length - 1];
        const currentAtr = atrValues[atrValues.length - 1];
        const adxValue = adx(h1Candles, 14);
        const stoch = stochRsi(closes, 14, 14);

        // TRAMA check (price above TRAMA = bullish momentum)
        const tramaValue = trama(closes, Math.min(closes.length - 1, 50)); // use 50 period for H1
        const priceAboveTrama = currentPrice > tramaValue;

        // Support / Resistance
        const support = getSwingLow(h1Candles, 20);
        const resistance = getSwingHigh(h1Candles, 20);
        const longSwingHigh = getSwingHigh(h1Candles, 50);
        const longSwingLow = getSwingLow(h1Candles, 50);
        const fib = getFibLevels(longSwingHigh, longSwingLow);
        const nextResistance = getNextResistance(h1Candles, currentPrice, 50);

        // ── FVG Detection (last 30 candles) ──
        const fvgs = detectFVGs(h1Candles, 30);
        const fvgCheck = checkPriceAtFVG(currentPrice, fvgs);

        // ── Liquidity Sweep (AMD Anti-Manipulation Filter) ──
        const sweep = detectLiquiditySweep(h1Candles, support);

        // ── Volume ──
        const volConfirmed = isVolumeConfirmed(h1Candles);

        // ── ATR threshold for volatility ──
        const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
        const atrThreshold = avgPrice * 0.005; // 0.5% of price = high volatility

        const currentPosition = config.position || 'none';

        let action: 'buy' | 'sell' | null = null;
        let reason = '';
        let signalScore = 0;
        let buyLayers = 1; // Pyramiding: 1 = single entry, 2 = second layer

        // ─────────────────────────────────────────────────────────
        // CHECK: Chandelier Exit (Move SL to BEP at 2R profit)
        // ─────────────────────────────────────────────────────────
        let breakEvenSl = 0;
        if (currentPosition === 'long' && config.entry_price) {
          const atrSl = config.entry_price - (2 * currentAtr);
          const riskAmount = config.entry_price - atrSl;
          const bepTrigger = config.entry_price + (riskAmount * 2); // 2R profit trigger
          if (currentPrice >= bepTrigger) {
            breakEvenSl = config.entry_price * 1.001; // SL moves to BEP (+0.1%)
          }
          // Hard SL check
          const effectiveSl = breakEvenSl > 0 ? breakEvenSl : atrSl;
          if (currentPrice <= effectiveSl) {
            action = 'sell';
            reason = `⛔ STOP LOSS${breakEvenSl > 0 ? ' (BEP)' : ' (ATR×2)'} | Entry=${Math.floor(config.entry_price).toLocaleString('id-ID')} SL=${Math.floor(effectiveSl).toLocaleString('id-ID')} Price=${Math.floor(currentPrice).toLocaleString('id-ID')}`;
          }
          // Take Profit check
          if (!action && currentPrice >= config.entry_price * (1 + (config.tp_pct || 5) / 100)) {
            action = 'sell';
            reason = `✅ TAKE PROFIT (${config.tp_pct}%) | Entry=${Math.floor(config.entry_price).toLocaleString('id-ID')} Price=${Math.floor(currentPrice).toLocaleString('id-ID')}`;
          }
        }

        // ─────────────────────────────────────────────────────────
        // PRO-LEVEL CONFLUENCE SCORING
        // ─────────────────────────────────────────────────────────
        if (!action) {

          // ══ BUY SIGNAL: Any trend + Liquidity Sweep OR FVG ══
          // In BEARISH trend: only buy if strong reversal signals (Indodax spot = cash when bearish)
          if (currentPosition === 'none') {
            signalScore = 0;
            const signalReasons: string[] = [];

            // Base: H4 Trend (BULLISH = +1, BEARISH = don't trade, NEUTRAL = -1)
            if (trend === 'BULLISH') { signalScore += 1; signalReasons.push('H4 Bullish'); }
            else if (trend === 'BEARISH') {
              // In BEARISH trend on Indodax Spot → stay 100% cash, skip
              await supabase.from('auto_trade_config').update({ last_check_at: new Date().toISOString() }).eq('id', config.id);
              results.push({ pair: config.pair, status: 'waiting', trend: 'BEARISH', reason: 'Bearish H4: 100% cash mode' });
              continue;
            }

            // THE MANIPULATION FILTER (AMD) - Liquidity Sweep is the strongest signal
            if (sweep.detected && sweep.recoveryConfirmed) {
              signalScore += 2;
              signalReasons.push(`🎯 Liquidity Sweep (AMD)`);
            }

            // FVG INSTITUTIONAL ZONE
            if (fvgCheck.atFVG && fvgCheck.fvgType === 'bullish') {
              signalScore += 1;
              signalReasons.push(`📦 Bullish FVG Zone`);
            }

            // Near support
            const nearSupport = currentPrice <= support * 1.02;
            if (nearSupport) { signalScore += 2; signalReasons.push('At Support'); }

            // Fibonacci levels
            const nearFib618 = Math.abs(currentPrice - fib.fib618) / currentPrice < 0.015;
            const nearFib500 = Math.abs(currentPrice - fib.fib500) / currentPrice < 0.015;
            const nearFib382 = Math.abs(currentPrice - fib.fib382) / currentPrice < 0.015;
            if (nearFib618) { signalScore += 1; signalReasons.push('Fib 61.8%'); }
            else if (nearFib500) { signalScore += 1; signalReasons.push('Fib 50%'); }
            else if (nearFib382) { signalScore += 1; signalReasons.push('Fib 38.2%'); }

            // RSI
            if (currentRsi < 30) { signalScore += 2; signalReasons.push(`RSI oversold (${currentRsi.toFixed(1)})`); }
            else if (currentRsi < 40) { signalScore += 1; signalReasons.push(`RSI low (${currentRsi.toFixed(1)})`); }

            // Stochastic RSI
            if (stoch.k < 20) { signalScore += 1; signalReasons.push(`Stoch oversold (${stoch.k.toFixed(1)})`); }
            else if (stoch.k < 35 && stoch.k > stoch.d) { signalScore += 1; signalReasons.push('Stoch crossed up'); }

            // Bullish candle
            const bullCandle = isBullishReversal(h1Candles);
            if (bullCandle.confirmed) { signalScore += 2; signalReasons.push(bullCandle.pattern); }

            // Volume confirmation
            if (volConfirmed) { signalScore += 1; signalReasons.push('Vol confirmed'); }

            // ADX strength
            if (adxValue > 20) { signalScore += 1; signalReasons.push(`ADX ${adxValue.toFixed(0)}`); }

            // TRAMA (price above adaptive MA = uptrend)
            if (priceAboveTrama) { signalScore += 1; signalReasons.push('Above TRAMA'); }

            // THRESHOLD: minimum 5 to trigger BUY
            if (signalScore >= 5) {
              const riskAtr = 2 * currentAtr;
              const slPrice = Math.max(support - riskAtr, currentPrice * 0.95);
              const tpPrice = fvgCheck.atFVG ? fvgCheck.fvgMid * 1.01 : Math.min(nextResistance, resistance);
              const riskAmount = currentPrice - slPrice;
              const rewardAmount = tpPrice - currentPrice;

              // R:R >= 1.5 minimum (relaxed from 2.0 for crypto volatility)
              if (riskAmount > 0 && rewardAmount / riskAmount >= 1.5) {
                action = 'buy';
                reason = `🟢 BUY (Score ${signalScore}) | ${signalReasons.join(' | ')} | R:R=${( rewardAmount / riskAmount).toFixed(1)}:1`;
              }
            }
          }

          // ══ EXIT (SELL) SIGNAL: Bullish position, hit resistance or bearish reversal ══
          if (!action && currentPosition === 'long') {
            signalScore = 0;
            const signalReasons: string[] = [];

            if (adxValue > 20) { signalScore += 1; signalReasons.push(`ADX ${adxValue.toFixed(0)}`); }
            const nearResistance = currentPrice >= resistance * 0.985;
            if (nearResistance) { signalScore += 2; signalReasons.push('At Resistance'); }
            const atFib = Math.abs(currentPrice - fib.fib382) / currentPrice < 0.02;
            if (atFib) { signalScore += 1; signalReasons.push('Fib 38.2%'); }
            if (currentRsi > 70) { signalScore += 2; signalReasons.push(`RSI overbought (${currentRsi.toFixed(1)})`); }
            else if (currentRsi > 60) { signalScore += 1; signalReasons.push(`RSI high (${currentRsi.toFixed(1)})`); }
            if (stoch.k > 80) { signalScore += 1; signalReasons.push('Stoch overbought'); }
            const bearCandle = isBearishReversal(h1Candles);
            if (bearCandle.confirmed) { signalScore += 2; signalReasons.push(bearCandle.pattern); }
            if (fvgCheck.atFVG && fvgCheck.fvgType === 'bearish') { signalScore += 1; signalReasons.push('Bearish FVG'); }
            if (trend === 'BEARISH') { signalScore += 2; signalReasons.push('H4 Turned Bearish'); }

            if (signalScore >= 4) {
              action = 'sell';
              reason = `🔴 SELL (Score ${signalScore}) | ${signalReasons.join(' | ')}`;
            }
          }
        }

        // ── No action: update status and continue ──
        if (!action) {
          await supabase.from('auto_trade_config').update({ last_check_at: new Date().toISOString() }).eq('id', config.id);
          results.push({
            pair: config.pair, status: 'waiting', trend, position: currentPosition,
            support: Math.floor(support), resistance: Math.floor(resistance),
            rsi: currentRsi.toFixed(1), adx: adxValue.toFixed(1), atr: Math.floor(currentAtr),
            stochK: stoch.k.toFixed(1), fib618: Math.floor(fib.fib618),
            signalScore, fvg: fvgCheck.atFVG, sweep: sweep.detected,
            trama: Math.floor(tramaValue), priceAboveTrama,
          });
          continue;
        }

        // ─────────────────────────────────────────────────────────
        // EXECUTE TRADE (with Dynamic Risk Sizing + Slippage Control)
        // ─────────────────────────────────────────────────────────
        let tradeResult: any;
        let amount = 0;
        let total = 0;

        if (action === 'buy') {
          const infoResBuy = await indodaxTrade(apiKey, secret, 'getInfo');
          const existingBalance = parseFloat(infoResBuy?.return?.balance?.[coinSymbol] || '0');
          const existingValue = existingBalance * currentPrice;
          if (existingBalance > 0 && existingValue >= MIN_ORDER_IDR * 0.5) {
            await supabase.from('auto_trade_config').update({
              position: 'long', entry_price: currentPrice, entry_time: new Date().toISOString(), last_check_at: new Date().toISOString(),
            }).eq('id', config.id);
            results.push({ pair: config.pair, status: 'position_synced', balance: existingBalance });
            continue;
          }

          // Dynamic risk sizing (reduce size in high volatility)
          const maxRiskIdr = calculateDynamicRiskSize(config.current_capital, currentPrice, currentAtr, atrThreshold);
          const riskPerCoin = 2 * currentAtr;
          let orderIdr = config.current_capital;
          if (riskPerCoin > 0) {
            const maxCoinsForRisk = maxRiskIdr / riskPerCoin;
            const maxIdrForRisk = maxCoinsForRisk * currentPrice;
            orderIdr = Math.min(orderIdr, maxIdrForRisk);
          }
          orderIdr = Math.max(Math.floor(orderIdr), MIN_ORDER_IDR);
          orderIdr = Math.min(orderIdr, Math.floor(config.current_capital));

          if (config.current_capital < MIN_ORDER_IDR) {
            results.push({ pair: config.pair, status: 'skipped', reason: 'Capital too low (< 100k IDR)' });
            continue;
          }

          // SLIPPAGE CONTROL: Get real-time order book price
          const tickerRes = await fetch(`https://indodax.com/api/ticker/${coinSymbol}idr`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const tickerData = await tickerRes.json();
          const livePrice = Number(tickerData?.ticker?.last || currentPrice);
          const slippage = Math.abs(livePrice - currentPrice) / currentPrice;
          if (slippage > 0.002) { // > 0.2% slippage → cancel
            results.push({ pair: config.pair, status: 'skipped', reason: `Slippage terlalu tinggi (${(slippage * 100).toFixed(2)}%) - order dibatalkan` });
            continue;
          }
          const execPrice = livePrice;

          const tradeParams: Record<string, string> = {
            pair: `${coinSymbol}_idr`, type: 'buy',
            price: Math.floor(execPrice).toString(), idr: orderIdr.toString(),
          };
          console.log(`[${config.pair}] BUY:`, JSON.stringify(tradeParams), reason);
          tradeResult = await indodaxTrade(apiKey, secret, 'trade', tradeParams);

          if (tradeResult?.success !== 1 && !tradeResult?.return) {
            const errMsg = tradeResult?.error || 'Order BUY rejected by Indodax';
            if (config.notify_telegram) await sendTelegram(telegramToken, chatId, `❌ <b>BUY GAGAL</b> ${coinSymbol.toUpperCase()}/IDR\n⚠️ ${errMsg}\n📍 ${reason}`);
            results.push({ pair: config.pair, status: 'failed', error: errMsg });
            continue;
          }

          const buyFee = orderIdr * INDODAX_FEE_RATE;
          amount = (orderIdr - buyFee) / execPrice;
          total = orderIdr;

        } else {
          // SELL
          const infoRes = await indodaxTrade(apiKey, secret, 'getInfo');
          const coinBalance = parseFloat(infoRes?.return?.balance?.[coinSymbol] || '0');
          if (coinBalance <= 0) {
            await supabase.from('auto_trade_config').update({ position: 'none', entry_price: null, entry_time: null, last_check_at: new Date().toISOString() }).eq('id', config.id);
            results.push({ pair: config.pair, status: 'skipped', reason: `No ${coinSymbol} balance to sell` });
            continue;
          }

          const tradeParams: Record<string, string> = {
            pair: `${coinSymbol}_idr`, type: 'sell',
            price: Math.floor(currentPrice).toString(), [coinSymbol]: coinBalance.toString(),
          };
          console.log(`[${config.pair}] SELL:`, JSON.stringify(tradeParams), reason);
          tradeResult = await indodaxTrade(apiKey, secret, 'trade', tradeParams);

          if (tradeResult?.success !== 1 && !tradeResult?.return) {
            const errMsg = tradeResult?.error || 'Order SELL rejected by Indodax';
            if (config.notify_telegram) await sendTelegram(telegramToken, chatId, `❌ <b>SELL GAGAL</b> ${coinSymbol.toUpperCase()}/IDR\n⚠️ ${errMsg}\n📍 ${reason}`);
            results.push({ pair: config.pair, status: 'failed', error: errMsg });
            continue;
          }

          const grossTotal = coinBalance * currentPrice;
          const sellFee = grossTotal * INDODAX_FEE_RATE;
          amount = coinBalance;
          total = grossTotal - sellFee;
        }

        // ── P&L + Isolated Compounding Update ──
        let profitLoss = 0;
        let newCapital = config.current_capital;

        if (action === 'buy') {
          newCapital = config.current_capital - total;
        } else {
          const entryCost = config.entry_price ? config.entry_price * amount : (config.initial_capital || getInitialCapital(coinSymbol));
          const fee = total * INDODAX_FEE_RATE;
          profitLoss = total - entryCost - fee;
          newCapital = config.current_capital + total; // Isolated compounding
        }

        await supabase.from('auto_trade_config').update({
          position: action === 'buy' ? 'long' : 'none',
          status: action === 'buy' ? 'holding' : 'idle',
          current_capital: newCapital,
          current_balance: newCapital,
          entry_price: action === 'buy' ? currentPrice : null,
          entry_time: action === 'buy' ? new Date().toISOString() : null,
          last_check_at: new Date().toISOString(),
          last_trade_at: new Date().toISOString(),
          win_count: action === 'sell' && profitLoss > 0 ? (config.win_count || 0) + 1 : (config.win_count || 0),
          loss_count: action === 'sell' && profitLoss < 0 ? (config.loss_count || 0) + 1 : (config.loss_count || 0),
          total_pnl: (config.total_pnl || 0) + profitLoss,
        }).eq('id', config.id);

        await supabase.from('trade_history').insert({
          pair: config.pair, type: action, price: currentPrice,
          amount, total, strategy: 'trend-following',
          profit_loss: profitLoss, balance_after: newCapital,
        });

        await supabase.from('auto_trade_log').insert({
          coin_symbol: coinSymbol.toUpperCase(), trade_type: action, price: currentPrice,
          coin_amount: amount, idr_value: total, pnl: profitLoss,
          pnl_pct: config.entry_price && action === 'sell' ? ((currentPrice - config.entry_price) / config.entry_price) * 100 : 0,
          reason, telegram_sent: config.notify_telegram,
        });

        // ── Telegram Rich Notification ──
        if (config.notify_telegram && telegramToken && chatId) {
          const trendEmoji = trend === 'BULLISH' ? '📈 BULLISH' : trend === 'BEARISH' ? '📉 BEARISH' : '↔️ NEUTRAL';
          const actionEmoji = action === 'buy' ? '🟢' : '🔴';
          const pnlLine = profitLoss !== 0
            ? `${profitLoss > 0 ? '💹 Profit' : '🔻 Loss'}: <b>Rp ${Math.abs(Math.floor(profitLoss)).toLocaleString('id-ID')}</b> (${profitLoss > 0 ? '+' : ''}${config.entry_price ? ((currentPrice - config.entry_price) / config.entry_price * 100).toFixed(2) : '0'}%)\n`
            : '';
          const msg =
            `${actionEmoji} <b>${action.toUpperCase()} ${coinSymbol.toUpperCase()}/IDR</b> [PRO ALGO]\n` +
            `🧭 Tren H4: ${trendEmoji}\n` +
            `💰 Harga: <b>Rp ${Math.floor(currentPrice).toLocaleString('id-ID')}</b>\n` +
            `📊 Jumlah: ${amount.toFixed(8)} ${coinSymbol.toUpperCase()}\n` +
            `💵 Total: Rp ${Math.floor(total).toLocaleString('id-ID')}\n` +
            pnlLine +
            `🔢 Score: ${signalScore} | RSI: ${currentRsi.toFixed(1)} | ADX: ${adxValue.toFixed(1)}\n` +
            `📐 ATR: ${Math.floor(currentAtr)} | Stoch K: ${stoch.k.toFixed(1)}\n` +
            `📦 FVG: ${fvgCheck.atFVG ? '✅ Di zona' : '❌ Tidak'} | 🎯 Sweep: ${sweep.detected ? '✅' : '❌'}\n` +
            `📈 TRAMA: ${Math.floor(tramaValue)} | Price ${priceAboveTrama ? '>' : '<'} TRAMA\n` +
            `📍 Support: Rp ${Math.floor(support).toLocaleString('id-ID')}\n` +
            `📍 Resistance: Rp ${Math.floor(resistance).toLocaleString('id-ID')}\n` +
            `💡 ${reason}\n` +
            `💼 Modal Koin: Rp ${Math.floor(newCapital).toLocaleString('id-ID')}\n` +
            `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
          await sendTelegram(telegramToken, chatId, msg);
        }

        results.push({ pair: config.pair, status: 'executed', action, trend, price: currentPrice, reason, signalScore, fvg: fvgCheck.atFVG, sweep: sweep.detected });

      } catch (tradeErr: unknown) {
        const errMsg = tradeErr instanceof Error ? tradeErr.message : String(tradeErr);
        console.error(`[${config.pair}] Trade error:`, errMsg);
        results.push({ pair: config.pair, status: 'error', error: errMsg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
