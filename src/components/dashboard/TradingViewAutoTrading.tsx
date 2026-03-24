import { useState, useCallback, useEffect } from 'react';
import { CoinData } from '@/types/crypto';
import { formatRupiah } from '@/utils/format';
import { supabase } from '@/integrations/supabase/client';
import {
  Layers, Power, Loader2, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, Minus, Bell, BellOff,
  RefreshCw, Settings2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';

interface Props {
  coins: CoinData[];
}

interface AutoTradeConfig {
  id: string;
  pair: string;
  coin_symbol: string;
  strategy: string;
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
  last_trade_at: string | null;
}

interface TradeLog {
  id: string;
  coin_symbol: string;
  trade_type: string;
  price: number;
  coin_amount: number;
  idr_value: number;
  pnl: number;
  pnl_pct: number;
  reason: string;
  telegram_sent: boolean;
  created_at: string;
}

const INDICATOR_NAMES: Record<string, string> = {
  'indicator-bill-williams-3lines': "Bill William's 3 Lines",
  'indicator-displaced-ema': 'Displaced EMA',
  'indicator-ma-exp-ribbon': 'MA Exp Ribbon',
  'indicator-oscillators': 'Oscillators',
  'indicator-swing-trading': 'Swing Trading',
  'indicator-volume-based': 'Volume Based',
};

export function TradingViewAutoTrading({ coins }: Props) {
  const [configs, setConfigs] = useState<AutoTradeConfig[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    const { data } = await supabase
      .from('auto_trade_config')
      .select('*')
      .like('strategy', 'indicator-%')
      .order('coin_symbol');
    if (data) setConfigs((data as any[]).filter((c: any) => c.coin_symbol));
  }, []);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('auto_trade_log')
      .select('*')
      .like('reason', '%indicator%')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setTradeLogs(data as any[]);
  }, []);

  useEffect(() => {
    Promise.all([fetchConfigs(), fetchLogs()]).then(() => setLoading(false));

    const configChannel = supabase.channel('tv-auto-trade-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auto_trade_config' }, () => fetchConfigs())
      .subscribe();
    const logChannel = supabase.channel('tv-auto-trade-log-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auto_trade_log' }, () => fetchLogs())
      .subscribe();

    return () => { supabase.removeChannel(configChannel); supabase.removeChannel(logChannel); };
  }, [fetchConfigs, fetchLogs]);

  const toggleEnabled = useCallback(async (config: AutoTradeConfig) => {
    setUpdating(config.id);
    await supabase.from('auto_trade_config').update({ enabled: !config.enabled, updated_at: new Date().toISOString() }).eq('id', config.id);
    toast({ title: `${config.coin_symbol} ${getIndicatorLabel(config.strategy)} ${!config.enabled ? 'diaktifkan' : 'dinonaktifkan'}` });
    setUpdating(null);
  }, []);

  const toggleTelegram = useCallback(async (config: AutoTradeConfig) => {
    setUpdating(config.id);
    await supabase.from('auto_trade_config').update({ telegram_enabled: !config.telegram_enabled, updated_at: new Date().toISOString() }).eq('id', config.id);
    setUpdating(null);
  }, []);

  const updateTpSl = useCallback(async (config: AutoTradeConfig, tp: number, sl: number) => {
    await supabase.from('auto_trade_config').update({ tp_pct: tp, sl_pct: sl, updated_at: new Date().toISOString() }).eq('id', config.id);
    toast({ title: `${config.coin_symbol} TP/SL diperbarui: +${tp}% / -${sl}%` });
    setShowSettings(null);
  }, []);

  const disableAll = useCallback(async () => {
    const ids = configs.map(c => c.id);
    if (ids.length === 0) return;
    await supabase.from('auto_trade_config').update({ enabled: false, updated_at: new Date().toISOString() }).in('id', ids);
    toast({ title: 'Semua Trading View auto-trade dinonaktifkan' });
  }, [configs]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (configs.length === 0) return null;

  const enabledCount = configs.filter(c => c.enabled).length;
  const totalPnl = configs.reduce((acc, c) => acc + (c.total_pnl || 0), 0);
  const totalWins = configs.reduce((acc, c) => acc + (c.win_count || 0), 0);
  const totalLosses = configs.reduce((acc, c) => acc + (c.loss_count || 0), 0);

  const sortedConfigs = [...configs].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return (b.total_pnl || 0) - (a.total_pnl || 0);
  });

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Trading View Auto-Trade
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">
            {enabledCount} aktif
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={disableAll} className="px-2 py-1 text-[10px] font-semibold rounded bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20 transition-colors">
            Semua OFF
          </button>
          <Link to="/trading-view" className="px-2 py-1 text-[10px] font-semibold rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors">
            🔧 Kelola
          </Link>
          <button onClick={() => { fetchConfigs(); fetchLogs(); }} className="p-1 rounded hover:bg-border transition-colors">
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      <p className="text-[10px] text-muted-foreground px-1">
        Trading otomatis berdasarkan indikator teknikal dari halaman Trading View. Setiap indikator memiliki logika sinyal independen.
      </p>

      {/* Coin grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {sortedConfigs.map(config => {
          const coin = coins.find(c => c.symbol === config.coin_symbol);
          const isUpdating = updating === config.id;
          const pnl = config.total_pnl || 0;
          const isHolding = config.status === 'holding';
          const unrealizedPnl = isHolding && config.entry_price && coin
            ? ((coin.last - config.entry_price) / config.entry_price) * 100
            : 0;
          const indicatorLabel = getIndicatorLabel(config.strategy);

          return (
            <div
              key={config.id}
              className={`border rounded-lg p-2.5 transition-all ${
                config.enabled ? 'bg-card border-border' : 'bg-muted border-border/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={() => toggleEnabled(config)}
                    disabled={isUpdating}
                    className="scale-75"
                  />
                  <span className="text-xs font-bold text-foreground">{config.coin_symbol}</span>
                  {isHolding && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent font-semibold">HOLD</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleTelegram(config)}
                    className={`p-0.5 rounded transition-colors ${config.telegram_enabled ? 'text-primary' : 'text-muted-foreground/40'}`}
                  >
                    {config.telegram_enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => setShowSettings(showSettings === config.id ? null : config.id)}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="text-[9px] text-accent font-semibold mb-1">{indicatorLabel}</div>

              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-foreground">
                  {coin ? formatRupiah(coin.last) : '—'}
                </div>
                <div className={`text-[10px] font-semibold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  P&L: {pnl >= 0 ? '+' : ''}Rp {Math.round(pnl).toLocaleString('id-ID')}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                <span>W:{config.win_count} L:{config.loss_count}</span>
                <span>TP:+{config.tp_pct}%</span>
                <span>SL:-{config.sl_pct}%</span>
                {isHolding && config.entry_price && (
                  <span className={`font-semibold ${unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    U: {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}%
                  </span>
                )}
              </div>

              {showSettings === config.id && (
                <SettingsPanel config={config} onSave={updateTpSl} onClose={() => setShowSettings(null)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Trade Logs */}
      {tradeLogs.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <h4 className="text-[10px] text-muted-foreground font-semibold uppercase">Trade Log (Indicator-Based)</h4>
          {tradeLogs.map(log => (
            <div key={log.id} className="flex items-center gap-2 text-[10px] px-2 py-1.5 bg-muted rounded">
              {log.pnl > 0 ? (
                <CheckCircle2 className="h-3 w-3 text-profit shrink-0" />
              ) : log.pnl < 0 ? (
                <XCircle className="h-3 w-3 text-loss shrink-0" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="font-semibold text-foreground">{log.coin_symbol}</span>
              <span className={log.trade_type === 'buy' ? 'text-profit' : 'text-loss'}>
                {log.trade_type.toUpperCase()}
              </span>
              <span className="text-muted-foreground">{formatRupiah(log.price)}</span>
              {log.pnl !== 0 && (
                <span className={`font-semibold ${log.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {log.pnl >= 0 ? '+' : ''}Rp {Math.round(log.pnl).toLocaleString('id-ID')}
                </span>
              )}
              <span className="text-muted-foreground ml-auto shrink-0">
                {new Date(log.created_at).toLocaleTimeString('id-ID')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getIndicatorLabel(strategy: string): string {
  return INDICATOR_NAMES[strategy] || strategy.replace('indicator-', '').replace(/-/g, ' ');
}

function SettingsPanel({ config, onSave, onClose }: { config: AutoTradeConfig; onSave: (c: AutoTradeConfig, tp: number, sl: number) => void; onClose: () => void }) {
  const [tp, setTp] = useState(config.tp_pct);
  const [sl, setSl] = useState(config.sl_pct);

  return (
    <div className="mt-2 p-2 bg-muted rounded border border-border space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-muted-foreground w-8">TP %</label>
        <input type="number" value={tp} onChange={e => setTp(Number(e.target.value))}
          className="flex-1 text-[10px] px-1.5 py-1 rounded border border-border bg-background text-foreground" step={0.5} min={0.5} max={50} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-muted-foreground w-8">SL %</label>
        <input type="number" value={sl} onChange={e => setSl(Number(e.target.value))}
          className="flex-1 text-[10px] px-1.5 py-1 rounded border border-border bg-background text-foreground" step={0.5} min={0.5} max={50} />
      </div>
      <div className="flex gap-1">
        <button onClick={() => onSave(config, tp, sl)} className="flex-1 text-[10px] py-1 rounded bg-primary text-primary-foreground font-semibold">Simpan</button>
        <button onClick={onClose} className="flex-1 text-[10px] py-1 rounded border border-border text-muted-foreground font-semibold">Batal</button>
      </div>
    </div>
  );
}
