import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, TrendingUp, TrendingDown, Gauge, Globe, Flame,
  BarChart3, DollarSign, Activity, RefreshCw, ChevronRight,
  Zap, Shield, Layers, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

function fetchCryptoNews() {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return fetch(`https://${projectId}.supabase.co/functions/v1/crypto-news`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'all' }),
  }).then(r => r.json());
}

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const getColor = (v: number) => {
    if (v <= 25) return 'text-loss';
    if (v <= 45) return 'text-orange-400';
    if (v <= 55) return 'text-yellow-400';
    if (v <= 75) return 'text-lime-400';
    return 'text-profit';
  };

  const getLabel = (v: number) => {
    if (v <= 25) return 'Extreme Fear';
    if (v <= 45) return 'Fear';
    if (v <= 55) return 'Neutral';
    if (v <= 75) return 'Greed';
    return 'Extreme Greed';
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={`${(value / 100) * 314} 314`}
            strokeLinecap="round"
            className={getColor(value)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold font-mono ${getColor(value)}`}>{value}</span>
          <span className="text-[9px] text-muted-foreground font-semibold uppercase">{getLabel(value)}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function MarketStatCard({ icon: Icon, label, value, sub, trend }: {
  icon: any; label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-sm font-bold font-mono text-foreground truncate">{value}</p>
        {sub && (
          <p className={`text-[10px] font-semibold ${
            trend === 'up' ? 'text-profit' : trend === 'down' ? 'text-loss' : 'text-muted-foreground'
          }`}>
            {trend === 'up' ? '↗ ' : trend === 'down' ? '↘ ' : ''}{sub}
          </p>
        )}
      </div>
    </div>
  );
}

function SparkLine({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function formatLargeNum(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function CryptoNews() {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['crypto-news'],
    queryFn: fetchCryptoNews,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const fearGreed = data?.fearGreed || [];
  const global = data?.global || {};
  const trending = data?.trending || [];
  const topCoins = data?.topCoins || [];
  const defi = data?.defi || {};

  const currentFG = fearGreed[0] ? Number(fearGreed[0].value) : 50;
  const yesterdayFG = fearGreed[1] ? Number(fearGreed[1].value) : 50;
  const weekAgoFG = fearGreed[6] ? Number(fearGreed[6].value) : 50;

  const btcDominance = global?.market_cap_percentage?.btc || 0;
  const ethDominance = global?.market_cap_percentage?.eth || 0;
  const totalMcap = global?.total_market_cap?.usd || 0;
  const totalVol = global?.total_volume?.usd || 0;
  const mcapChange = global?.market_cap_change_percentage_24h_usd || 0;
  const activeCryptos = global?.active_cryptocurrencies || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-10 border-b border-border flex items-center px-4 sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
        <Link to="/" className="p-1 rounded hover:bg-muted transition-colors mr-2">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Globe className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider ml-2">Crypto Intelligence</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold ml-2 hidden sm:inline">
          Global Data
        </span>
        <div className="ml-auto">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">Mengambil data global...</span>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          {/* Row 1: Fear & Greed + Market Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Fear & Greed */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  Fear & Greed Index
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-6">
                  <FearGreedGauge value={currentFG} label="Sekarang" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Kemarin</p>
                    <p className="text-sm font-bold font-mono">{yesterdayFG}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">7 Hari Lalu</p>
                    <p className="text-sm font-bold font-mono">{weekAgoFG}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Tren</p>
                    <p className={`text-sm font-bold ${currentFG > yesterdayFG ? 'text-profit' : currentFG < yesterdayFG ? 'text-loss' : 'text-muted-foreground'}`}>
                      {currentFG > yesterdayFG ? '↑' : currentFG < yesterdayFG ? '↓' : '→'}
                    </p>
                  </div>
                </div>
                {/* Mini history chart */}
                <div className="mt-4">
                  <p className="text-[10px] text-muted-foreground mb-1">30 Hari Terakhir</p>
                  <div className="flex items-end gap-[2px] h-12">
                    {fearGreed.slice(0, 30).reverse().map((d: any, i: number) => {
                      const v = Number(d.value);
                      const color = v <= 25 ? 'bg-loss' : v <= 45 ? 'bg-orange-400' : v <= 55 ? 'bg-yellow-400' : v <= 75 ? 'bg-lime-400' : 'bg-profit';
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-t ${color}`}
                          style={{ height: `${(v / 100) * 100}%`, minWidth: 2 }}
                          title={`Day ${i + 1}: ${v}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Market Overview Stats */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Ikhtisar Pasar Global
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MarketStatCard
                    icon={DollarSign}
                    label="Total Market Cap"
                    value={formatLargeNum(totalMcap)}
                    sub={`${mcapChange >= 0 ? '+' : ''}${mcapChange.toFixed(2)}% 24h`}
                    trend={mcapChange >= 0 ? 'up' : 'down'}
                  />
                  <MarketStatCard
                    icon={Activity}
                    label="Volume 24h"
                    value={formatLargeNum(totalVol)}
                  />
                  <MarketStatCard
                    icon={Shield}
                    label="BTC Dominance"
                    value={`${btcDominance.toFixed(1)}%`}
                    sub={`ETH: ${ethDominance.toFixed(1)}%`}
                  />
                  <MarketStatCard
                    icon={Layers}
                    label="Aktif Koin"
                    value={activeCryptos.toLocaleString()}
                  />
                  <MarketStatCard
                    icon={Zap}
                    label="DeFi Market Cap"
                    value={defi?.defi_market_cap ? formatLargeNum(Number(defi.defi_market_cap)) : 'N/A'}
                  />
                  <MarketStatCard
                    icon={Activity}
                    label="DeFi Volume 24h"
                    value={defi?.trading_volume_24h ? formatLargeNum(Number(defi.trading_volume_24h)) : 'N/A'}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Top Coins with Sparkline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Top Koin — Harga & Performa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
                      <th className="text-left py-2 pr-2">#</th>
                      <th className="text-left py-2">Koin</th>
                      <th className="text-right py-2">Harga</th>
                      <th className="text-right py-2">1h</th>
                      <th className="text-right py-2">24h</th>
                      <th className="text-right py-2">7d</th>
                      <th className="text-right py-2">Market Cap</th>
                      <th className="text-right py-2">7d Chart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCoins.map((coin: any, i: number) => (
                      <tr key={coin.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 pr-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <img src={coin.image} alt={coin.name} className="w-5 h-5 rounded-full" />
                            <div>
                              <span className="font-bold text-foreground">{coin.symbol?.toUpperCase()}</span>
                              <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">{coin.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-mono font-semibold text-foreground py-2.5">
                          ${coin.current_price?.toLocaleString()}
                        </td>
                        <td className={`text-right font-mono py-2.5 ${
                          (coin.price_change_percentage_1h_in_currency || 0) >= 0 ? 'text-profit' : 'text-loss'
                        }`}>
                          {(coin.price_change_percentage_1h_in_currency || 0).toFixed(2)}%
                        </td>
                        <td className={`text-right font-mono py-2.5 ${
                          (coin.price_change_percentage_24h_in_currency || 0) >= 0 ? 'text-profit' : 'text-loss'
                        }`}>
                          {(coin.price_change_percentage_24h_in_currency || 0).toFixed(2)}%
                        </td>
                        <td className={`text-right font-mono py-2.5 ${
                          (coin.price_change_percentage_7d_in_currency || 0) >= 0 ? 'text-profit' : 'text-loss'
                        }`}>
                          {(coin.price_change_percentage_7d_in_currency || 0).toFixed(2)}%
                        </td>
                        <td className="text-right font-mono text-muted-foreground py-2.5">
                          {formatLargeNum(coin.market_cap || 0)}
                        </td>
                        <td className="text-right py-2.5">
                          <SparkLine
                            data={coin.sparkline_in_7d?.price || []}
                            color={(coin.price_change_percentage_7d_in_currency || 0) >= 0 ? '#22c55e' : '#ef4444'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Row 3: Trending + Market Dominance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Trending Coins */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  Trending — Paling Dicari
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {trending.slice(0, 7).map((t: any, i: number) => {
                    const coin = t.item;
                    return (
                      <div key={coin.id} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
                        <img src={coin.small} alt={coin.name} className="w-5 h-5 rounded-full" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-foreground">{coin.symbol}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{coin.name}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          #{coin.market_cap_rank || '—'}
                        </span>
                        <div className={`text-[10px] font-semibold ${
                          (coin.data?.price_change_percentage_24h?.usd || 0) >= 0 ? 'text-profit' : 'text-loss'
                        }`}>
                          {(coin.data?.price_change_percentage_24h?.usd || 0).toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Market Dominance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Dominasi Pasar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {global?.market_cap_percentage && Object.entries(global.market_cap_percentage)
                    .sort(([, a]: any, [, b]: any) => b - a)
                    .slice(0, 8)
                    .map(([symbol, pct]: [string, any]) => (
                      <div key={symbol}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-foreground uppercase">{symbol}</span>
                          <span className="text-xs font-mono text-muted-foreground">{Number(pct).toFixed(2)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(Number(pct), 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 4: DeFi Stats */}
          {defi && Object.keys(defi).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  DeFi Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">DeFi Market Cap</p>
                    <p className="text-sm font-bold font-mono">{defi.defi_market_cap ? formatLargeNum(Number(defi.defi_market_cap)) : 'N/A'}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">DeFi / Total Mcap</p>
                    <p className="text-sm font-bold font-mono">{defi.defi_dominance ? `${Number(defi.defi_dominance).toFixed(2)}%` : 'N/A'}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Volume 24h</p>
                    <p className="text-sm font-bold font-mono">{defi.trading_volume_24h ? formatLargeNum(Number(defi.trading_volume_24h)) : 'N/A'}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Top DeFi Coin</p>
                    <p className="text-sm font-bold font-mono uppercase">{defi.top_coin_name || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
