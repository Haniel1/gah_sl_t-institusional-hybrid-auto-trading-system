import { useQuery } from '@tanstack/react-query';

interface MarketStatsProps {
  pair: string;
}

function formatNum(n: number) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('id-ID');
}

function formatPrice(p: number) {
  if (p >= 1e6) return 'Rp ' + (p / 1e6).toFixed(2) + 'M';
  if (p >= 1e3) return 'Rp ' + (p / 1e3).toFixed(1) + 'K';
  return 'Rp ' + p.toLocaleString('id-ID');
}

export default function MarketStatsBar({ pair }: MarketStatsProps) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const { data } = useQuery({
    queryKey: ['market-stats', pair],
    queryFn: () =>
      fetch(`https://${projectId}.supabase.co/functions/v1/market-depth?pair=${pair}&type=ticker`)
        .then(r => r.json()),
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const t = data?.ticker || {};
  const last = Number(t.last || 0);
  const high = Number(t.high || 0);
  const low = Number(t.low || 0);
  const vol = Number(t.vol_idr || t.vol || 0);
  const buy = Number(t.buy || 0);
  const sell = Number(t.sell || 0);
  const change = high > 0 && low > 0 ? ((last - Number(t.open || low)) / (Number(t.open || low)) * 100) : 0;

  const stats = [
    { label: 'Harga', value: formatPrice(last), color: change >= 0 ? 'text-profit' : 'text-loss' },
    { label: '24h High', value: formatPrice(high), color: 'text-profit' },
    { label: '24h Low', value: formatPrice(low), color: 'text-loss' },
    { label: 'Bid', value: formatPrice(buy), color: 'text-profit' },
    { label: 'Ask', value: formatPrice(sell), color: 'text-loss' },
    { label: '24h Vol', value: formatNum(vol), color: 'text-foreground' },
    { label: 'Spread', value: sell > 0 ? `${((sell - buy) / last * 100).toFixed(3)}%` : '—', color: 'text-muted-foreground' },
  ];

  return (
    <div className="flex items-center gap-5 px-4 py-2 border-b border-border bg-card/50 overflow-x-auto scrollbar-thin">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-black font-mono text-foreground">{pair.replace('_idr', '').toUpperCase()}</span>
        <span className="text-[10px] text-muted-foreground">/IDR</span>
        <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
          change >= 0 ? 'text-profit bg-profit/10' : 'text-loss bg-loss/10'
        }`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
      <div className="h-5 w-px bg-border shrink-0" />
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col items-start shrink-0 gap-0.5">
          <span className="text-[8px] text-muted-foreground uppercase leading-none tracking-wider">{s.label}</span>
          <span className={`text-[11px] font-semibold font-mono leading-none ${s.color}`}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}
