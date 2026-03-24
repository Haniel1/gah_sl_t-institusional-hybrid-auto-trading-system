import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Settings, Loader2, TrendingUp, TrendingDown, Bot, RefreshCw } from 'lucide-react';
import { formatIDR } from '@/hooks/useIndodax';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type TradeMode = 'auto' | 'buy' | 'sell';

interface AutoTradePanelProps {
  pair: string;
  strategy: string;
  onOpenSettings: () => void;
}

interface IndodaxBalance {
  idr: number;
  coinBalance: number;
  coinSymbol: string;
}

export default function AutoTradePanel({ pair, strategy, onOpenSettings }: AutoTradePanelProps) {
  const [autoTrade, setAutoTrade] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState<TradeMode | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasOpenPosition, setHasOpenPosition] = useState(false);
  const isBTC = pair === 'btc_idr';
  const defaultInitial = isBTC ? 1200000 : 300000;
  const [currentBalance, setCurrentBalance] = useState(defaultInitial);
  const [initialBalance, setInitialBalance] = useState(defaultInitial);
  const [indodaxBalance, setIndodaxBalance] = useState<IndodaxBalance | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const symbol = pair.replace('_idr', '').toUpperCase();
  const symbolLower = pair.replace('_idr', '');

  // Fetch real balance from Indodax + sync manual trades
  const syncBalance = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      // Get balance first, sync trades in background (non-blocking)
      const balRes = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_balance' }),
      });
      const data = await balRes.json();

      // Sync manual trades in background - don't block UI
      let syncData: any = {};
      try {
        const syncRes = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_trades', pair, strategy }),
        });
        syncData = await syncRes.json();
      } catch (e) {
        console.warn('sync_trades failed (non-critical):', e);
      }

      if (data?.return?.balance) {
        const idr = parseFloat(data.return.balance.idr || '0');
        const coinBal = parseFloat(data.return.balance[symbolLower] || '0');
        setIndodaxBalance({ idr, coinBalance: coinBal, coinSymbol: symbol });
        setLastSync(new Date());

        await supabase
          .from('auto_trade_config')
          .upsert({
            pair,
            current_balance: idr,
            coin_balance: coinBal,
            coin_symbol: symbol,
            initial_balance: defaultInitial,
          }, { onConflict: 'pair' });

        setCurrentBalance(idr);
      }

      if (showToast) {
        const syncMsg = syncData?.synced > 0 ? ` | ${syncData.synced} trade baru disinkronkan` : '';
        toast.success(`Saldo disinkronkan${syncMsg}`);
      }

      if (data?.error && showToast) toast.error(data.error);
    } catch (err) {
      console.error('Sync balance error:', err);
      if (showToast) toast.error('Gagal sinkronisasi saldo');
    } finally {
      setRefreshing(false);
    }
  }, [pair, symbolLower, symbol, strategy, defaultInitial]);

  // Load config from DB
  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await supabase
        .from('auto_trade_config')
        .select('*')
        .eq('pair', pair)
        .single();

      if (data) {
        setAutoTrade(data.enabled);
        setNotifications(data.notify_telegram);
        setInitialBalance(data.initial_balance || defaultInitial);
        setCurrentBalance(data.current_balance);
        setTotalPnl(data.total_pnl || 0);
        setHasOpenPosition(data.position === 'long' || data.status === 'holding');
        if (data.coin_balance) {
          setIndodaxBalance({
            idr: data.current_balance,
            coinBalance: data.coin_balance,
            coinSymbol: data.coin_symbol || symbol,
          });
        }
      } else {
        setAutoTrade(false);
        setNotifications(false);
        setInitialBalance(defaultInitial);
        setCurrentBalance(defaultInitial);
      }
    };
    loadConfig();
  }, [pair, symbol]);

  // Auto-sync every 30 seconds
  useEffect(() => {
    syncBalance();
    const interval = setInterval(() => syncBalance(), 10000);
    return () => clearInterval(interval);
  }, [syncBalance]);

  const toggleAutoTrade = async () => {
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', pair, strategy }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoTrade(data.config.enabled);
        setCurrentBalance(data.config.current_balance);
      }
    } catch (err) {
      console.error('Failed to toggle auto-trade:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeManualTrade = async (type: 'buy' | 'sell') => {
    setManualLoading(type);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const tickerEndpoint = `ticker/${pair.replace('_', '')}`;
      const proxyRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/indodax-proxy?endpoint=${encodeURIComponent(tickerEndpoint)}`
      );
      const proxyData = await proxyRes.json();
      const price = proxyData?.ticker?.last || proxyData?.ticker?.buy || proxyData?.last || 0;
      if (!price) {
        toast.error('Gagal mendapatkan harga terkini');
        return;
      }

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', pair, strategy, type, price }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentBalance(data.balance);
        const totalFormatted = data.total ? ` | Total: Rp ${Math.floor(data.total).toLocaleString('id-ID')}` : '';
        toast.success(`${type.toUpperCase()} ${symbol} berhasil @ Rp ${Number(price).toLocaleString('id-ID')}${totalFormatted}`);
        // Re-sync after trade
        setTimeout(() => syncBalance(), 3000);
      } else {
        toast.error(data.error || data.indodax_response?.error || 'Trade gagal');
        console.error('Trade failed:', data);
      }
    } catch (err) {
      console.error(`Failed to execute ${type}:`, err);
      toast.error('Gagal eksekusi trade');
    } finally {
      setManualLoading(null);
    }
  };

  const toggleNotifications = async () => {
    const newVal = !notifications;
    setNotifications(newVal);
    await supabase
      .from('auto_trade_config')
      .upsert({ pair, notify_telegram: newVal, enabled: autoTrade }, { onConflict: 'pair' });
  };

  // Use total_pnl from DB (realized P&L), not balance difference
  const [totalPnl, setTotalPnl] = useState(0);
  const pnl = totalPnl;
  const pnlPercent = initialBalance > 0 ? ((pnl / initialBalance) * 100).toFixed(2) : '0';

  return (
    <div className="terminal-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto Trade</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => syncBalance(true)}
            disabled={refreshing}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sinkronkan saldo dari Indodax"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onOpenSettings} className="text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="text-center mb-1">
        <span className="font-mono text-xs text-muted-foreground">{symbol}/IDR</span>
      </div>

      {/* Buy / Auto / Sell buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => executeManualTrade('buy')}
          disabled={manualLoading !== null || loading || hasOpenPosition}
          className="flex items-center justify-center gap-1 py-2 rounded-md font-mono text-xs font-semibold transition-all bg-profit/15 text-profit border border-profit/30 hover:bg-profit/25 disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasOpenPosition ? 'Sudah ada posisi BUY terbuka. Jual dulu.' : 'Beli'}
        >
          {manualLoading === 'buy' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <TrendingUp className="w-3 h-3" />
          )}
          BUY
        </button>

        <button
          onClick={toggleAutoTrade}
          disabled={loading || manualLoading !== null}
          className={`flex items-center justify-center gap-1 py-2 rounded-md font-mono text-xs font-semibold transition-all ${
            autoTrade
              ? 'bg-primary/20 text-primary border border-primary/30 glow-green'
              : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground'
          }`}
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Bot className="w-3 h-3" />
          )}
          AUTO
        </button>

        <button
          onClick={() => executeManualTrade('sell')}
          disabled={manualLoading !== null || loading}
          className="flex items-center justify-center gap-1 py-2 rounded-md font-mono text-xs font-semibold transition-all bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25 disabled:opacity-50"
        >
          {manualLoading === 'sell' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          SELL
        </button>
      </div>

      {/* Open position indicator */}
      {hasOpenPosition && (
        <div className="text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-mono border border-accent/30">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            POSISI TERBUKA · Jual dulu
          </span>
        </div>
      )}

      {/* Auto status indicator */}
      {autoTrade && (
        <div className="text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-profit/10 text-profit text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />
            AUTO-TRADE AKTIF
          </span>
        </div>
      )}

      {/* Indodax Real Balance */}
      {indodaxBalance && (
        <div className="bg-muted/50 rounded-md p-2 space-y-1 border border-border/50">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Saldo Indodax (Live)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground">IDR</p>
              <p className="font-mono text-xs text-foreground">{formatIDR(indodaxBalance.idr)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{symbol}</p>
              <p className="font-mono text-xs text-foreground">{indodaxBalance.coinBalance.toFixed(8)}</p>
            </div>
          </div>
          {lastSync && (
            <p className="text-[9px] text-muted-foreground text-right">
              Sync: {lastSync.toLocaleTimeString('id-ID')}
            </p>
          )}
        </div>
      )}

      {/* Internal Balance */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-muted rounded-md p-2">
          <p className="text-[10px] text-muted-foreground">Initial</p>
          <p className="font-mono text-xs text-foreground">{formatIDR(initialBalance)}</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-[10px] text-muted-foreground">Current</p>
          <p className={`font-mono text-xs ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatIDR(currentBalance)}</p>
        </div>
      </div>

      {pnl !== 0 && (
        <div className={`text-center font-mono text-xs ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          {pnl >= 0 ? '+' : ''}{formatIDR(pnl)} ({pnlPercent}%)
        </div>
      )}

      {/* Notifications */}
      <button
        onClick={toggleNotifications}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors ${
          notifications
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'bg-muted text-muted-foreground border border-border'
        }`}
      >
        {notifications ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        Telegram Alerts: {notifications ? 'ON' : 'OFF'}
      </button>

      {autoTrade && (
        <div className="text-[10px] text-muted-foreground space-y-1 animate-fade-in">
          <p>Strategi berjalan di server 24/7</p>
        </div>
      )}
    </div>
  );
}
