import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let userId: string | null = null;
    try {
      const body = await req.clone().json();
      userId = body.user_id || null;
    } catch {}

    let apiKey = Deno.env.get('INDODAX_API_KEY')!;
    let apiSecret = Deno.env.get('INDODAX_SECRET')!;

    // If user_id provided, look up per-user credentials
    if (userId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: usr } = await supabase
        .from('trading_users')
        .select('indodax_api_key, indodax_secret')
        .eq('id', userId)
        .single();
      if (usr?.indodax_api_key) apiKey = usr.indodax_api_key;
      if (usr?.indodax_secret) apiSecret = usr.indodax_secret;
    }

    const timestamp = Date.now().toString();
    const params = new URLSearchParams({
      method: 'getInfo',
      timestamp: timestamp,
    });

    const body = params.toString();
    const sign = createHmac('sha512', apiSecret).update(body).digest('hex');

    const res = await fetch('https://indodax.com/tapi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Key': apiKey,
        'Sign': sign,
      },
      body,
    });

    const data = await res.json();

    if (!data.success) {
      return new Response(JSON.stringify({ error: data.error || 'API call failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const balances = data.return?.balance || {};
    const balanceHold = data.return?.balance_hold || {};
    const serverTime = data.return?.server_time;

    const holdings: { symbol: string; available: number; hold: number; total: number }[] = [];

    for (const [coin, amount] of Object.entries(balances)) {
      const available = parseFloat(amount as string);
      const hold = parseFloat((balanceHold[coin] as string) || '0');
      const total = available + hold;
      if (total > 0) {
        holdings.push({ symbol: coin.toUpperCase(), available, hold, total });
      }
    }

    holdings.sort((a, b) => {
      if (a.symbol === 'IDR') return -1;
      if (b.symbol === 'IDR') return 1;
      return b.total - a.total;
    });

    return new Response(JSON.stringify({
      success: true,
      holdings,
      serverTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
