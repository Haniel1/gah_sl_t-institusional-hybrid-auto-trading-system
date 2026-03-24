import { useState, useEffect, useCallback } from 'react';
import { Wallet, RefreshCw, Loader2, TrendingUp, TrendingDown, Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Holding {
  symbol: string;
  available: number;
  hold: number;
  total: number;
}

interface TickerData {
  last: string;
  name: string;
}

export default function IndodaxPortfolio() {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [tickers, setTickers] = useState<Record<string, TickerData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('indodax-account', {
        body: { user_id: user?.id },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setHoldings(data.holdings || []);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message || 'Gagal mengambil data akun');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTickers = useCallback(async () => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/indodax-proxy?endpoint=summaries`);
      const data = await res.json();
      if (data?.tickers) setTickers(data.tickers);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccount();
    fetchTickers();
  }, [fetchAccount, fetchTickers]);

  const idrBalance = holdings.find(h => h.symbol === 'IDR');
  const coinHoldings = holdings.filter(h => h.symbol !== 'IDR');

  // Calculate total portfolio value in IDR
  let totalValue = idrBalance?.total || 0;
  const enrichedCoins = coinHoldings.map(h => {
    const pair = `${h.symbol.toLowerCase()}_idr`;
    const ticker = tickers[pair];
    const price = ticker ? parseFloat(ticker.last) : 0;
    const value = h.total * price;
    totalValue += value;
    return { ...h, price, value, name: ticker?.name || h.symbol };
  }).filter(c => c.value > 100); // Filter dust

  enrichedCoins.sort((a, b) => b.value - a.value);

  const formatIDR = (n: number) => {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(1)}K`;
    return `Rp ${n.toLocaleString('id-ID')}`;
  };

  return (
    <div className="terminal-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Portofolio Indodax
          </h3>
        </div>
        <button
          onClick={() => { fetchAccount(); fetchTickers(); }}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {error && (
        <div className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Total Portfolio Value */}
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Nilai Portofolio</p>
            <p className="text-lg font-bold font-mono text-foreground">{formatIDR(totalValue)}</p>
          </div>

          {/* IDR Balance */}
          {idrBalance && (
            <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-primary">Rp</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">IDR</p>
                  <p className="text-[10px] text-muted-foreground">Rupiah</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono font-semibold text-foreground">{formatIDR(idrBalance.available)}</p>
                {idrBalance.hold > 0 && (
                  <p className="text-[10px] text-warning font-mono">Hold: {formatIDR(idrBalance.hold)}</p>
                )}
              </div>
            </div>
          )}

          {/* Coin Holdings */}
          {enrichedCoins.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Coins className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Koin Aktif ({enrichedCoins.length})
                </p>
              </div>
              {enrichedCoins.map(coin => {
                const pctOfPortfolio = totalValue > 0 ? (coin.value / totalValue * 100) : 0;
                return (
                  <div key={coin.symbol} className="flex items-center justify-between bg-muted/30 hover:bg-muted/60 rounded-md px-3 py-2 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center shrink-0">
                        <span className="text-[8px] font-bold text-foreground">{coin.symbol.slice(0, 3)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">{coin.symbol}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{coin.name}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-semibold text-foreground">{formatIDR(coin.value)}</p>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono">{coin.total.toLocaleString('id-ID', { maximumFractionDigits: 6 })}</span>
                        <span className="text-[10px] text-primary/70">({pctOfPortfolio.toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {enrichedCoins.length === 0 && !idrBalance && (
            <p className="text-xs text-muted-foreground text-center py-4">Tidak ada aset ditemukan</p>
          )}

          {lastUpdate && (
            <p className="text-[10px] text-muted-foreground text-center">
              Terakhir diperbarui: {lastUpdate.toLocaleTimeString('id-ID')}
            </p>
          )}
        </>
      )}

      {loading && !error && (
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Memuat data akun...</span>
        </div>
      )}
    </div>
  );
}
