import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface RecentTradesProps {
  pair: string;
}

function formatPrice(p: number) {
  if (p >= 1e6) return (p / 1e6).toFixed(2) + 'M';
  if (p >= 1e3) return (p / 1e3).toFixed(1) + 'K';
  return p.toLocaleString('id-ID');
}

export default function RecentTradesPanel({ pair }: RecentTradesProps) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const { data } = useQuery({
    queryKey: ['recent-trades', pair],
    queryFn: () =>
      fetch(`https://${projectId}.supabase.co/functions/v1/market-depth?pair=${pair}&type=trades`)
        .then(r => r.json()),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const trades = data?.trades || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Recent Trades</span>
        <span className="text-[9px] text-muted-foreground font-mono">{pair.replace('_idr', '').toUpperCase()}/IDR</span>
      </div>

      <div className="flex items-center px-3 py-1 text-[9px] text-muted-foreground uppercase font-semibold border-b border-border">
        <span className="flex-1">Harga</span>
        <span className="flex-1 text-right">Jumlah</span>
        <span className="w-16 text-right">Waktu</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[400px]">
        {trades.map((trade: any, i: number) => {
          const isBuy = trade.type === 'buy';
          const time = new Date(Number(trade.date) * 1000);
          return (
            <div key={`trade-${i}`} className="flex items-center px-3 py-[3px] text-[10px] font-mono hover:bg-muted/50 transition-colors">
              <div className="flex-1 flex items-center gap-1">
                {isBuy ? (
                  <ArrowUpRight className="w-2.5 h-2.5 text-profit" />
                ) : (
                  <ArrowDownRight className="w-2.5 h-2.5 text-loss" />
                )}
                <span className={isBuy ? 'text-profit' : 'text-loss'}>
                  {formatPrice(Number(trade.price))}
                </span>
              </div>
              <span className="flex-1 text-right text-muted-foreground">
                {Number(trade.amount).toFixed(6)}
              </span>
              <span className="w-16 text-right text-muted-foreground text-[9px]">
                {time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
