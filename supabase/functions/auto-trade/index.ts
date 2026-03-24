import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Fixed capital allocation
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
    const effectiveStrategy = 'trend-following';

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
      // Search by pair only (not strategy) to handle existing rows with old strategy names
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

    // ── EXECUTE (manual trade) ──
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

      if (!apiKey || !secret) {
        return new Response(JSON.stringify({ error: 'INDODAX_API_KEY atau INDODAX_SECRET belum dikonfigurasi' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (type === 'buy' && (config.position === 'long' || config.status === 'holding')) {
        return new Response(JSON.stringify({
          success: false, error: `Sudah ada posisi BUY terbuka untuk ${symbol.toUpperCase()}.`, blocked: true,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (type === 'buy') {
        const idrAmount = config.current_capital || config.initial_capital || 400000;
        const tradeParams: Record<string, string> = {
          pair: pairFormatted, type: 'buy',
          price: Math.floor(Number(price)).toString(),
          idr: Math.floor(idrAmount).toString(),
        };
        tradeResult = await indodaxPrivateApi('trade', apiKey, secret, tradeParams);

        if (tradeResult?.success !== 1 && tradeResult?.return === undefined) {
          return new Response(JSON.stringify({
            success: false, error: tradeResult?.error || 'Order BUY gagal', indodax_response: tradeResult,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        amount = tradeResult?.return?.order?.remain_idr
          ? (idrAmount - Number(tradeResult.return.order.remain_idr)) / Number(price)
          : idrAmount / Number(price);
        total = amount * Number(price);
      } else if (type === 'sell') {
        const infoRes = await indodaxPrivateApi('getInfo', apiKey, secret);
        const coinBalance = infoRes?.return?.balance?.[symbol] || '0';
        if (Number(coinBalance) <= 0) {
          return new Response(JSON.stringify({
            success: false, error: `Tidak ada saldo ${symbol.toUpperCase()} untuk dijual`,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const tradeParams: Record<string, string> = {
          pair: pairFormatted, type: 'sell',
          price: Math.floor(Number(price)).toString(),
          [symbol]: coinBalance,
        };
        tradeResult = await indodaxPrivateApi('trade', apiKey, secret, tradeParams);

        if (tradeResult?.success !== 1 && tradeResult?.return === undefined) {
          return new Response(JSON.stringify({
            success: false, error: tradeResult?.error || 'Order SELL gagal', indodax_response: tradeResult,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        amount = Number(coinBalance);
        total = amount * Number(price);
      }

      // P&L
      let profitLoss = 0;
      let newCapital = config.current_capital || config.initial_capital || 400000;
      let newTotalPnl = config.total_pnl || 0;

      if (type === 'buy') {
        newCapital -= total;
        await supabase.from('auto_trade_config').update({
          current_capital: newCapital, current_balance: newCapital,
          entry_price: Number(price), entry_time: new Date().toISOString(),
          status: 'holding', position: 'long', last_trade_at: new Date().toISOString(),
        }).eq('id', config.id);
      } else if (type === 'sell') {
        const entryCost = config.entry_price ? config.entry_price * amount : total;
        profitLoss = total - entryCost;
        const fee = total * 0.003;
        profitLoss -= fee;
        newCapital += total - fee;
        newTotalPnl += profitLoss;

        await supabase.from('auto_trade_config').update({
          current_capital: newCapital, current_balance: newCapital,
          total_pnl: newTotalPnl,
          win_count: (config.win_count || 0) + (profitLoss > 0 ? 1 : 0),
          loss_count: (config.loss_count || 0) + (profitLoss <= 0 ? 1 : 0),
          entry_price: null, entry_time: null,
          status: 'idle', position: 'none', last_trade_at: new Date().toISOString(),
        }).eq('id', config.id);
      }

      await supabase.from('trade_history').insert({
        pair, type, price: Number(price), amount, total,
        strategy: effectiveStrategy,
        profit_loss: profitLoss, balance_after: newCapital,
      });

      if (telegramToken && chatId) {
        const emoji = type === 'buy' ? '🟢 BUY' : '🔴 SELL';
        const msg = `✅ ${emoji} <b>${symbol.toUpperCase()}/IDR</b>\n` +
          `💰 Harga: Rp ${Number(price).toLocaleString('id-ID')}\n` +
          `📊 Jumlah: ${amount.toFixed(8)}\n` +
          `💵 Total: Rp ${Math.floor(total).toLocaleString('id-ID')}\n` +
          (profitLoss !== 0 ? `${profitLoss > 0 ? '📈' : '📉'} P&L: Rp ${Math.floor(profitLoss).toLocaleString('id-ID')}\n` : '') +
          `💼 Modal: Rp ${Math.floor(newCapital).toLocaleString('id-ID')}\n` +
          `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
        await sendTelegramNotification(telegramToken, chatId, msg);
      }

      return new Response(JSON.stringify({ success: true, trade: tradeResult, balance: newCapital, amount, total }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── STATUS ──
    if (action === 'status') {
      const { data: configs } = await supabase.from('auto_trade_config').select('*').eq('strategy', effectiveStrategy);
      const { data: trades } = await supabase.from('trade_history').select('*').order('created_at', { ascending: false }).limit(20);
      return new Response(JSON.stringify({ configs, trades }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── GET BALANCE ──
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

      // Check Indodax balance for this coin
      const symbol = pair.replace('_idr', '');
      let coinBalance = 0;
      if (apiKey && secret) {
        const infoRes = await indodaxPrivateApi('getInfo', apiKey, secret);
        coinBalance = Number(infoRes?.return?.balance?.[symbol] || 0);
      }

      // Sync coin_balance to config
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
