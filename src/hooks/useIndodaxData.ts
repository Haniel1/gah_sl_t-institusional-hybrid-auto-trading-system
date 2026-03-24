import { useState, useEffect, useCallback, useMemo } from 'react';
import { CoinData, COIN_NAMES } from '@/types/crypto';
import { supabase } from '@/integrations/supabase/client';

function parseCoinData(pair: string, ticker: any, price24h?: string): CoinData {
  const symbol = pair.replace('_idr', '').toUpperCase();
  const last = parseFloat(ticker.last) || 0;
  const prev = price24h ? parseFloat(price24h) : last;
  const change = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  return {
    id: pair,
    symbol,
    name: COIN_NAMES[symbol] || symbol,
    last,
    high: parseFloat(ticker.high) || 0,
    low: parseFloat(ticker.low) || 0,
    buy: parseFloat(ticker.buy) || 0,
    sell: parseFloat(ticker.sell) || 0,
    volumeIdr: parseFloat(ticker.vol_idr) || 0,
    change24h: change,
  };
}

export function useIndodaxData() {
  const [allCoins, setAllCoins] = useState<CoinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCoinId, setSelectedCoinId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      let responseData: any;
      try {
        const { data, error: fnError } = await supabase.functions.invoke('indodax-proxy', {
          body: { endpoint: 'summaries' },
        });
        if (fnError) throw fnError;
        responseData = data;
      } catch {
        const res = await fetch('https://indodax.com/api/summaries');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        responseData = await res.json();
      }

      const coins: CoinData[] = [];
      const tickers = responseData?.tickers;
      if (!tickers) throw new Error('Format data tidak valid');

      for (const [pair, ticker] of Object.entries(tickers)) {
        if (!pair.endsWith('_idr')) continue;
        const priceKey = pair.replace('_', '');
        const price24h = responseData.prices_24h?.[priceKey];
        const coin = parseCoinData(pair, ticker, price24h);
        if (coin.last > 0) coins.push(coin);
      }

      coins.sort((a, b) => b.volumeIdr - a.volumeIdr);
      setAllCoins(coins);
      setError(null);
      setLastUpdate(new Date());
    } catch (e: any) {
      console.error('Data fetch error:', e);
      if (allCoins.length === 0) {
        setError('Gagal mengambil data dari INDODAX. Periksa koneksi Cloud.');
      }
    } finally {
      setLoading(false);
    }
  }, [allCoins.length]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredCoins = useMemo(() => {
    if (!searchQuery.trim()) return allCoins;
    const q = searchQuery.toLowerCase();
    return allCoins.filter(
      (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [allCoins, searchQuery]);

  const selectedCoin = useMemo(
    () => allCoins.find((c) => c.id === selectedCoinId) || null,
    [allCoins, selectedCoinId]
  );

  return {
    allCoins,
    filteredCoins,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCoin,
    setSelectedCoinId,
    lastUpdate,
    refetch: fetchData,
  };
}
