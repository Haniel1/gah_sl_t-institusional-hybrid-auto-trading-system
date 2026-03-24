import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// WIT = UTC+9 (Waktu Indonesia Timur)
const WIT_OFFSET = 9;

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HourlyStats {
  hour: number; // 0-23 WIT
  avgReturn: number; // average % return for this hour
  avgVolume: number;
  bullishCount: number;
  bearishCount: number;
  totalCandles: number;
  winRate: number; // % bullish
  avgMomentum: number; // EMA momentum score
  score: number; // composite score
}

interface TimePrediction {
  symbol: string;
  bestBuyHours: { hour: number; score: number; avgReturn: number; confidence: number }[];
  bestSellHours: { hour: number; score: number; avgReturn: number; confidence: number }[];
  currentHourSignal: 'buy' | 'sell' | 'neutral';
  currentHourScore: number;
  hourlyStats: HourlyStats[];
  nextBuyWindow: { start: number; end: number; confidence: number } | null;
  nextSellWindow: { start: number; end: number; confidence: number } | null;
  aiSummary?: string;
  updatedAt: string;
}

function toWITHour(unixSeconds: number): number {
  const date = new Date(unixSeconds * 1000);
  return (date.getUTCHours() + WIT_OFFSET) % 24;
}

function currentWITHour(): number {
  const now = new Date();
  return (now.getUTCHours() + WIT_OFFSET) % 24;
}

async function fetchCandles30d(symbol: string): Promise<Candle[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 30 * 24 * 3600; // 30 days of 1h candles
  const url = `https://indodax.com/tradingview/history_v2?symbol=${symbol.toUpperCase()}IDR&tf=60&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => ({
      time: Number(d.Time),
      open: Number(d.Open),
      high: Number(d.High),
      low: Number(d.Low),
      close: Number(d.Close),
      volume: Number(d.Volume),
    }));
  } catch {
    return [];
  }
}

function analyzeHourlyPatterns(candles: Candle[]): HourlyStats[] {
  // Group candles by WIT hour
  const hourBuckets: Map<number, { returns: number[]; volumes: number[]; bullish: number; bearish: number; momenta: number[] }> = new Map();
  
  for (let h = 0; h < 24; h++) {
    hourBuckets.set(h, { returns: [], volumes: [], bullish: 0, bearish: 0, momenta: [] });
  }

  // Calculate EMA(12) for momentum
  const closes = candles.map(c => c.close);
  const ema12: number[] = [closes[0]];
  const mult = 2 / 13;
  for (let i = 1; i < closes.length; i++) {
    ema12.push((closes[i] - ema12[i - 1]) * mult + ema12[i - 1]);
  }

  for (let i = 1; i < candles.length; i++) {
    const hour = toWITHour(candles[i].time);
    const bucket = hourBuckets.get(hour)!;
    const ret = ((candles[i].close - candles[i].open) / candles[i].open) * 100;
    bucket.returns.push(ret);
    bucket.volumes.push(candles[i].volume);
    if (candles[i].close > candles[i].open) bucket.bullish++;
    else bucket.bearish++;
    
    // Momentum: normalized difference from EMA
    const mom = ((candles[i].close - ema12[i]) / ema12[i]) * 100;
    bucket.momenta.push(mom);
  }

  const stats: HourlyStats[] = [];
  for (let h = 0; h < 24; h++) {
    const b = hourBuckets.get(h)!;
    const total = b.returns.length || 1;
    const avgReturn = b.returns.reduce((a, v) => a + v, 0) / total;
    const avgVolume = b.volumes.reduce((a, v) => a + v, 0) / total;
    const winRate = (b.bullish / total) * 100;
    const avgMomentum = b.momenta.reduce((a, v) => a + v, 0) / total;
    
    // Composite score: weighted combination
    // Higher score = better for buying (positive returns, high win rate, positive momentum, high volume)
    const volNorm = avgVolume > 0 ? 1 : 0; // volume presence
    const score = (avgReturn * 3) + ((winRate - 50) * 0.5) + (avgMomentum * 2) + (volNorm * 0.5);
    
    stats.push({
      hour: h,
      avgReturn,
      avgVolume,
      bullishCount: b.bullish,
      bearishCount: b.bearish,
      totalCandles: b.returns.length,
      winRate,
      avgMomentum,
      score,
    });
  }

  return stats;
}

function findBestWindows(stats: HourlyStats[]): {
  bestBuyHours: { hour: number; score: number; avgReturn: number; confidence: number }[];
  bestSellHours: { hour: number; score: number; avgReturn: number; confidence: number }[];
  nextBuyWindow: { start: number; end: number; confidence: number } | null;
  nextSellWindow: { start: number; end: number; confidence: number } | null;
} {
  // Sort by score
  const sorted = [...stats].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...stats.map(s => Math.abs(s.score))) || 1;
  
  // Top 5 buy hours (highest positive scores)
  const bestBuyHours = sorted
    .filter(s => s.score > 0 && s.avgReturn > 0)
    .slice(0, 5)
    .map(s => ({
      hour: s.hour,
      score: s.score,
      avgReturn: s.avgReturn,
      confidence: Math.min(95, Math.max(30, (s.winRate * 0.6) + (Math.abs(s.score) / maxScore * 40))),
    }));

  // Top 5 sell hours (lowest/most negative scores)
  const bestSellHours = sorted
    .filter(s => s.score < 0 || s.avgReturn < 0)
    .reverse()
    .slice(0, 5)
    .map(s => ({
      hour: s.hour,
      score: s.score,
      avgReturn: s.avgReturn,
      confidence: Math.min(95, Math.max(30, ((100 - s.winRate) * 0.6) + (Math.abs(s.score) / maxScore * 40))),
    }));

  // Find consecutive buy/sell windows
  const currentHour = currentWITHour();
  
  let nextBuyWindow: { start: number; end: number; confidence: number } | null = null;
  let nextSellWindow: { start: number; end: number; confidence: number } | null = null;
  
  // Find next buy window (consecutive hours with positive score starting from current hour)
  for (let offset = 0; offset < 24; offset++) {
    const h = (currentHour + offset) % 24;
    const stat = stats[h];
    if (stat.score > 0 && stat.avgReturn > 0 && !nextBuyWindow) {
      let endH = h;
      let totalConf = stat.winRate;
      let count = 1;
      // Extend window to consecutive positive hours
      for (let ext = 1; ext < 6; ext++) {
        const nextH = (h + ext) % 24;
        if (stats[nextH].score > 0 && stats[nextH].avgReturn > 0) {
          endH = nextH;
          totalConf += stats[nextH].winRate;
          count++;
        } else break;
      }
      nextBuyWindow = {
        start: h,
        end: (endH + 1) % 24,
        confidence: Math.min(90, totalConf / count),
      };
    }
    if ((stat.score < 0 || stat.avgReturn < 0) && !nextSellWindow) {
      let endH = h;
      let totalConf = 100 - stat.winRate;
      let count = 1;
      for (let ext = 1; ext < 6; ext++) {
        const nextH = (h + ext) % 24;
        if (stats[nextH].score < 0 || stats[nextH].avgReturn < 0) {
          endH = nextH;
          totalConf += 100 - stats[nextH].winRate;
          count++;
        } else break;
      }
      nextSellWindow = {
        start: h,
        end: (endH + 1) % 24,
        confidence: Math.min(90, totalConf / count),
      };
    }
    if (nextBuyWindow && nextSellWindow) break;
  }

  return { bestBuyHours, bestSellHours, nextBuyWindow, nextSellWindow };
}

async function getAISummary(symbol: string, stats: HourlyStats[], buyHours: any[], sellHours: any[]): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return '';

  const buyHoursStr = buyHours.map(h => `${h.hour}:00 WIT (${h.confidence.toFixed(0)}%)`).join(', ');
  const sellHoursStr = sellHours.map(h => `${h.hour}:00 WIT (${h.confidence.toFixed(0)}%)`).join(', ');
  
  // Find top volume hours
  const topVolHours = [...stats].sort((a, b) => b.avgVolume - a.avgVolume).slice(0, 3).map(s => s.hour);

  const prompt = `Berikan analisis singkat (max 3 kalimat) dalam bahasa Indonesia tentang pola waktu trading ${symbol}/IDR:
- Jam terbaik untuk BELI: ${buyHoursStr}
- Jam terbaik untuk JUAL: ${sellHoursStr}
- Jam volume tertinggi: ${topVolHours.map(h => h + ':00 WIT').join(', ')}
Jelaskan pola yang terlihat dan rekomendasi singkat. Gunakan format WIT.`;

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: 'Kamu adalah analis crypto. Berikan insight singkat dan actionable tentang pola waktu trading. Jawab dalam bahasa Indonesia.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    
    if (!res.ok) return '';
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, includeAI } = await req.json().catch(() => ({ symbol: 'BTC', includeAI: false }));
    
    const candles = await fetchCandles30d(symbol);
    if (candles.length < 48) {
      return new Response(JSON.stringify({ error: 'Insufficient data', symbol }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hourlyStats = analyzeHourlyPatterns(candles);
    const { bestBuyHours, bestSellHours, nextBuyWindow, nextSellWindow } = findBestWindows(hourlyStats);
    
    const curHour = currentWITHour();
    const curStat = hourlyStats[curHour];
    const currentHourSignal: 'buy' | 'sell' | 'neutral' = 
      curStat.score > 0 && curStat.avgReturn > 0 ? 'buy' :
      curStat.score < 0 && curStat.avgReturn < 0 ? 'sell' : 'neutral';

    let aiSummary = '';
    if (includeAI) {
      aiSummary = await getAISummary(symbol, hourlyStats, bestBuyHours, bestSellHours);
    }

    const prediction: TimePrediction = {
      symbol,
      bestBuyHours,
      bestSellHours,
      currentHourSignal,
      currentHourScore: curStat.score,
      hourlyStats,
      nextBuyWindow,
      nextSellWindow,
      aiSummary,
      updatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(prediction), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
