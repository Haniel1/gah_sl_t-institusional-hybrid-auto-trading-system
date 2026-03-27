import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_NAME = '🤖 GainzHalving';

async function signRequest(params: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(params));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function indodaxPrivateApi(method: string, apiKey: string, secret: string, extraParams: Record<string, string> = {}) {
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

async function getOrderbookAskPrice(pair: string): Promise<number | null> {
  try {
    const pairClean = pair.replace('_', '');
    const res = await fetch(`https://indodax.com/api/depth/${pairClean}`);
    const data = await res.json();
    const asks = data.sell || [];
    if (asks.length > 0) {
      return Number(asks[0][0]); // best ask price
    }
  } catch (e) {
    console.error('Failed to get orderbook ask:', e);
  }
  return null;
}

async function sendTelegramNotification(token: string, chatId: string, message: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    return await res.json();
  } catch (err) {
    console.error('Telegram send failed:', err);
    return null;
  }
}

const COIN_ALLOCATION: Record<string, number> = {
  btc: 400000, eth: 400000, sol: 400000, bnb: 400000, link: 400000,
  icp: 200000,
};

function getInitialCapital(pair: string): number {
  const symbol = pair.replace('_idr', '').toLowerCase();
  return COIN_ALLOCATION[symbol] || 400000;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { action, pair, type, price, user_id } = body;
    const effectiveStrategy = body.strategy || 'alpha_simons';

    let apiKey = Deno.env.get('INDODAX_API_KEY') || '';
    let secret = Deno.env.get('INDODAX_SECRET') || '';
    let telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
    let chatId = Deno.env.get('TELEGRAM_CHAT_ID') || '';

    if (user_id) {
      const { data: usr } = await supabase
        .from('trading_users')
        .select('indodax_api_key, indodax_secret, telegram_bot_token, telegram_chat_id')
        .eq('id', user_id)
        .single();
      if (usr) {
        if (usr.indodax_api_key) apiKey = usr.indodax_api_key;
        if (usr.indodax_secret) secret = usr.indodax_secret;
        if (usr.telegram_bot_token) telegramToken = usr.telegram_bot_token;
        if (usr.telegram_chat_id) chatId = usr.telegram_chat_id;
      }
    }

    // ── TOGGLE ──
    if (action === 'toggle') {
      const { data: existing } = await supabase
        .from('auto_trade_config')
        .select('*')
        .eq('pair', pair)
        .maybeSingle();

      if (existing) {
        const { data } = await supabase
          .from('auto_trade_config')
          .update({ enabled: !existing.enabled, strategy: effectiveStrategy, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
        return new Response(JSON.stringify({ success: true, config: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const initCap = getInitialCapital(pair);
        const coinSymbol = pair.replace('_idr', '').toUpperCase();
        const { data } = await supabase
          .from('auto_trade_config')
          .insert({
            pair, coin_symbol: coinSymbol, enabled: true, strategy: effectiveStrategy,
            initial_balance: initCap, current_balance: initCap,
            initial_capital: initCap, current_capital: initCap,
            notify_telegram: true, telegram_enabled: true,
          })
          .select()
          .single();
        return new Response(JSON.stringify({ success: true, config: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── EXECUTE (manual/auto trade) ──
    if (action === 'execute') {
      let config: any = null;
      const { data: existingConfig } = await supabase
        .from('auto_trade_config')
        .select('*')
        .eq('pair', pair)
        .eq('strategy', effectiveStrategy)
        .maybeSingle();

      if (existingConfig) {
        config = existingConfig;
      } else {
        const initCap = getInitialCapital(pair);
        const coinSymbol = pair.replace('_idr', '').toUpperCase();
        const { data: newConfig } = await supabase
          .from('auto_trade_config')
          .insert({
            pair, coin_symbol: coinSymbol, enabled: false, strategy: effectiveStrategy,
            initial_balance: initCap, current_balance: initCap,
            initial_capital: initCap, current_capital: initCap,
          })
          .select()
          .single();
        config = newConfig;
      }

      if (!config) {
        return new Response(JSON.stringify({ error: 'Failed to get/create trade config' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const symbol = pair.replace('_idr', '');
      const pairFormatted = `${symbol}_idr`;
      let tradeResult: any = null;
      let amount = 0;
      let total = 0;
      const orderMethod = body.order_method || 'market'; // 'market' or 'limit'
      const reason = body.reason || ''; // 'take_profit', 'stop_loss', or ''

      if (!apiKey || !secret) {
        return new Response(JSON.stringify({ error: 'INDODAX_API_KEY atau INDODAX_SECRET belum dikonfigurasi' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── BUY ──
      if (type === 'buy') {
        if (config.position === 'long' || config.status === 'holding') {
          return new Response(JSON.stringify({
            success: false, error: `Sudah ada posisi BUY terbuka untuk ${symbol.toUpperCase()}.`, blocked: true,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const idrAmount = config.current_capital || config.initial_capital || 400000;

        // Get best ask price from orderbook for slippage awareness
        const askPrice = await getOrderbookAskPrice(pairFormatted);
        const effectivePrice = askPrice || Number(price);

        // === BUY: Limit order at best ask price (acts as instant fill) ===
        const tradeParams: Record<string, string> = {
          pair: pairFormatted,
          type: 'buy',
          price: Math.floor(effectivePrice).toString(),
          idr: Math.floor(idrAmount).toString(),
        };

        console.log(`[BUY] Limit at Ask - pair: ${pairFormatted}, price: ${Math.floor(effectivePrice)}, idr: ${Math.floor(idrAmount)}`);
        tradeResult = await indodaxPrivateApi('trade', apiKey, secret, tradeParams);
        console.log(`[BUY] Response:`, JSON.stringify(tradeResult));

        if (tradeResult?.success !== 1 && tradeResult?.return === undefined) {
          return new Response(JSON.stringify({
            success: false, error: tradeResult?.error || 'Order BUY gagal', indodax_response: tradeResult,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Calculate actual amount from response
        const orderReturn = tradeResult?.return;
        const spentIdr = orderReturn?.order?.spend_idr
          ? Number(orderReturn.order.spend_idr)
          : idrAmount;
        amount = spentIdr / effectivePrice;
        total = spentIdr;

        // Update config: position = long, holding
        const newCapital = (config.current_capital || config.initial_capital || 400000) - total;
        await supabase.from('auto_trade_config').update({
          current_capital: newCapital, current_balance: newCapital,
          entry_price: effectivePrice, entry_time: new Date().toISOString(),
          status: 'holding', position: 'long', last_trade_at: new Date().toISOString(),
          highest_price_seen: effectivePrice,
        }).eq('id', config.id);

        // Log trade
        await supabase.from('trade_history').insert({
          pair, type: 'buy', price: effectivePrice, amount, total,
          strategy: effectiveStrategy, profit_loss: 0, balance_after: newCapital,
        });

        // Telegram notification
        if (telegramToken && chatId) {
          const msg = `<b>${APP_NAME}</b>\n\n` +
            `✅ 🟢 MARKET BUY <b>${symbol.toUpperCase()}/IDR</b>\n` +
            `💰 Harga Ask: Rp ${effectivePrice.toLocaleString('id-ID')}\n` +
            `📊 Jumlah: ${amount.toFixed(8)}\n` +
            `💵 Total: Rp ${Math.floor(total).toLocaleString('id-ID')}\n` +
            `💼 Sisa Modal: Rp ${Math.floor(newCapital).toLocaleString('id-ID')}\n` +
            `📋 Strategi: ${effectiveStrategy}\n` +
            `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
          await sendTelegramNotification(telegramToken, chatId, msg);
        }

        return new Response(JSON.stringify({
          success: true, trade: tradeResult, balance: (config.current_capital || 400000) - total,
          amount, total, order_type: 'market_buy',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── SELL ──
      if (type === 'sell') {
        // Get current coin balance from Indodax
        const infoRes = await indodaxPrivateApi('getInfo', apiKey, secret);
        const coinBalance = infoRes?.return?.balance?.[symbol] || '0';
        if (Number(coinBalance) <= 0) {
          return new Response(JSON.stringify({
            success: false, error: `Tidak ada saldo ${symbol.toUpperCase()} untuk dijual`,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        amount = Number(coinBalance);
        const currentPrice = Number(price);
        const entryPrice = config.entry_price || currentPrice;
        const grossProfitPct = ((currentPrice - entryPrice) / entryPrice) * 100;

        // Update highest_price_seen for trailing stop
        const prevHighest = config.highest_price_seen || entryPrice;
        if (currentPrice > prevHighest) {
          await supabase.from('auto_trade_config').update({ highest_price_seen: currentPrice }).eq('id', config.id);
          config.highest_price_seen = currentPrice;
        }
        const highestSeen = config.highest_price_seen || entryPrice;
        const dropFromHighest = highestSeen > 0 ? ((highestSeen - currentPrice) / highestSeen) * 100 : 0;

        // Dynamic Trailing Stop: activate at 2% profit, callback 1.5%
        const isTrailingStop = grossProfitPct >= 2.0 && dropFromHighest >= 1.5;
        const isHardStopLoss = reason === 'stop_loss' || (currentPrice <= entryPrice * 0.98);
        const isStopLoss = isHardStopLoss || isTrailingStop;

        let sellOrderType = '';

        if (isStopLoss) {
          // === STOP LOSS: MARKET ORDER SELL (instant) ===
          const tradeParams: Record<string, string> = {
            pair: pairFormatted,
            type: 'sell',
            [symbol]: coinBalance,
          };
          console.log(`[SELL] STOP LOSS Market Order - pair: ${pairFormatted}, amount: ${coinBalance}, price: ${currentPrice}, entry: ${entryPrice}`);
          tradeResult = await indodaxPrivateApi('trade', apiKey, secret, tradeParams);
          sellOrderType = isTrailingStop ? 'market_sell_trailing' : 'market_sell_stoploss';
        } else {
          // === TAKE PROFIT: check min 1% gross profit ===
          if (grossProfitPct < 1.0) {
            return new Response(JSON.stringify({
              success: false,
              error: `Profit kotor ${grossProfitPct.toFixed(2)}% belum mencapai minimum 1%. Fee Indodax ~0.42%, profit bersih belum positif.`,
              gross_profit_pct: grossProfitPct,
              blocked: true,
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Get best ask price for limit order
          const askPrice = await getOrderbookAskPrice(pairFormatted);
          const limitPrice = askPrice || currentPrice;

          // === TAKE PROFIT: LIMIT ORDER SELL ===
          const tradeParams: Record<string, string> = {
            pair: pairFormatted,
            type: 'sell',
            price: Math.floor(limitPrice).toString(),
            [symbol]: coinBalance,
          };
          console.log(`[SELL] TAKE PROFIT Limit Order - pair: ${pairFormatted}, price: ${limitPrice}, amount: ${coinBalance}, gross_profit: ${grossProfitPct.toFixed(2)}%`);
          tradeResult = await indodaxPrivateApi('trade', apiKey, secret, tradeParams);
          sellOrderType = 'limit_sell_takeprofit';
        }

        if (tradeResult?.success !== 1 && tradeResult?.return === undefined) {
          return new Response(JSON.stringify({
            success: false, error: tradeResult?.error || 'Order SELL gagal', indodax_response: tradeResult,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        total = amount * currentPrice;
        const fee = total * 0.003;
        const entryCost = entryPrice * amount;
        const profitLoss = total - entryCost - fee;
        const newCapital = (config.current_capital || config.initial_capital || 400000) + total - fee;
        const newTotalPnl = (config.total_pnl || 0) + profitLoss;

        await supabase.from('auto_trade_config').update({
          current_capital: newCapital, current_balance: newCapital,
          total_pnl: newTotalPnl,
          win_count: (config.win_count || 0) + (profitLoss > 0 ? 1 : 0),
          loss_count: (config.loss_count || 0) + (profitLoss <= 0 ? 1 : 0),
          entry_price: null, entry_time: null, highest_price_seen: null,
          status: 'idle', position: 'none', last_trade_at: new Date().toISOString(),
        }).eq('id', config.id);

        await supabase.from('trade_history').insert({
          pair, type: 'sell', price: currentPrice, amount, total,
          strategy: effectiveStrategy, profit_loss: profitLoss, balance_after: newCapital,
        });

        if (telegramToken && chatId) {
          const typeLabel = isTrailingStop ? '🟠 TRAILING STOP (MARKET SELL)' : isHardStopLoss ? '🔴 STOP LOSS (MARKET SELL)' : '🟡 TAKE PROFIT (LIMIT SELL)';
          const msg = `<b>${APP_NAME}</b>\n\n` +
            `${typeLabel} <b>${symbol.toUpperCase()}/IDR</b>\n` +
            `💰 Harga: Rp ${currentPrice.toLocaleString('id-ID')}\n` +
            `📊 Jumlah: ${amount.toFixed(8)}\n` +
            `💵 Total: Rp ${Math.floor(total).toLocaleString('id-ID')}\n` +
            `${profitLoss > 0 ? '📈' : '📉'} P&L: Rp ${Math.floor(profitLoss).toLocaleString('id-ID')} (${grossProfitPct?.toFixed(2) || '0'}%)\n` +
            `💼 Modal: Rp ${Math.floor(newCapital).toLocaleString('id-ID')}\n` +
            `📋 Strategi: ${effectiveStrategy}\n` +
            `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
          await sendTelegramNotification(telegramToken, chatId, msg);
        }

        return new Response(JSON.stringify({
          success: true, trade: tradeResult, balance: newCapital,
          amount, total, profit_loss: profitLoss, order_type: sellOrderType,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── STATUS ──
    if (action === 'status') {
      const { data: configs } = await supabase.from('auto_trade_config').select('*').eq('strategy', effectiveStrategy);
      const { data: trades } = await supabase.from('trade_history').select('*').order('created_at', { ascending: false }).limit(20);
      return new Response(JSON.stringify({ configs, trades }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── GET BALANCE (test connection) ──
    if (action === 'get_balance') {
      const result = await indodaxPrivateApi('getInfo', apiKey, secret);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── SYNC TRADES ──
    if (action === 'sync_trades') {
      const { data: config } = await supabase
        .from('auto_trade_config')
        .select('*')
        .eq('pair', pair)
        .eq('strategy', body.strategy || effectiveStrategy)
        .maybeSingle();

      if (!config) {
        return new Response(JSON.stringify({ success: true, message: 'No config found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const symbol = pair.replace('_idr', '');
      let coinBalance = 0;
      if (apiKey && secret) {
        const infoRes = await indodaxPrivateApi('getInfo', apiKey, secret);
        coinBalance = Number(infoRes?.return?.balance?.[symbol] || 0);
      }

      await supabase.from('auto_trade_config').update({
        coin_balance: coinBalance,
        last_check_at: new Date().toISOString(),
      }).eq('id', config.id);

      return new Response(JSON.stringify({ success: true, config: { ...config, coin_balance: coinBalance } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Auto-trade error:', errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
