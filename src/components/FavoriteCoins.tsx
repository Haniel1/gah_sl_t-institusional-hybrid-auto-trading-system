import { useState, useEffect, useMemo } from 'react';
import { Star, StarOff, Zap, ArrowUpDown, Loader2, Radar, CheckCircle2 } from 'lucide-react';
import { useIndodaxTickers, formatIDR, type CoinTicker } from '@/hooks/useIndodax';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface FavoriteCoinsProps {
  onSelectPair: (pair: string) => void;
  selectedPair: string;
}

interface SpreadInfo extends CoinTicker {
  spread: number;
  spreadPercent: number;
}

export default function FavoriteCoins({ onSelectPair, selectedPair }: FavoriteCoinsProps) {
  const { tickers, loading: tickersLoading } = useIndodaxTickers();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [autoTradeLoading, setAutoTradeLoading] = useState<string | null>(null);
  const [autoTradeConfigs, setAutoTradeConfigs] = useState<Record<string, boolean>>({});
  const [discovering, setDiscovering] = useState(false);

  // Load favorites and auto-trade configs from DB
  useEffect(() => {
    const load = async () => {
      const { data: configs } = await supabase
        .from('auto_trade_config')
        .select('pair, enabled');
      if (configs) {
        const favSet = new Set<string>();
        const configMap: Record<string, boolean> = {};
        for (const c of configs) {
          if (c.enabled) favSet.add(c.pair);
          configMap[c.pair] = c.enabled;
        }
        setFavorites(favSet);
        setAutoTradeConfigs(configMap);
      }
    };
    load();

    // Subscribe to changes
    const channel = supabase
      .channel('auto-trade-favorites')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auto_trade_config' }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Calculate spread for all tickers
  const coinsWithSpread: SpreadInfo[] = useMemo(() => {
    return tickers
      .filter(t => t.buy > 0 && t.sell > 0)
      .map(t => {
        const spread = t.sell - t.buy;
        const spreadPercent = (spread / t.last) * 100;
        return { ...t, spread, spreadPercent };
      })
      .sort((a, b) => a.spreadPercent - b.spreadPercent);
  }, [tickers]);

  // Tight spread coins: spread < 0.5% (good for auto-trading)
  const tightSpreadCoins = useMemo(() => {
    return coinsWithSpread.filter(c => c.spreadPercent < 0.5 && c.spreadPercent > 0);
  }, [coinsWithSpread]);

  const favoriteCoinsList = useMemo(() => {
    return coinsWithSpread.filter(c => favorites.has(c.pair));
  }, [coinsWithSpread, favorites]);

  const displayList = showAll ? tightSpreadCoins : favoriteCoinsList;

  const toggleFavorite = async (pair: string) => {
    setAutoTradeLoading(pair);
    try {
      const isCurrentlyFav = favorites.has(pair);
      if (isCurrentlyFav) {
        // Disable auto-trade
        await supabase
          .from('auto_trade_config')
          .update({ enabled: false })
          .eq('pair', pair);
        setFavorites(prev => { const n = new Set(prev); n.delete(pair); return n; });
      } else {
        // Enable/disable auto-trade tanpa mengubah strategy existing
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle', pair }),
        });
        setFavorites(prev => new Set(prev).add(pair));
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setAutoTradeLoading(null);
    }
  };

  const autoDiscoverCoins = async () => {
    setDiscovering(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-discover-coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: `${data.discovered} koin ditemukan`,
          description: `${data.newAutoTrade} ditambah ke auto-trade, ${data.newSimulation} ke simulasi`,
        });
      } else {
        toast({ title: 'Gagal discover', description: data.error, variant: 'destructive' });
      }
    } catch (err) {
      console.error('Auto-discover failed:', err);
      toast({ title: 'Error', description: 'Gagal auto-discover koin', variant: 'destructive' });
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <div className="terminal-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {showAll ? 'Low Spread Coins' : 'Favorit Auto-Trade'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={autoDiscoverCoins}
            disabled={discovering}
            className="flex items-center gap-1 text-[10px] font-mono text-accent hover:underline disabled:opacity-50"
          >
            {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radar className="w-3 h-3" />}
            {discovering ? 'Scanning...' : 'Auto Scan'}
          </button>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] font-mono text-primary hover:underline"
          >
            {showAll ? 'Favorit' : 'Cari Koin'}
          </button>
        </div>
      </div>

      {/* Fee & strategy info */}
      <div className="bg-muted rounded-md p-2 text-[10px] text-muted-foreground space-y-0.5">
        <p>💡 Fee Indodax: <span className="text-foreground font-semibold">0.3%</span> per transaksi (0.6% round-trip)</p>
        <p>📈 BUY: GainzAlgo + Fabio keduanya BUY → eksekusi beli</p>
        <p>📉 SELL: Fabio kasih sinyal SELL → eksekusi jual</p>
        <p>🔍 Koin spread {'<'} 0.5% & volume {'>'} 10jt cocok auto-trade</p>
      </div>

      {tickersLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground">
          {showAll ? 'Tidak ada koin dengan spread rendah' : 'Belum ada koin favorit. Klik "Cari Koin" untuk menambah.'}
        </div>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin">
          {displayList.map(coin => {
            const symbol = coin.pair.replace('_idr', '').toUpperCase();
            const isFav = favorites.has(coin.pair);
            const isSelected = selectedPair === coin.pair;
            const feeAdjustedSpread = coin.spreadPercent + 0.6; // 0.3% buy + 0.3% sell
            const isProfitable = coin.spreadPercent < 0.4; // Spread low enough to overcome fees

            return (
              <div
                key={coin.pair}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'
                }`}
                onClick={() => onSelectPair(coin.pair)}
              >
                <button
                  onClick={e => { e.stopPropagation(); toggleFavorite(coin.pair); }}
                  className="shrink-0"
                  disabled={autoTradeLoading === coin.pair}
                >
                  {autoTradeLoading === coin.pair ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : isFav ? (
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  ) : (
                    <StarOff className="w-3.5 h-3.5 text-muted-foreground hover:text-yellow-500" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-xs text-foreground">{symbol}</span>
                    {isFav && <span className="text-[8px] bg-profit/20 text-profit px-1 rounded">AUTO</span>}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">{formatIDR(coin.last)}</p>
                </div>

                <div className="text-right">
                  <div className="flex items-center gap-0.5">
                    <ArrowUpDown className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className={`font-mono text-[10px] ${isProfitable ? 'text-profit' : 'text-loss'}`}>
                      {coin.spreadPercent.toFixed(3)}%
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    net: {feeAdjustedSpread.toFixed(3)}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {favoriteCoinsList.length > 0 && !showAll && (
        <div className="text-[10px] text-muted-foreground text-center">
          {favoriteCoinsList.length} koin aktif auto-trade
        </div>
      )}
    </div>
  );
}
