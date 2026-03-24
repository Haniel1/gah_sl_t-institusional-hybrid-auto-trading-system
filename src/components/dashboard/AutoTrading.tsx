import { useState, useCallback, useEffect } from 'react';
import { CoinData } from '@/types/crypto';
import { formatRupiah } from '@/utils/format';
import { supabase } from '@/integrations/supabase/client';
import {
  Bot, Loader2, TrendingUp, TrendingDown, Bell, BellOff,
  AlertTriangle, RefreshCw, Settings2, Search,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Props {
  coins: CoinData[];
}

interface AutoTradeConfig {
  id: string;
  coin_symbol: string;
  enabled: boolean;
  telegram_enabled: boolean;
  tp_pct: number;
  sl_pct: number;
  initial_capital: number;
  current_capital: number;
  coin_balance: number;
  entry_price: number | null;
  entry_time: string | null;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  status: string;
  position: string;
  last_trade_at: string | null;
  strategy: string;
}

// Fixed capital allocation
const COIN_ALLOCATION: Record<string, number> = {
  // Alpha Simons (Blue Chip & High Volume)
  BTC: 400000, ETH: 400000, BNB: 400000, XRP: 400000, BCH: 400000,
  // Institutional 3.0 (Mid-Cap)
  SOL: 400000, LINK: 400000, ICP: 200000, DOT: 400000, ADA: 400000, NEAR: 400000,
};

const STRATEGY_OPTIONS = [
  { key: 'alpha_simons', label: '⚡ Alpha Simons', desc: 'Momentum & Scalping', color: 'terminal-yellow' },
  { key: 'institutional_smc', label: '🏛️ Institutional 3.0', desc: 'Smart Money Concepts', color: 'primary' },
];

function AddCoinToAutoTrade({ coins, existingSymbols, onAdd }: {
  coins: CoinData[];
  existingSymbols: string[];
  onAdd: (symbol: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const availableCoins = coins
    .filter(c => !existingSymbols.includes(c.symbol))
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    })
    .sort((a, b) => b.volumeIdr - a.volumeIdr)
    .slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
          + Tambah Koin
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm text-foreground">Tambah Koin Auto Trade</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari koin..."
            className="w-full pl-7 pr-3 py-2 text-xs rounded border border-border bg-background text-foreground" />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {availableCoins.map(coin => (
            <button key={coin.id} onClick={() => { onAdd(coin.symbol); setOpen(false); setSearch(''); }}
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-muted transition-colors text-left">
              <div>
                <span className="text-xs font-bold text-foreground">{coin.symbol}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{coin.name}</span>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-foreground">{formatRupiah(coin.last)}</div>
                <div className="text-[9px] text-muted-foreground">
                  Modal: Rp {(COIN_ALLOCATION[coin.symbol] || 400000).toLocaleString('id-ID')}
                </div>
              </div>
            </button>
          ))}
          {availableCoins.length === 0 && <p className="text-center text-[10px] text-muted-foreground py-4">Tidak ada koin tersedia</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AutoTrading({ coins }: Props) {
  const [configs, setConfigs] = useState<AutoTradeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    const { data } = await supabase.from('auto_trade_config').select('*').eq('strategy', 'trend-following').order('coin_symbol');
    if (data) setConfigs(data as any[]);
  }, []);

  useEffect(() => {
    fetchConfigs().then(() => setLoading(false));
    const ch = supabase.channel('auto-config-tf')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auto_trade_config' }, () => fetchConfigs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchConfigs]);

  const addCoinToAutoTrade = useCallback(async (symbol: string) => {
    const pair = `${symbol.toLowerCase()}_idr`;
    const initCap = COIN_ALLOCATION[symbol] || 400000;
    const { error } = await supabase.from('auto_trade_config').insert({
      pair, coin_symbol: symbol, strategy: 'trend-following',
      enabled: false, tp_pct: 5, sl_pct: 3,
      initial_balance: initCap, current_balance: initCap,
      initial_capital: initCap, current_capital: initCap,
    });
    if (error) {
      toast({ title: `Gagal menambah ${symbol}`, variant: 'destructive' });
    } else {
      toast({ title: `${symbol} ditambahkan (Modal: Rp ${initCap.toLocaleString('id-ID')})` });
      fetchConfigs();
    }
  }, [fetchConfigs]);

  const toggleEnabled = useCallback(async (config: AutoTradeConfig) => {
    setUpdating(config.id);
    await supabase.from('auto_trade_config').update({ enabled: !config.enabled, updated_at: new Date().toISOString() }).eq('id', config.id);
    toast({ title: `${config.coin_symbol} ${!config.enabled ? 'diaktifkan' : 'dinonaktifkan'}` });
    setUpdating(null);
  }, []);

  const toggleTelegram = useCallback(async (config: AutoTradeConfig) => {
    setUpdating(config.id);
    await supabase.from('auto_trade_config').update({
      telegram_enabled: !config.telegram_enabled,
      notify_telegram: !config.telegram_enabled,
      updated_at: new Date().toISOString(),
    }).eq('id', config.id);
    setUpdating(null);
  }, []);

  const updateSlPct = useCallback(async (config: AutoTradeConfig, sl: number) => {
    await supabase.from('auto_trade_config').update({ sl_pct: sl, updated_at: new Date().toISOString() }).eq('id', config.id);
    toast({ title: `${config.coin_symbol} SL → -${sl}%` });
    setShowSettings(null);
  }, []);

  const enableAll = useCallback(async () => {
    const ids = configs.map(c => c.id);
    if (ids.length === 0) return;
    await supabase.from('auto_trade_config').update({ enabled: true, updated_at: new Date().toISOString() }).in('id', ids);
    toast({ title: 'Semua koin diaktifkan' });
  }, [configs]);

  const disableAll = useCallback(async () => {
    const ids = configs.map(c => c.id);
    if (ids.length === 0) return;
    await supabase.from('auto_trade_config').update({ enabled: false, updated_at: new Date().toISOString() }).in('id', ids);
    toast({ title: 'Semua koin dinonaktifkan' });
  }, [configs]);

  const enabledCount = configs.filter(c => c.enabled).length;
  const totalPnl = configs.reduce((acc, c) => acc + (c.total_pnl || 0), 0);
  const totalWins = configs.reduce((acc, c) => acc + (c.win_count || 0), 0);
  const totalLosses = configs.reduce((acc, c) => acc + (c.loss_count || 0), 0);
  const totalCapital = configs.reduce((acc, c) => acc + (c.current_capital || 0), 0);
  const existingSymbols = configs.map(c => c.coin_symbol);

  const sortedConfigs = [...configs].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return (b.total_pnl || 0) - (a.total_pnl || 0);
  });

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Auto Trading — Trend Following
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">
            {enabledCount} aktif
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <AddCoinToAutoTrade coins={coins} existingSymbols={existingSymbols} onAdd={addCoinToAutoTrade} />
          <button onClick={enableAll} className="px-2 py-1 text-[10px] font-semibold rounded bg-profit/10 text-profit border border-profit/20 hover:bg-profit/20 transition-colors">
            Semua ON
          </button>
          <button onClick={disableAll} className="px-2 py-1 text-[10px] font-semibold rounded bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20 transition-colors">
            Semua OFF
          </button>
          <Link to="/trade-history" className="px-2 py-1 text-[10px] font-semibold rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors">
            📊 Riwayat
          </Link>
          <button onClick={fetchConfigs} className="p-1 rounded hover:bg-border transition-colors">
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="px-2.5 py-2 bg-muted rounded border border-border text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total Modal</div>
          <div className="text-sm font-bold text-foreground">Rp {Math.round(totalCapital).toLocaleString('id-ID')}</div>
        </div>
        <div className="px-2.5 py-2 bg-muted rounded border border-border text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total P&L</div>
          <div className={`text-sm font-bold ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
            {totalPnl >= 0 ? '+' : ''}Rp {Math.round(totalPnl).toLocaleString('id-ID')}
          </div>
        </div>
        <div className="px-2.5 py-2 bg-muted rounded border border-border text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Win/Loss</div>
          <div className="text-sm font-bold text-foreground">{totalWins}/{totalLosses}</div>
        </div>
        <div className="px-2.5 py-2 bg-muted rounded border border-border text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Win Rate</div>
          <div className="text-sm font-bold text-foreground">
            {totalWins + totalLosses > 0 ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1) : '0'}%
          </div>
        </div>
        <div className="px-2.5 py-2 bg-muted rounded border border-border text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Aktif</div>
          <div className="text-sm font-bold text-accent">{enabledCount} koin</div>
        </div>
      </div>

      {/* Strategy Description */}
      <div className="flex items-start gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
        <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <div className="text-[10px] text-primary space-y-0.5">
          <p className="font-bold">Trend Following + Buy Low, Sell High</p>
          <p>• Filter tren <b>EMA 200 (H4)</b> → Bullish = hanya BUY, Bearish = hanya SELL</p>
          <p>• Entry di <b>Support/Resistance</b> (Swing Low/High 20 bar) + konfirmasi candlestick + RSI</p>
          <p>• Stop Loss adaptif <b>ATR × 2</b> | Risk:Reward minimal <b>1:2</b></p>
          <p>• Modal terisolasi per koin (Isolated Compounding)</p>
        </div>
      </div>

      {/* Coin grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {sortedConfigs.map(config => {
          const coin = coins.find(c => c.symbol === config.coin_symbol);
          const isUpdating = updating === config.id;
          const pnl = config.total_pnl || 0;
          const isHolding = config.position === 'long';
          const unrealizedPnl = isHolding && config.entry_price && coin
            ? ((coin.last - config.entry_price) / config.entry_price) * 100
            : 0;
          const alloc = COIN_ALLOCATION[config.coin_symbol] || 400000;
          const capitalChange = config.current_capital - alloc;

          return (
            <div key={config.id} className={`border rounded-lg p-2.5 transition-all ${
              config.enabled ? 'bg-card border-border' : 'bg-muted border-border/50 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Switch checked={config.enabled} onCheckedChange={() => toggleEnabled(config)} disabled={isUpdating} className="scale-75" />
                  <span className="text-xs font-bold text-foreground">{config.coin_symbol}</span>
                  {isHolding && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent font-semibold">HOLD</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleTelegram(config)} className={`p-0.5 rounded transition-colors ${config.telegram_enabled ? 'text-primary' : 'text-muted-foreground/40'}`}>
                    {config.telegram_enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                  </button>
                  <button onClick={() => setShowSettings(showSettings === config.id ? null : config.id)} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Settings2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-foreground">{coin ? formatRupiah(coin.last) : '—'}</div>
                <div className={`text-[10px] font-semibold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  P&L: {pnl >= 0 ? '+' : ''}Rp {Math.round(pnl).toLocaleString('id-ID')}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                <span>Modal: Rp {Math.round(config.current_capital).toLocaleString('id-ID')}</span>
                {capitalChange !== 0 && (
                  <span className={capitalChange > 0 ? 'text-profit' : 'text-loss'}>
                    ({capitalChange > 0 ? '+' : ''}{((capitalChange / alloc) * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                <span>W:{config.win_count} L:{config.loss_count}</span>
                <span>SL:-{config.sl_pct}% (ATR)</span>
                {isHolding && config.entry_price && (
                  <span className={`font-semibold ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    U: {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}%
                  </span>
                )}
              </div>

              {showSettings === config.id && (
                <SettingsPanel config={config} onSave={updateSlPct} onClose={() => setShowSettings(null)} />
              )}
            </div>
          );
        })}
        {sortedConfigs.length === 0 && (
          <div className="col-span-full text-center py-6 text-muted-foreground text-xs">
            Belum ada koin. Klik "Tambah Koin" atau tambahkan koin default: {DEFAULT_COINS.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ config, onSave, onClose }: { config: AutoTradeConfig; onSave: (c: AutoTradeConfig, sl: number) => void; onClose: () => void }) {
  const [sl, setSl] = useState(config.sl_pct);

  return (
    <div className="mt-2 p-2 bg-muted rounded border border-border space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-muted-foreground w-16">Max SL %</label>
        <input type="number" value={sl} onChange={e => setSl(Number(e.target.value))}
          className="flex-1 text-[10px] px-1.5 py-1 rounded border border-border bg-background text-foreground" step={0.5} min={1} max={20} />
      </div>
      <p className="text-[8px] text-muted-foreground">SL sebenarnya dihitung adaptif berdasarkan ATR × 2, tapi tidak akan melebihi persentase ini.</p>
      <div className="flex gap-1">
        <button onClick={() => onSave(config, sl)} className="flex-1 text-[10px] py-1 rounded bg-primary text-primary-foreground font-semibold">Simpan</button>
        <button onClick={onClose} className="flex-1 text-[10px] py-1 rounded border border-border text-muted-foreground font-semibold">Batal</button>
      </div>
    </div>
  );
}
