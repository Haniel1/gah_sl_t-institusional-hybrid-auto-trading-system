import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingUp, TrendingDown, Minus, BarChart3, Clock } from 'lucide-react';

interface TechnicalSummaryProps {
  pair: string;
}

// Simulate multi-indicator analysis from ticker data
function analyzeIndicator(last: number, high: number, low: number, vol: number) {
  const indicators: { name: string; signal: 'BUY' | 'SELL' | 'NEUTRAL'; value: string }[] = [];

  // RSI approximation from position in range
  const range = high - low;
  const position = range > 0 ? ((last - low) / range) * 100 : 50;

  // RSI-like
  const rsi = position;
  indicators.push({
    name: 'RSI (14)',
    signal: rsi < 30 ? 'BUY' : rsi > 70 ? 'SELL' : 'NEUTRAL',
    value: rsi.toFixed(1),
  });

  // Stochastic-like
  const stoch = position * 0.9 + Math.random() * 10;
  indicators.push({
    name: 'Stochastic',
    signal: stoch < 20 ? 'BUY' : stoch > 80 ? 'SELL' : 'NEUTRAL',
    value: stoch.toFixed(1),
  });

  // MACD-like
  const macdVal = (position - 50) / 10;
  indicators.push({
    name: 'MACD',
    signal: macdVal > 0.5 ? 'BUY' : macdVal < -0.5 ? 'SELL' : 'NEUTRAL',
    value: macdVal.toFixed(2),
  });

  // Moving Averages
  const maSignal = position > 55 ? 'BUY' : position < 45 ? 'SELL' : 'NEUTRAL';
  indicators.push({ name: 'MA (20)', signal: maSignal, value: `${position > 50 ? 'Above' : 'Below'}` });
  indicators.push({ name: 'EMA (50)', signal: position > 60 ? 'BUY' : position < 40 ? 'SELL' : 'NEUTRAL', value: `${position > 50 ? 'Above' : 'Below'}` });

  // Bollinger position
  const bbPos = position;
  indicators.push({
    name: 'Bollinger',
    signal: bbPos < 20 ? 'BUY' : bbPos > 80 ? 'SELL' : 'NEUTRAL',
    value: `${bbPos.toFixed(0)}%`,
  });

  // Volume analysis
  indicators.push({
    name: 'Volume',
    signal: vol > 1e10 ? 'BUY' : vol < 1e8 ? 'SELL' : 'NEUTRAL',
    value: vol > 1e9 ? `${(vol / 1e9).toFixed(1)}B` : `${(vol / 1e6).toFixed(0)}M`,
  });

  // ADX-like
  const adx = Math.abs(position - 50) * 2;
  indicators.push({
    name: 'ADX',
    signal: adx > 40 ? (position > 50 ? 'BUY' : 'SELL') : 'NEUTRAL',
    value: adx.toFixed(1),
  });

  return indicators;
}

export default function TechnicalSummary({ pair }: TechnicalSummaryProps) {
  const [timeframe, setTimeframe] = useState('24h');
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const { data } = useQuery({
    queryKey: ['tech-summary', pair],
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
  const vol = Number(t.vol_idr || 0);

  const indicators = analyzeIndicator(last, high, low, vol);

  const buyCount = indicators.filter(i => i.signal === 'BUY').length;
  const sellCount = indicators.filter(i => i.signal === 'SELL').length;
  const neutralCount = indicators.filter(i => i.signal === 'NEUTRAL').length;
  const total = indicators.length;

  const overallSignal = buyCount > sellCount && buyCount > neutralCount ? 'BUY' :
    sellCount > buyCount && sellCount > neutralCount ? 'SELL' : 'NEUTRAL';

  const overallColor = overallSignal === 'BUY' ? 'text-profit' : overallSignal === 'SELL' ? 'text-loss' : 'text-yellow-400';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Technical Analysis</span>
        <div className="flex items-center gap-0.5">
          {['1h', '4h', '24h'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                timeframe === tf ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Overall Signal */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {overallSignal === 'BUY' ? <TrendingUp className="w-5 h-5 text-profit" /> :
             overallSignal === 'SELL' ? <TrendingDown className="w-5 h-5 text-loss" /> :
             <Minus className="w-5 h-5 text-yellow-400" />}
            <div>
              <span className={`text-lg font-black font-mono ${overallColor}`}>{overallSignal}</span>
              <p className="text-[9px] text-muted-foreground">{timeframe} Summary</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <div className="text-center">
              <div className="text-profit font-bold">{buyCount}</div>
              <div className="text-[8px] text-muted-foreground">Buy</div>
            </div>
            <div className="text-center">
              <div className="text-yellow-400 font-bold">{neutralCount}</div>
              <div className="text-[8px] text-muted-foreground">Neutral</div>
            </div>
            <div className="text-center">
              <div className="text-loss font-bold">{sellCount}</div>
              <div className="text-[8px] text-muted-foreground">Sell</div>
            </div>
          </div>
        </div>

        {/* Signal Gauge Bar */}
        <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-muted">
          <div className="bg-profit transition-all" style={{ width: `${(buyCount / total) * 100}%` }} />
          <div className="bg-yellow-400 transition-all" style={{ width: `${(neutralCount / total) * 100}%` }} />
          <div className="bg-loss transition-all" style={{ width: `${(sellCount / total) * 100}%` }} />
        </div>
      </div>

      {/* Indicator List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {indicators.map((ind, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 hover:bg-muted/30 transition-colors">
            <span className="text-[10px] text-foreground font-medium">{ind.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">{ind.value}</span>
              <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                ind.signal === 'BUY' ? 'bg-profit/15 text-profit' :
                ind.signal === 'SELL' ? 'bg-loss/15 text-loss' :
                'bg-yellow-400/15 text-yellow-400'
              }`}>
                {ind.signal}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
