import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatRupiah } from '@/utils/format';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Filter, TrendingUp, TrendingDown, Calendar, BarChart3, Loader2,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

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

export default function TradeHistory() {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [coinFilter, setCoinFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('auto_trade_log').select('*').order('created_at', { ascending: true }).limit(1000);
      if (data) setLogs(data as any[]);
      setLoading(false);
    }
    fetch();
  }, []);

  const coins = useMemo(() => Array.from(new Set(logs.map(l => l.coin_symbol))).sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (coinFilter !== 'ALL' && l.coin_symbol !== coinFilter) return false;
    if (typeFilter !== 'ALL' && l.trade_type !== typeFilter) return false;
    if (dateFrom && l.created_at < dateFrom) return false;
    if (dateTo && l.created_at > dateTo + 'T23:59:59') return false;
    return true;
  }), [logs, coinFilter, dateFrom, dateTo, typeFilter]);

  const equityCurve = useMemo(() => {
    let cumPnl = 0;
    return filtered.filter(l => l.trade_type === 'sell').map(l => {
      cumPnl += l.pnl;
      return { date: new Date(l.created_at).toLocaleDateString('id-ID'), pnl: Math.round(cumPnl) };
    });
  }, [filtered]);

  const totalPnl = filtered.filter(l => l.trade_type === 'sell').reduce((acc, l) => acc + l.pnl, 0);
  const wins = filtered.filter(l => l.trade_type === 'sell' && l.pnl > 0).length;
  const losses = filtered.filter(l => l.trade_type === 'sell' && l.pnl < 0).length;

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/" className="p-1 rounded hover:bg-border transition-colors"><ArrowLeft className="h-4 w-4 text-muted-foreground" /></Link>
        <BarChart3 className="h-4 w-4 text-accent" />
        <h1 className="text-sm font-bold">Riwayat Trading & Analisa</h1>
      </div>

      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap gap-2 items-center">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select value={coinFilter} onChange={e => setCoinFilter(e.target.value)} className="text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground">
            <option value="ALL">Semua Koin</option>
            {coins.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground">
            <option value="ALL">Semua Tipe</option>
            <option value="buy">BUY</option>
            <option value="sell">SELL</option>
          </select>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground" />
            <span className="text-[10px] text-muted-foreground">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total P&L</div>
            <div className={`text-base font-bold ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{totalPnl >= 0 ? '+' : ''}Rp {Math.round(totalPnl).toLocaleString('id-ID')}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total Trades</div>
            <div className="text-base font-bold text-foreground">{filtered.length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Win / Loss</div>
            <div className="text-base font-bold"><span className="text-profit">{wins}</span> / <span className="text-loss">{losses}</span></div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Win Rate</div>
            <div className="text-base font-bold text-foreground">{wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0'}%</div>
          </div>
        </div>

        {equityCurve.length > 1 && (
          <div className="bg-card border border-border rounded-lg p-3">
            <h3 className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">Equity Curve</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }} formatter={(v: number) => [`Rp ${v.toLocaleString('id-ID')}`, 'P&L']} />
                  <Area type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" fill="url(#colorPnl)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">Log Transaksi ({filtered.length})</h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Belum ada transaksi</div>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-muted-foreground uppercase">
                    <th className="px-2 py-1.5 text-left">Waktu</th>
                    <th className="px-2 py-1.5 text-left">Koin</th>
                    <th className="px-2 py-1.5 text-left">Tipe</th>
                    <th className="px-2 py-1.5 text-right">Harga</th>
                    <th className="px-2 py-1.5 text-right">Nilai IDR</th>
                    <th className="px-2 py-1.5 text-right">P&L</th>
                    <th className="px-2 py-1.5 text-left">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtered].reverse().map(log => (
                    <tr key={log.id} className="border-t border-border/50 hover:bg-muted/50">
                      <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString('id-ID')} {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-2 py-1.5 font-bold text-foreground">{log.coin_symbol}</td>
                      <td className={`px-2 py-1.5 font-semibold ${log.trade_type === 'buy' ? 'text-profit' : 'text-loss'}`}>{log.trade_type.toUpperCase()}</td>
                      <td className="px-2 py-1.5 text-right text-foreground">{formatRupiah(log.price)}</td>
                      <td className="px-2 py-1.5 text-right text-foreground">Rp {Math.round(log.idr_value).toLocaleString('id-ID')}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${log.pnl > 0 ? 'text-profit' : log.pnl < 0 ? 'text-loss' : 'text-muted-foreground'}`}>
                        {log.pnl !== 0 ? `${log.pnl > 0 ? '+' : ''}Rp ${Math.round(log.pnl).toLocaleString('id-ID')}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[200px] truncate" title={log.reason || ''}>{log.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
