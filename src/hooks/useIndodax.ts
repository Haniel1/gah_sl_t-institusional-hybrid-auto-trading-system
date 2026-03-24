import { useState, useEffect, useCallback, useRef } from 'react';

export interface CoinTicker {
  pair: string;
  name: string;
  last: number;
  buy: number;
  sell: number;
  high: number;
  low: number;
  vol: string;
  change: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const COIN_NAMES: Record<string, string> = {
  btc: 'Bitcoin', eth: 'Ethereum', bnb: 'BNB', sol: 'Solana',
  xrp: 'XRP', ada: 'Cardano', doge: 'Dogecoin', dot: 'Polkadot',
  matic: 'Polygon', avax: 'Avalanche', link: 'Chainlink', uni: 'Uniswap',
  atom: 'Cosmos', ltc: 'Litecoin', etc: 'Ethereum Classic', bch: 'Bitcoin Cash',
  trx: 'TRON', near: 'NEAR', fil: 'Filecoin', icp: 'Internet Computer',
  shib: 'Shiba Inu', arb: 'Arbitrum', op: 'Optimism', apt: 'Aptos',
  sui: 'Sui', sei: 'SEI', pepe: 'Pepe', wif: 'dogwifhat',
};

async function fetchFromProxy(endpoint: string) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/indodax-proxy?endpoint=${encodeURIComponent(endpoint)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Proxy fetch failed');
  return await res.json();
}

export function useIndodaxTickers() {
  const [tickers, setTickers] = useState<CoinTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickers = useCallback(async () => {
    try {
      const data = await fetchFromProxy('summaries');
      
      const tickerList: CoinTicker[] = [];
      const tickersData = data.tickers || {};
      
      for (const [key, val] of Object.entries(tickersData)) {
        if (!key.endsWith('_idr')) continue;
        const t = val as any;
        const symbol = key.replace('_idr', '');
        tickerList.push({
          pair: `${symbol}_idr`,
          name: COIN_NAMES[symbol] || symbol.toUpperCase(),
          last: parseFloat(t.last),
          buy: parseFloat(t.buy),
          sell: parseFloat(t.sell),
          high: parseFloat(t.high),
          low: parseFloat(t.low),
          vol: t.vol_idr || '0',
          change: ((parseFloat(t.last) - parseFloat(t.open || t.last)) / parseFloat(t.open || t.last)) * 100 || 0,
        });
      }

      tickerList.sort((a, b) => parseFloat(b.vol) - parseFloat(a.vol));
      setTickers(tickerList);
      setError(null);
    } catch (err) {
      setError('Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickers();
    const interval = setInterval(fetchTickers, 5000);
    return () => clearInterval(interval);
  }, [fetchTickers]);

  return { tickers, loading, error };
}

export function useIndodaxCandles(pair: string, timeframe: string = '1h', lookbackCandles: number = 200) {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const isPausedRef = useRef(false);

  const setPaused = useCallback((paused: boolean) => {
    isPausedRef.current = paused;
  }, []);

  const fetchCandles = useCallback(async (isInitial = false) => {
    if (!pair || isFetchingRef.current) return;
    if (!isInitial && isPausedRef.current) return;
    isFetchingRef.current = true;
    if (isInitial) setLoading(true);
    try {
      const symbol = pair.replace('_idr', '').toUpperCase() + 'IDR';
      const resolutionMap: Record<string, string> = {
        '15m': '15',
        '1h': '60',
        '4h': '240',
        '1d': '1D',
        '1w': '1W',
        '1M': '1M',
      };
      const resolution = resolutionMap[timeframe] || '60';
      
      const now = Math.floor(Date.now() / 1000);
      const intervalSec = timeframe === '15m'
        ? 900
        : timeframe === '1h'
        ? 3600
        : timeframe === '4h'
        ? 14400
        : timeframe === '1w'
        ? 604800
        : timeframe === '1M'
        ? 2592000
        : 86400;
      const effectiveLookback = timeframe === '1M'
        ? Math.min(Math.max(lookbackCandles, 100), 180)
        : Math.max(100, lookbackCandles);
      const from = now - effectiveLookback * intervalSec;
      
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const params = new URLSearchParams({
        endpoint: 'tradingview/history',
        symbol,
        resolution,
        from: String(from),
        to: String(now),
      });
      const url = `https://${projectId}.supabase.co/functions/v1/indodax-proxy?${params.toString()}`;
      
      // Retry logic for slow API
      let data: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          data = await res.json();
          break;
        } catch (e) {
          if (attempt === 2) throw e;
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      
      if (data?.s === 'ok' && Array.isArray(data.t) && data.t.length > 0) {
        const realCandles: CandleData[] = data.t.map((t: number, i: number) => ({
          time: Number(t),
          open: Number(data.o[i]),
          high: Number(data.h[i]),
          low: Number(data.l[i]),
          close: Number(data.c[i]),
          volume: Number(data.v[i]),
        }));
        const hasRealData = realCandles.some(c => c.volume > 0 || c.open !== c.close || c.high !== c.low);
        if (hasRealData) {
          setCandles(realCandles);
        } else {
          console.warn('Candle data is flat/empty for', pair);
          // Don't clear existing candles on refresh - keep stale data visible
          if (isInitial) setCandles([]);
        }
      } else {
        console.warn('No candle data from Indodax:', data);
        if (isInitial) setCandles([]);
      }
    } catch (err) {
      console.error('Failed to fetch candles:', err);
      // Don't clear candles on error - keep stale data
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [pair, timeframe, lookbackCandles]);

  useEffect(() => {
    setCandles([]);
    setLoading(true);
    fetchCandles(true);
    const interval = setInterval(() => fetchCandles(false), 5000);
    return () => clearInterval(interval);
  }, [fetchCandles]);

  return { candles, loading, setPaused };
}

export function formatIDR(value: number): string {
  if (value >= 1e12) return `Rp ${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `Rp ${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toFixed(1)}M`;
  return `Rp ${value.toLocaleString('id-ID')}`;
}
