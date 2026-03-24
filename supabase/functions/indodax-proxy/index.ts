import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchWithRetry(url: string, maxRetries = 3, timeoutMs = 8000): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (i === maxRetries - 1) return res;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (i === maxRetries - 1) throw new Error(message);
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'All retries failed');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || 'summaries';

    if (endpoint === 'tradingview/history') {
      const symbol = url.searchParams.get('symbol') || 'BTCIDR';
      const resolution = url.searchParams.get('resolution') || '60';
      const requestedFrom = Number(url.searchParams.get('from') || '0');
      const requestedTo = Number(url.searchParams.get('to') || `${Math.floor(Date.now() / 1000)}`);

      const tfMap: Record<string, string> = { '15': '15', '60': '60', '240': '240', '1D': '1D', 'D': '1D', '1W': '1W', '1M': '1M' };
      const tf = tfMap[resolution] || resolution;
      const nowSec = Math.floor(Date.now() / 1000);
      const safeTo = Math.min(requestedTo || nowSec, nowSec);
      const minFromByTf: Record<string, number> = { '1M': safeTo - 15 * 365 * 86400, '1W': safeTo - 20 * 365 * 86400 };
      const safeFrom = Math.max(requestedFrom || 0, minFromByTf[tf] ?? 0);

      const tvUrl = `https://indodax.com/tradingview/history_v2?symbol=${symbol}&tf=${tf}&from=${safeFrom}&to=${safeTo}`;
      let res: Response;
      try {
        res = await fetchWithRetry(tvUrl, 3, 20000);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ s: 'no_data', error: `Upstream failed: ${message}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const text = await res.text();
      if (!res.ok) {
        return new Response(JSON.stringify({ s: 'no_data', error: `HTTP ${res.status}`, details: text.substring(0, 200) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          const udf = {
            s: 'ok',
            t: data.map((d: any) => d.Time),
            o: data.map((d: any) => d.Open),
            h: data.map((d: any) => d.High),
            l: data.map((d: any) => d.Low),
            c: data.map((d: any) => d.Close),
            v: data.map((d: any) => d.Volume),
          };
          return new Response(JSON.stringify(udf), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ s: 'no_data', data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify({ s: 'error', error: `Parse error: ${text.substring(0, 200)}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const indodaxUrl = `https://indodax.com/api/${endpoint}`;
    const res = await fetchWithRetry(indodaxUrl);
    const data = await res.json();
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('indodax-proxy error:', errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
