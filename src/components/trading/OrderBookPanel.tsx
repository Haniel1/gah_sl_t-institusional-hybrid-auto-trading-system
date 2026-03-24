import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface OrderBookProps {
  pair: string;
}

interface OrderEntry {
  0: string; // price
  1: string; // amount
}

function formatPrice(p: number) {
  if (p >= 1e6) return (p / 1e6).toFixed(2) + 'M';
  if (p >= 1e3) return (p / 1e3).toFixed(1) + 'K';
  return p.toLocaleString('id-ID');
}

export default function OrderBookPanel({ pair }: OrderBookProps) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const { data, isLoading } = useQuery({
    queryKey: ['orderbook', pair],
    queryFn: () =>
      fetch(`https://${projectId}.supabase.co/functions/v1/market-depth?pair=${pair}&type=orderbook`)
        .then(r => r.json()),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const bids: OrderEntry[] = data?.orderbook?.bids || [];
  const asks: OrderEntry[] = data?.orderbook?.asks || [];

  const maxBidVol = Math.max(...bids.map(b => Number(b[1])), 0.001);
  const maxAskVol = Math.max(...asks.map(a => Number(a[1])), 0.001);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Order Book</span>
        <span className="text-[9px] text-muted-foreground font-mono">{pair.replace('_idr', '').toUpperCase()}/IDR</span>
      </div>

      {/* Header */}
      <div className="flex items-center px-3 py-1 text-[9px] text-muted-foreground uppercase font-semibold border-b border-border">
        <span className="flex-1">Harga (IDR)</span>
        <span className="flex-1 text-right">Jumlah</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      {/* Asks (sell) - reversed so lowest ask is at bottom */}
      <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[200px]">
        {[...asks].reverse().map((ask, i) => {
          const price = Number(ask[0]);
          const amount = Number(ask[1]);
          const total = price * amount;
          const pct = (amount / maxAskVol) * 100;
          return (
            <div key={`ask-${i}`} className="relative flex items-center px-3 py-[3px] text-[10px] font-mono hover:bg-muted/50">
              <div className="absolute right-0 top-0 bottom-0 bg-loss/8" style={{ width: `${pct}%` }} />
              <span className="flex-1 text-loss relative z-10">{formatPrice(price)}</span>
              <span className="flex-1 text-right text-muted-foreground relative z-10">{amount.toFixed(6)}</span>
              <span className="flex-1 text-right text-muted-foreground relative z-10">{formatPrice(total)}</span>
            </div>
          );
        })}
      </div>

      {/* Spread indicator */}
      {bids.length > 0 && asks.length > 0 && (
        <div className="flex items-center justify-center px-3 py-1.5 border-y border-border bg-muted/30">
          <span className="text-xs font-bold font-mono text-foreground">
            {formatPrice(Number(bids[0][0]))}
          </span>
          <span className="text-[9px] text-muted-foreground mx-2">
            Spread: {((Number(asks[0][0]) - Number(bids[0][0])) / Number(bids[0][0]) * 100).toFixed(3)}%
          </span>
        </div>
      )}

      {/* Bids (buy) */}
      <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[200px]">
        {bids.map((bid, i) => {
          const price = Number(bid[0]);
          const amount = Number(bid[1]);
          const total = price * amount;
          const pct = (amount / maxBidVol) * 100;
          return (
            <div key={`bid-${i}`} className="relative flex items-center px-3 py-[3px] text-[10px] font-mono hover:bg-muted/50">
              <div className="absolute right-0 top-0 bottom-0 bg-profit/8" style={{ width: `${pct}%` }} />
              <span className="flex-1 text-profit relative z-10">{formatPrice(price)}</span>
              <span className="flex-1 text-right text-muted-foreground relative z-10">{amount.toFixed(6)}</span>
              <span className="flex-1 text-right text-muted-foreground relative z-10">{formatPrice(total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
