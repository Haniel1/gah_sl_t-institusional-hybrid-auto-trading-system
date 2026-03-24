import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ Types ============
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

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
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function atr(candles: Candle[], period = 14): number[] {
  const result = new Array(candles.length).fill(0);
  if (candles.length < 2) return result;
  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) sum += trs[i];
  result[period - 1] = sum / Math.min(period, trs.length);
  for (let i = period; i < trs.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + trs[i]) / period;
  }
  return result;
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
    })).sort((a: Candle, b: Candle) => a.time - b.time);
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
async function cancelStaleOrders(apiKey: string, secret: string, pair: string) {
  const coinSymbol = pair.replace('_idr', '');
  try {
    const openOrders = await indodaxTrade(apiKey, secret, 'openOrders', { pair });
    if (!openOrders?.return?.orders || !Array.isArray(openOrders.return.orders)) return 0;
    let cancelledCount = 0;
    const now = Date.now();
    for (const order of openOrders.return.orders) {
      const orderTime = Number(order.submit_time) * 1000;
      if (now - orderTime > STALE_ORDER_MS) {
        await indodaxTrade(apiKey, secret, 'cancelOrder', { pair, order_id: order.order_id.toString(), type: order.type });
        cancelledCount++;
      }
    }
    return cancelledCount;
  } catch { return 0; }
}

// ============ Shared Helpers ============
const INDODAX_FEE_RATE = 0.003;
const MIN_ORDER_IDR = 100000;
const GLOBAL_DRAWDOWN_LIMIT = 0.10;

function getSwingLow(candles: Candle[], period = 20): number {
  return Math.min(...candles.slice(-period).map(c => c.low));
}
function getSwingHigh(candles: Candle[], period = 20): number {
  return Math.max(...candles.slice(-period).map(c => c.high));
}
function detectFVGs(candles: Candle[], lookback = 20) {
  const zones: { type: 'bullish' | 'bearish'; top: number; bottom: number }[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i++) {
    const c1 = candles[i - 2], c3 = candles[i];
    if (c3.low > c1.high) zones.push({ type: 'bullish', top: c3.low, bottom: c1.high });
    else if (c3.high < c1.low) zones.push({ type: 'bearish', top: c1.low, bottom: c3.high });
  }
  return zones;
}
function detectLiquiditySweep(candles: Candle[], support: number): boolean {
  if (candles.length < 5) return false;
  for (let i = candles.length - 4; i < candles.length; i++) {
    if (candles[i].low < support * 0.999 && candles[candles.length - 1].close > support) return true;
  }
  return false;
}
function cumulativeDelta(candles: Candle[], window = 5): number {
  const slice = candles.slice(-window);
  let buyVol = 0, sellVol = 0;
  for (const c of slice) {
    if (c.close > c.open) buyVol += c.volume; else sellVol += c.volume;
  }
  return sellVol > 0 ? buyVol / sellVol : buyVol > 0 ? 10 : 1;
}
function isBullishReversal(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  const curr = candles[candles.length - 1], prev = candles[candles.length - 2];
  const bodySize = Math.abs(curr.close - curr.open);
  const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
  return (curr.close > curr.open && lowerShadow > bodySize * 2) ||
    (prev.close < prev.open && curr.close > curr.open && curr.close >= prev.open && bodySize > Math.abs(prev.close - prev.open));
}
function isBearishReversal(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  const curr = candles[candles.length - 1], prev = candles[candles.length - 2];
  const bodySize = Math.abs(curr.close - curr.open);
  const upperShadow = curr.high - Math.max(curr.open, curr.close);
  return (curr.close < curr.open && upperShadow > bodySize * 2) ||
    (prev.close > prev.open && curr.close < curr.open && curr.close <= prev.open && bodySize > Math.abs(prev.close - prev.open));
}

// ═══════════════════════════════════════════════════
// STRATEGY 1: ALPHA SIMONS (Momentum & Scalping)
// Real trading with Market Order (buy) and Limit Order (sell)
// ═══════════════════════════════════════════════════

const AS_HARD_SL = 0.02;
const AS_MAX_SPREAD = 0.008;
const AS_TS_ACTIVATION = 0.02;
const AS_TS_CALLBACK = 0.015;
const AS_MIN_GROSS_PROFIT = 0.01; // 1% gross min to sell for profit

function alphaSimonsSignal(ticker: any) {
  const last = parseFloat(ticker.last);
  const high = parseFloat(ticker.high);
  const low = parseFloat(ticker.low);
  const buy = parseFloat(ticker.buy);
  const sell = parseFloat(ticker.sell);
  const range = high - low;
  const position = range > 0 ? (last - low) / range : 0.5;
  const zScore = (position - 0.5) * 4;
  const spreadPct = (sell - buy) / last;
  const vol24h = parseFloat(ticker.vol_idr || '0');

  let score = 50;
  const reasons: string[] = [];

  if (zScore < -0.8 && position < 0.25) { score += 18; reasons.push('Oversold Anomaly'); }
  if (zScore > 0.8 && position > 0.75) { score -= 18; reasons.push('Overbought Anomaly'); }

  const price24h = parseFloat(ticker.price_24h || last);
  const change24h = price24h > 0 ? ((last - price24h) / price24h) * 100 : 0;
  if (change24h > 3) { score += 12; reasons.push('Strong Momentum'); }
  if (change24h < -5) { score -= 10; reasons.push('High Selling Pressure'); }

  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (score >= 62) action = 'BUY';
  else if (score <= 38) action = 'SELL';

  return { action, reasons, spreadPct, buyPrice: buy, sellPrice: sell };
}

// ═══════════════════════════════════════════════════
// STRATEGY 2: INSTITUTIONAL 3.0 (Smart Money Concepts)
// ═══════════════════════════════════════════════════

function institutionalSignal(h4Candles: Candle[], h1Candles: Candle[], currentPrice: number) {
  // Trend: EMA 200 H4
  const h4Closes = h4Candles.map(c => c.close);
  const ema200 = ema(h4Closes, 200);
  const lastEma200 = ema200[ema200.length - 1];
  const isBullish = lastEma200 > 0 && currentPrice > lastEma200;

  if (!isBullish) return { action: 'HOLD' as const, reasons: ['Bearish H4: cash mode'], score: 0 };

  const support = getSwingLow(h1Candles, 20);
  const resistance = getSwingHigh(h1Candles, 20);
  const hasSweep = detectLiquiditySweep(h1Candles, support);
  const fvgs = detectFVGs(h1Candles, 30);
  const atBullishFVG = fvgs.filter(f => f.type === 'bullish')
    .some(f => currentPrice >= f.bottom * 0.998 && currentPrice <= f.top * 1.002);
  const delta = cumulativeDelta(h1Candles, 5);
  const hasOrderFlow = delta >= 3.0;
  const closes = h1Candles.map(c => c.close);
  const rsiVals = rsi(closes, 14);
  const currentRsi = rsiVals[rsiVals.length - 1];
  const avgVol = h1Candles.slice(-20, -1).reduce((s, c) => s + c.volume, 0) / 19;
  const volConfirmed = h1Candles[h1Candles.length - 1].volume >= avgVol * 1.2;
  const bullCandle = isBullishReversal(h1Candles);

  // R:R check
  const atrValues = atr(h1Candles, 14);
  const currentAtr = atrValues[atrValues.length - 1];
  const slPrice = currentPrice - (currentAtr * 1.5);
  const riskAmount = currentPrice - slPrice;
  const rewardAmount = resistance - currentPrice;
  const rrOk = riskAmount > 0 && rewardAmount / riskAmount >= 2.0;

  let score = 0;
  const reasons: string[] = ['H4 Bullish (>EMA200)'];
  if (hasSweep) { score += 2; reasons.push('Liquidity Sweep'); }
  if (atBullishFVG) { score += 1; reasons.push('Bullish FVG'); }
  if (hasOrderFlow) { score += 1; reasons.push(`OrderFlow (${delta.toFixed(1)})`); }
  if (currentRsi < 40) { score += 1; reasons.push(`RSI ${currentRsi.toFixed(0)}`); }
  if (volConfirmed) { score += 1; reasons.push('Vol✓'); }
  if (bullCandle) { score += 1; reasons.push('Bullish candle'); }

  const shouldBuy = score >= 3 && rrOk;
  if (shouldBuy) reasons.push(`R:R ${(rewardAmount / riskAmount).toFixed(1)}:1`);

  // Sell signals for existing positions
  const bearCandle = isBearishReversal(h1Candles);
  const bearFVG = fvgs.filter(f => f.type === 'bearish')
    .some(f => currentPrice >= f.bottom * 0.998 && currentPrice <= f.top * 1.002);
  let sellScore = 0;
  const sellReasons: string[] = [];
  if (currentRsi > 70) { sellScore += 2; sellReasons.push(`RSI ${currentRsi.toFixed(0)}`); }
  if (bearCandle) { sellScore += 2; sellReasons.push('Bearish candle'); }
  if (bearFVG) { sellScore += 1; sellReasons.push('Bearish FVG'); }
  if (currentPrice >= resistance * 0.985) { sellScore += 2; sellReasons.push('At Resistance'); }

  return {
    action: shouldBuy ? 'BUY' as const : (sellScore >= 3 ? 'SELL' as const : 'HOLD' as const),
    reasons: shouldBuy ? reasons : (sellScore >= 3 ? sellReasons : ['No signal']),
    score: shouldBuy ? score : sellScore,
  };
}

// ============ MAIN HANDLER ============
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const envApiKey = Deno.env.get('INDODAX_API_KEY')!;
    const envSecret = Deno.env.get('INDODAX_SECRET')!;
    const envTelegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const envChatId = Deno.env.get('TELEGRAM_CHAT_ID')!;

    // Process both strategies
    const strategiesToProcess = ['alpha_simons', 'institutional_smc'];
    const allResults: any[] = [];

    for (const strategyName of strategiesToProcess) {
      const { data: configs } = await supabase
        .from('auto_trade_config')
        .select('*')
        .eq('enabled', true)
        .eq('strategy', strategyName);

      if (!configs || configs.length === 0) continue;

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
          // Emergency brake
          const initialCap = config.initial_capital || 400000;
          if ((initialCap - config.current_capital) / initialCap >= GLOBAL_DRAWDOWN_LIMIT) {
            // Sell coins if holding
            try {
              const infoRes = await indodaxTrade(apiKey, secret, 'getInfo');
              const coinBal = Number(infoRes?.return?.balance?.[coinSymbol] || 0);
              if (coinBal > 0) {
                const tickerRes = await fetch(`https://indodax.com/api/ticker/${coinSymbol}idr`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const tickerData = await tickerRes.json();
                const price = Math.floor(Number(tickerData?.ticker?.last || 0));
                if (price > 0) {
                  await indodaxTrade(apiKey, secret, 'trade', { pair: config.pair, type: 'sell', price: price.toString(), [coinSymbol]: coinBal.toString() });
                  await supabase.from('trade_history').insert({
                    pair: config.pair, type: 'sell', price, amount: coinBal,
                    total: coinBal * price, strategy: strategyName,
                    profit_loss: config.entry_price ? (coinBal * price) - (config.entry_price * coinBal) : 0,
                    balance_after: config.current_capital + coinBal * price * (1 - INDODAX_FEE_RATE),
                  });
                }
              }
            } catch (e) { console.error('Emergency sell failed:', e); }

            await supabase.from('auto_trade_config').update({
              enabled: false, status: 'emergency_brake', position: 'none',
              entry_price: null, entry_time: null, last_check_at: new Date().toISOString(),
            }).eq('id', config.id);

            if (config.notify_telegram && telegramToken && chatId) {
              await sendTelegram(telegramToken, chatId,
                `🚨 <b>EMERGENCY BRAKE</b> ${coinSymbol.toUpperCase()} [${strategyName}]\n⛔ Drawdown >10%! Bot dihentikan.`);
            }
            allResults.push({ pair: config.pair, strategy: strategyName, status: 'emergency_brake' });
            continue;
          }

          // Cancel stale orders
          await cancelStaleOrders(apiKey, secret, config.pair);

          const currentPosition = config.position || 'none';
          let action: 'buy' | 'sell' | null = null;
          let reason = '';

          if (strategyName === 'alpha_simons') {
            // ═══ ALPHA SIMONS: Use ticker data ═══
            const tickerRes = await fetch(`https://indodax.com/api/ticker/${coinSymbol}idr`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const tickerData = await tickerRes.json();
            const ticker = tickerData?.ticker;
            if (!ticker) { allResults.push({ pair: config.pair, strategy: strategyName, status: 'no_ticker' }); continue; }

            const signal = alphaSimonsSignal(ticker);
            const currentPrice = parseFloat(ticker.last);

            if (currentPosition === 'long' && config.entry_price) {
              const buyPrice = signal.buyPrice; // Bid price for selling
              const pnlPct = (buyPrice - config.entry_price) / config.entry_price;
              let highestPrice = Number(config.coin_balance) > 0 ? (config.entry_price * 1.0) : config.entry_price; // Simplified

              // Hard Stop Loss (Market Order)
              if (pnlPct <= -AS_HARD_SL) {
                action = 'sell'; reason = `⛔ HARD SL (${(pnlPct * 100).toFixed(2)}%) Market Order`;
              }
              // Signal sell with min profit check
              else if (signal.action === 'SELL' && pnlPct >= AS_MIN_GROSS_PROFIT) {
                action = 'sell'; reason = `🔴 Signal SELL (${(pnlPct * 100).toFixed(2)}%) | ${signal.reasons.join(', ')}`;
              }
            } else if (currentPosition === 'none') {
              if (signal.action === 'BUY' && signal.spreadPct <= AS_MAX_SPREAD) {
                action = 'buy'; reason = `🟢 Alpha Simons BUY | Spread ${(signal.spreadPct * 100).toFixed(2)}% | ${signal.reasons.join(', ')}`;
              }
            }
          } else if (strategyName === 'institutional_smc') {
            // ═══ INSTITUTIONAL: Use candle data ═══
            const h4Candles = await fetchCandles(symbol, '240', 250);
            const h1Candles = await fetchCandles(symbol, '60', 150);
            if (h4Candles.length < 200 || h1Candles.length < 30) {
              allResults.push({ pair: config.pair, strategy: strategyName, status: 'insufficient_data' });
              continue;
            }

            const currentPrice = h1Candles[h1Candles.length - 1].close;
            const signal = institutionalSignal(h4Candles, h1Candles, currentPrice);

            if (currentPosition === 'long' && config.entry_price) {
              const pnlPct = (currentPrice - config.entry_price) / config.entry_price;
              // Hard SL
              if (pnlPct <= -0.02) {
                action = 'sell'; reason = `⛔ HARD SL (${(pnlPct * 100).toFixed(2)}%) Market Order`;
              }
              // TP at R:R 1:2
              else if (pnlPct >= 0.04) {
                action = 'sell'; reason = `✅ TP R:R 1:2 (${(pnlPct * 100).toFixed(2)}%)`;
              }
              // Signal sell
              else if (signal.action === 'SELL' && pnlPct >= INDODAX_FEE_RATE * 2) {
                action = 'sell'; reason = `🔴 Institutional SELL | ${signal.reasons.join(', ')}`;
              }
            } else if (currentPosition === 'none' && signal.action === 'BUY') {
              action = 'buy'; reason = `🟢 Institutional BUY (Score ${signal.score}) | ${signal.reasons.join(', ')}`;
            }
          }

          // No action
          if (!action) {
            await supabase.from('auto_trade_config').update({ last_check_at: new Date().toISOString() }).eq('id', config.id);
            allResults.push({ pair: config.pair, strategy: strategyName, status: 'waiting' });
            continue;
          }

          // ═══ EXECUTE TRADE ═══
          const tickerRes2 = await fetch(`https://indodax.com/api/ticker/${coinSymbol}idr`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const tickerData2 = await tickerRes2.json();
          const execPrice = Math.floor(Number(tickerData2?.ticker?.last || 0));
          if (execPrice <= 0) { allResults.push({ pair: config.pair, status: 'no_price' }); continue; }

          let tradeResult: any;
          let amount = 0;
          let total = 0;

          if (action === 'buy') {
            if (config.current_capital < MIN_ORDER_IDR) {
              allResults.push({ pair: config.pair, strategy: strategyName, status: 'capital_too_low' });
              continue;
            }
            const orderIdr = Math.min(Math.floor(config.current_capital), Math.floor(config.current_capital));
            // Use ask price for buy (market order simulation)
            const askPrice = Number(tickerData2?.ticker?.sell || execPrice);
            const tradeParams: Record<string, string> = {
              pair: `${coinSymbol}_idr`, type: 'buy',
              price: Math.floor(askPrice).toString(), idr: orderIdr.toString(),
            };
            console.log(`[${config.pair}] ${strategyName} BUY:`, JSON.stringify(tradeParams));
            tradeResult = await indodaxTrade(apiKey, secret, 'trade', tradeParams);

            if (tradeResult?.success !== 1 && !tradeResult?.return) {
              if (config.notify_telegram) await sendTelegram(telegramToken, chatId, `❌ BUY GAGAL ${coinSymbol.toUpperCase()} [${strategyName}]\n${tradeResult?.error || 'Unknown error'}`);
              allResults.push({ pair: config.pair, strategy: strategyName, status: 'failed', error: tradeResult?.error });
              continue;
            }

            const buyFee = orderIdr * INDODAX_FEE_RATE;
            amount = (orderIdr - buyFee) / askPrice;
            total = orderIdr;
          } else {
            // SELL
            const infoRes = await indodaxTrade(apiKey, secret, 'getInfo');
            const coinBalance = parseFloat(infoRes?.return?.balance?.[coinSymbol] || '0');
            if (coinBalance <= 0) {
              await supabase.from('auto_trade_config').update({ position: 'none', entry_price: null, entry_time: null, last_check_at: new Date().toISOString() }).eq('id', config.id);
              allResults.push({ pair: config.pair, strategy: strategyName, status: 'no_balance' });
              continue;
            }

            // Use bid price for sell
            const bidPrice = Number(tickerData2?.ticker?.buy || execPrice);
            const isSL = reason.includes('HARD SL');
            // SL = Market Order, TP = Limit Order at ask
            const sellPriceUsed = isSL ? Math.floor(bidPrice) : Math.floor(Number(tickerData2?.ticker?.sell || bidPrice));

            const tradeParams: Record<string, string> = {
              pair: `${coinSymbol}_idr`, type: 'sell',
              price: sellPriceUsed.toString(), [coinSymbol]: coinBalance.toString(),
            };
            console.log(`[${config.pair}] ${strategyName} SELL:`, JSON.stringify(tradeParams));
            tradeResult = await indodaxTrade(apiKey, secret, 'trade', tradeParams);

            if (tradeResult?.success !== 1 && !tradeResult?.return) {
              if (config.notify_telegram) await sendTelegram(telegramToken, chatId, `❌ SELL GAGAL ${coinSymbol.toUpperCase()} [${strategyName}]\n${tradeResult?.error || 'Unknown error'}`);
              allResults.push({ pair: config.pair, strategy: strategyName, status: 'failed', error: tradeResult?.error });
              continue;
            }

            const grossTotal = coinBalance * sellPriceUsed;
            const sellFee = grossTotal * INDODAX_FEE_RATE;
            amount = coinBalance;
            total = grossTotal - sellFee;
          }

          // P&L + DB updates
          let profitLoss = 0;
          let newCapital = config.current_capital;

          if (action === 'buy') {
            newCapital = config.current_capital - total;
          } else {
            const entryCost = config.entry_price ? config.entry_price * amount : config.initial_capital;
            profitLoss = total - entryCost;
            newCapital = config.current_capital + total;
          }

          await supabase.from('auto_trade_config').update({
            position: action === 'buy' ? 'long' : 'none',
            status: action === 'buy' ? 'holding' : 'idle',
            current_capital: newCapital, current_balance: newCapital,
            entry_price: action === 'buy' ? execPrice : null,
            entry_time: action === 'buy' ? new Date().toISOString() : null,
            last_check_at: new Date().toISOString(),
            last_trade_at: new Date().toISOString(),
            win_count: action === 'sell' && profitLoss > 0 ? (config.win_count || 0) + 1 : config.win_count || 0,
            loss_count: action === 'sell' && profitLoss < 0 ? (config.loss_count || 0) + 1 : config.loss_count || 0,
            total_pnl: (config.total_pnl || 0) + profitLoss,
          }).eq('id', config.id);

          await supabase.from('trade_history').insert({
            pair: config.pair, type: action, price: execPrice,
            amount, total, strategy: strategyName,
            profit_loss: profitLoss, balance_after: newCapital,
          });

          // Telegram
          if (config.notify_telegram && telegramToken && chatId) {
            const emoji = action === 'buy' ? '🟢' : '🔴';
            const stratLabel = strategyName === 'alpha_simons' ? '⚡ Alpha Simons' : '🏛️ Institutional 3.0';
            const pnlLine = profitLoss !== 0 ? `${profitLoss > 0 ? '💹' : '🔻'} P&L: Rp ${Math.abs(Math.floor(profitLoss)).toLocaleString('id-ID')}\n` : '';
            const msg =
              `${emoji} <b>${action.toUpperCase()} ${coinSymbol.toUpperCase()}/IDR</b> [${stratLabel}]\n` +
              `💰 Harga: Rp ${execPrice.toLocaleString('id-ID')}\n` +
              `📊 Jumlah: ${amount.toFixed(8)}\n` +
              `💵 Total: Rp ${Math.floor(total).toLocaleString('id-ID')}\n` +
              pnlLine +
              `💡 ${reason}\n` +
              `💼 Modal: Rp ${Math.floor(newCapital).toLocaleString('id-ID')}\n` +
              `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
            await sendTelegram(telegramToken, chatId, msg);
          }

          allResults.push({ pair: config.pair, strategy: strategyName, status: 'executed', action, price: execPrice, reason });

        } catch (tradeErr: unknown) {
          const errMsg = tradeErr instanceof Error ? tradeErr.message : String(tradeErr);
          console.error(`[${config.pair}] ${strategyName} error:`, errMsg);
          allResults.push({ pair: config.pair, strategy: strategyName, status: 'error', error: errMsg });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results: allResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
