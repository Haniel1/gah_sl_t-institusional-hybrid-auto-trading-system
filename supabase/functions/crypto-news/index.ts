const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type } = await req.json().catch(() => ({ type: 'all' }));
    const results: Record<string, any> = {};

    if (type === 'all' || type === 'fear-greed') {
      try {
        const fgRes = await fetch('https://api.alternative.me/fng/?limit=30&format=json');
        const fgData = await fgRes.json();
        results.fearGreed = fgData.data || [];
      } catch (e) { results.fearGreed = []; }
    }
    if (type === 'all' || type === 'global') {
      try {
        const globalRes = await fetch('https://api.coingecko.com/api/v3/global');
        const globalData = await globalRes.json();
        results.global = globalData.data || {};
      } catch (e) { results.global = {}; }
    }
    if (type === 'all' || type === 'trending') {
      try {
        const trendRes = await fetch('https://api.coingecko.com/api/v3/search/trending');
        const trendData = await trendRes.json();
        results.trending = trendData.coins || [];
      } catch (e) { results.trending = []; }
    }
    if (type === 'all' || type === 'market') {
      try {
        const marketRes = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple&order=market_cap_desc&sparkline=true&price_change_percentage=1h,24h,7d');
        const marketData = await marketRes.json();
        results.topCoins = marketData || [];
      } catch (e) { results.topCoins = []; }
    }
    if (type === 'all' || type === 'defi') {
      try {
        const defiRes = await fetch('https://api.coingecko.com/api/v3/global/decentralized_finance_defi');
        const defiData = await defiRes.json();
        results.defi = defiData.data || {};
      } catch (e) { results.defi = {}; }
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
