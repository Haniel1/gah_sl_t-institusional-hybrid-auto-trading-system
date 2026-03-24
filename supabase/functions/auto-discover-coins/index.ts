import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TickerData {
  pair: string;
  symbol: string;
  buy: number;
  sell: number;
  last: number;
  volume: number;
  spread: number;
  spreadPercent: number;
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

    // Fetch all tickers from Indodax
    const res = await fetch('https://indodax.com/api/tickers', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = await res.json();
    const tickers = data?.tickers || {};

    // Calculate spread for each IDR pair
    const coinList: TickerData[] = [];
    for (const [key, val] of Object.entries(tickers)) {
      if (!key.endsWith('_idr')) continue;
      const t = val as any;
      const buy = parseFloat(t.buy || '0');
      const sell = parseFloat(t.sell || '0');
      const last = parseFloat(t.last || '0');
      const volume = parseFloat(t.vol_idr || '0');

      if (buy <= 0 || sell <= 0 || last <= 0) continue;

      const spread = sell - buy;
      const spreadPercent = (spread / last) * 100;

      coinList.push({
        pair: key,
        symbol: key.replace('_idr', '').toUpperCase(),
        buy, sell, last, volume, spread, spreadPercent,
      });
    }

    // Filter: spread < 0.5% AND minimum volume > 10M IDR (liquid enough)
    const SPREAD_THRESHOLD = 0.5;
    const MIN_VOLUME_IDR = 10_000_000;
    const INDODAX_FEE = 0.3; // 0.3% per side, 0.6% round trip

    const tightSpreadCoins = coinList
      .filter(c => c.spreadPercent > 0 && c.spreadPercent < SPREAD_THRESHOLD && c.volume >= MIN_VOLUME_IDR)
      .sort((a, b) => a.spreadPercent - b.spreadPercent)
      .slice(0, 30); // Max 30 coins

    // Get existing configs and simulation states
    const [{ data: existingConfigs }, { data: existingSimulations }] = await Promise.all([
      supabase.from('auto_trade_config').select('pair'),
      supabase.from('simulation_state').select('coin_symbol'),
    ]);

    const existingPairs = new Set((existingConfigs || []).map((c: any) => c.pair));
    const existingSimPairs = new Set((existingSimulations || []).map((s: any) => s.coin_symbol));

    // Add new coins to auto_trade_config
    const newConfigs = tightSpreadCoins
      .filter(c => !existingPairs.has(c.pair))
      .map(c => ({
        pair: c.pair,
        coin_symbol: c.symbol,
        enabled: false,
        strategy: 'gainzalgo',
        initial_balance: 300000,
        current_balance: 300000,
        initial_capital: 300000,
        current_capital: 300000,
        notify_telegram: false,
        telegram_enabled: false,
        position: 'none',
        status: 'idle',
        tp_pct: 5,
        sl_pct: 3,
      }));

    // Add new coins to simulation_state
    const newSimulations = tightSpreadCoins
      .filter(c => !existingSimPairs.has(c.symbol))
      .map(c => ({
        coin_symbol: c.symbol,
        capital: 1000000,
        coin_balance: 0,
        is_running: true,
      }));

    // Don't auto-enable existing configs - let user manually enable
    const enablePairs: string[] = [];

    const results: any = {
      discovered: tightSpreadCoins.length,
      newAutoTrade: newConfigs.length,
      newSimulation: newSimulations.length,
      enabledExisting: enablePairs.length,
      coins: tightSpreadCoins.map(c => ({
        symbol: c.symbol,
        pair: c.pair,
        spread: c.spreadPercent.toFixed(3) + '%',
        netCost: (c.spreadPercent + INDODAX_FEE * 2).toFixed(3) + '%',
        volume: Math.round(c.volume).toLocaleString('id-ID'),
        price: c.last,
      })),
    };

    // Insert new auto_trade_config entries
    if (newConfigs.length > 0) {
      const { error: configError } = await supabase.from('auto_trade_config').insert(newConfigs);
      if (configError) results.configError = configError.message;
    }

    // Insert new simulation_state entries
    if (newSimulations.length > 0) {
      const { error: simError } = await supabase.from('simulation_state').insert(newSimulations);
      if (simError) results.simError = simError.message;
    }

    // Enable existing pairs
    if (enablePairs.length > 0) {
      await supabase.from('auto_trade_config')
        .update({ enabled: true })
        .in('pair', enablePairs);
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
