import { useState, useEffect, useCallback } from 'react';
import { Clock, TrendingUp, TrendingDown, Minus, RefreshCw, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface HourlyStats {
  hour: number;
  avgReturn: number;
  avgVolume: number;
  winRate: number;
  score: number;
  totalCandles: number;
}

interface TimePrediction {
  symbol: string;
  bestBuyHours: { hour: number; score: number; avgReturn: number; confidence: number }[];
  bestSellHours: { hour: number; score: number; avgReturn: number; confidence: number }[];
  currentHourSignal: 'buy' | 'sell' | 'neutral';
  currentHourScore: number;
  hourlyStats: HourlyStats[];
  nextBuyWindow: { start: number; end: number; confidence: number } | null;
  nextSellWindow: { start: number; end: number; confidence: number } | null;
  aiSummary?: string;
  updatedAt: string;
}

interface Props {
  symbol: string;
  compact?: boolean;
}

function formatHourWIT(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

function formatWindowWIT(start: number, end: number): string {
  return `${formatHourWIT(start)} - ${formatHourWIT(end)} WIT`;
}

export function TimePredictionPanel({ symbol, compact = false }: Props) {
  const [prediction, setPrediction] = useState<TimePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const [showAI, setShowAI] = useState(false);

  const fetchPrediction = useCallback(async (withAI = false) => {
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/time-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.toUpperCase(), includeAI: withAI }),
      });
      const data = await res.json();
      if (data.error) {
        if (!compact) toast.error(`Data tidak cukup untuk ${symbol}`);
        return;
      }
      setPrediction(data);
      if (withAI && data.aiSummary) setShowAI(true);
    } catch (err) {
      console.error('Time prediction error:', err);
      if (!compact) toast.error('Gagal memuat prediksi waktu');
    } finally {
      setLoading(false);
    }
  }, [symbol, compact]);

  useEffect(() => {
    fetchPrediction(false);
    const interval = setInterval(() => fetchPrediction(false), 300000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchPrediction]);

  if (!prediction && !loading) return null;

  // Compact mode for coin sidebar
  if (compact) {
    if (!prediction) return null;
    const signal = prediction.currentHourSignal;
    const nextBuy = prediction.nextBuyWindow;
    return (
      <div className="flex items-center gap-1 text-[9px] font-mono">
        {signal === 'buy' && <TrendingUp className="w-2.5 h-2.5 text-profit" />}
        {signal === 'sell' && <TrendingDown className="w-2.5 h-2.5 text-loss" />}
        {signal === 'neutral' && <Minus className="w-2.5 h-2.5 text-muted-foreground" />}
        {nextBuy && (
          <span className="text-muted-foreground">
            ↑{formatHourWIT(nextBuy.start)}
          </span>
        )}
      </div>
    );
  }

  // Current WIT time
  const now = new Date();
  const witHour = (now.getUTCHours() + 9) % 24;
  const witTime = `${witHour.toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} WIT`;

  return (
    <div className="terminal-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold text-foreground">Prediksi Waktu Trading</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-mono">{witTime}</span>
          <button
            onClick={() => fetchPrediction(false)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !prediction ? (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Menganalisis pola 30 hari...</span>
        </div>
      ) : prediction ? (
        <>
          {/* Current Hour Signal */}
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${
            prediction.currentHourSignal === 'buy'
              ? 'bg-profit/10 border-profit/20 text-profit'
              : prediction.currentHourSignal === 'sell'
              ? 'bg-loss/10 border-loss/20 text-loss'
              : 'bg-muted border-border text-muted-foreground'
          }`}>
            {prediction.currentHourSignal === 'buy' && <TrendingUp className="w-3.5 h-3.5" />}
            {prediction.currentHourSignal === 'sell' && <TrendingDown className="w-3.5 h-3.5" />}
            {prediction.currentHourSignal === 'neutral' && <Minus className="w-3.5 h-3.5" />}
            <span className="text-xs font-semibold uppercase">
              Jam ini: {prediction.currentHourSignal === 'buy' ? 'Cenderung Naik' : prediction.currentHourSignal === 'sell' ? 'Cenderung Turun' : 'Netral'}
            </span>
          </div>

          {/* Next Windows */}
          <div className="grid grid-cols-2 gap-2">
            {prediction.nextBuyWindow && (
              <div className="bg-profit/5 border border-profit/15 rounded-md p-2">
                <p className="text-[10px] text-profit font-semibold flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Waktu Naik
                </p>
                <p className="font-mono text-xs text-foreground mt-0.5">
                  {formatWindowWIT(prediction.nextBuyWindow.start, prediction.nextBuyWindow.end)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  Confidence: {prediction.nextBuyWindow.confidence.toFixed(0)}%
                </p>
              </div>
            )}
            {prediction.nextSellWindow && (
              <div className="bg-loss/5 border border-loss/15 rounded-md p-2">
                <p className="text-[10px] text-loss font-semibold flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Waktu Turun
                </p>
                <p className="font-mono text-xs text-foreground mt-0.5">
                  {formatWindowWIT(prediction.nextSellWindow.start, prediction.nextSellWindow.end)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  Confidence: {prediction.nextSellWindow.confidence.toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          {/* Expandable Details */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Detail per Jam</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <div className="space-y-2 animate-fade-in">
              {/* Top Buy Hours */}
              <div>
                <p className="text-[10px] font-semibold text-profit mb-1">🟢 Jam Terbaik untuk Beli</p>
                <div className="space-y-0.5">
                  {prediction.bestBuyHours.slice(0, 3).map(h => (
                    <div key={h.hour} className="flex items-center justify-between bg-profit/5 rounded px-2 py-1">
                      <span className="font-mono text-[11px] text-foreground">{formatHourWIT(h.hour)} WIT</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-profit">+{h.avgReturn.toFixed(3)}%</span>
                        <span className="text-[9px] text-muted-foreground">{h.confidence.toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Sell Hours */}
              <div>
                <p className="text-[10px] font-semibold text-loss mb-1">🔴 Jam Cenderung Turun</p>
                <div className="space-y-0.5">
                  {prediction.bestSellHours.slice(0, 3).map(h => (
                    <div key={h.hour} className="flex items-center justify-between bg-loss/5 rounded px-2 py-1">
                      <span className="font-mono text-[11px] text-foreground">{formatHourWIT(h.hour)} WIT</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-loss">{h.avgReturn.toFixed(3)}%</span>
                        <span className="text-[9px] text-muted-foreground">{h.confidence.toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 24h Heatmap */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">📊 Heatmap 24 Jam (WIT)</p>
                <div className="grid grid-cols-12 gap-0.5">
                  {prediction.hourlyStats.map(s => {
                    const maxAbs = Math.max(...prediction.hourlyStats.map(h => Math.abs(h.score))) || 1;
                    const intensity = Math.min(1, Math.abs(s.score) / maxAbs);
                    const color = s.score > 0
                      ? `rgba(34,197,94,${0.15 + intensity * 0.6})`
                      : s.score < 0
                      ? `rgba(239,68,68,${0.15 + intensity * 0.6})`
                      : 'rgba(100,100,100,0.15)';
                    return (
                      <div
                        key={s.hour}
                        className="aspect-square rounded-sm flex items-center justify-center cursor-default"
                        style={{ backgroundColor: color }}
                        title={`${formatHourWIT(s.hour)} WIT | Return: ${s.avgReturn.toFixed(3)}% | Win: ${s.winRate.toFixed(0)}%`}
                      >
                        <span className="text-[7px] font-mono text-foreground/70">{s.hour}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[8px] text-loss">← Turun</span>
                  <span className="text-[8px] text-muted-foreground">Netral</span>
                  <span className="text-[8px] text-profit">Naik →</span>
                </div>
              </div>
            </div>
          )}

          {/* AI Summary */}
          {!showAI ? (
            <button
              onClick={() => fetchPrediction(true)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <Brain className="w-3 h-3" />
              Analisis AI
            </button>
          ) : prediction.aiSummary ? (
            <div className="bg-primary/5 border border-primary/15 rounded-md p-2">
              <p className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1">
                <Brain className="w-3 h-3" /> Insight AI
              </p>
              <p className="text-[11px] text-foreground/80 leading-relaxed">{prediction.aiSummary}</p>
            </div>
          ) : null}

          <p className="text-[9px] text-muted-foreground text-right">
            Data: 30 hari terakhir | Update: {new Date(prediction.updatedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jayapura' })} WIT
          </p>
        </>
      ) : null}
    </div>
  );
}
