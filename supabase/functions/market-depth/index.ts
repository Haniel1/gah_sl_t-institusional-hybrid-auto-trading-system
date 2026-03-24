const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pair = url.searchParams.get('pair') || 'btc_idr';
    const type = url.searchParams.get('type') || 'all';
    const results: Record<string, any> = {};
    const pairClean = pair.replace('_', '');

    if (type === 'all' || type === 'orderbook') {
      try {
        const res = await fetch(`https://indodax.com/api/depth/${pairClean}`);
        const data = await res.json();
        results.orderbook = { bids: (data.buy || []).slice(0, 15), asks: (data.sell || []).slice(0, 15) };
      } catch (e) { results.orderbook = { bids: [], asks: [] }; }
    }
    if (type === 'all' || type === 'trades') {
      try {
        const res = await fetch(`https://indodax.com/api/trades/${pairClean}`);
        const data = await res.json();
        results.trades = (data || []).slice(0, 30);
      } catch (e) { results.trades = []; }
    }
    if (type === 'all' || type === 'ticker') {
      try {
        const res = await fetch(`https://indodax.com/api/ticker/${pairClean}`);
        const data = await res.json();
        results.ticker = data.ticker || {};
      } catch (e) { results.ticker = {}; }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
