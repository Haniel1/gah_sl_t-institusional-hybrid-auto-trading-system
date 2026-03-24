import { useState } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface AIAdvisorProps {
  coin: string;
  price: number;
  change24h: number;
  volume: number;
}

interface StructuredSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  targetPrice?: number;
  stopLoss?: number;
  timeframe?: string;
  summary: string;
}

interface AdvisorResult {
  analysis: string;
  structured: StructuredSignal | null;
  timestamp: string;
}

export default function AIAdvisorPanel({ coin, price, change24h, volume }: AIAdvisorProps) {
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      // Fetch global market data first
      let marketData: any = {};
      try {
        const newsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/crypto-news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'all' }),
        });
        const newsData = await newsRes.json();
        marketData = {
          fearGreed: newsData.fearGreed?.[0]?.value ? Number(newsData.fearGreed[0].value) : null,
          global: {
            totalMcap: newsData.global?.total_market_cap?.usd || 0,
            totalVol: newsData.global?.total_volume?.usd || 0,
            mcapChange: newsData.global?.market_cap_change_percentage_24h_usd || 0,
            btcDominance: newsData.global?.market_cap_percentage?.btc || 0,
          },
          trending: (newsData.trending || []).map((t: any) => ({
            symbol: t.item?.symbol,
            name: t.item?.name,
          })),
        };
      } catch {
        // Continue without market data
      }

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/ai-trade-advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin, price, change24h, volume, marketData }),
      });

      if (res.status === 429) {
        toast.error('Rate limit tercapai, coba lagi nanti');
        return;
      }
      if (res.status === 402) {
        toast.error('Kredit AI habis, silakan top up');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setResult({
          analysis: data.analysis,
          structured: data.structured,
          timestamp: data.timestamp,
        });
      } else {
        toast.error(data.error || 'Gagal mendapatkan analisis AI');
      }
    } catch (err) {
      toast.error('Gagal menghubungi AI advisor');
    } finally {
      setLoading(false);
    }
  };

  const s = result?.structured;
  const signalColor = s?.signal === 'BUY' ? 'text-profit' : s?.signal === 'SELL' ? 'text-loss' : 'text-yellow-400';
  const signalBg = s?.signal === 'BUY' ? 'bg-profit/15 border-profit/30' : s?.signal === 'SELL' ? 'bg-loss/15 border-loss/30' : 'bg-yellow-400/15 border-yellow-400/30';
  const riskColor = s?.risk === 'LOW' ? 'text-profit' : s?.risk === 'HIGH' ? 'text-loss' : 'text-yellow-400';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span>AI Trading Advisor</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
              {coin}
            </span>
          </div>
          <button
            onClick={fetchAdvice}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 transition-all"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : result ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {loading ? 'Menganalisis...' : result ? 'Refresh' : 'Analisis AI'}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Brain className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              Klik <span className="text-primary font-semibold">Analisis AI</span> untuk mendapatkan
            </p>
            <p className="text-xs text-muted-foreground">
              rekomendasi trading berdasarkan data global
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="relative">
              <Brain className="w-8 h-8 text-primary animate-pulse" />
              <Sparkles className="w-4 h-4 text-primary absolute -top-1 -right-1 animate-bounce" />
            </div>
            <div className="text-center">
              <p className="text-xs text-foreground font-semibold">Menganalisis {coin}...</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Mengumpulkan data pasar global, sentimen, & teknikal
              </p>
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-3">
            {/* Signal Badge */}
            {s && (
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3 rounded-lg border ${signalBg}`}>
                  <div className="flex items-center gap-2">
                    {s.signal === 'BUY' ? <TrendingUp className="w-5 h-5 text-profit" /> :
                     s.signal === 'SELL' ? <TrendingDown className="w-5 h-5 text-loss" /> :
                     <Minus className="w-5 h-5 text-yellow-400" />}
                    <div>
                      <span className={`text-lg font-black font-mono ${signalColor}`}>{s.signal}</span>
                      <p className="text-[10px] text-muted-foreground">{s.summary}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <div className={`text-lg font-bold font-mono ${signalColor}`}>{s.confidence}%</div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <AlertTriangle className={`w-3 h-3 mx-auto mb-1 ${riskColor}`} />
                    <p className="text-[9px] text-muted-foreground uppercase">Risk</p>
                    <p className={`text-xs font-bold ${riskColor}`}>{s.risk}</p>
                  </div>
                  {s.targetPrice && (
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <Target className="w-3 h-3 mx-auto mb-1 text-profit" />
                      <p className="text-[9px] text-muted-foreground uppercase">Target</p>
                      <p className="text-xs font-bold font-mono text-profit">
                        {s.targetPrice >= 1e6 ? `${(s.targetPrice / 1e6).toFixed(1)}M` : s.targetPrice.toLocaleString('id-ID')}
                      </p>
                    </div>
                  )}
                  {s.stopLoss && (
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <Target className="w-3 h-3 mx-auto mb-1 text-loss" />
                      <p className="text-[9px] text-muted-foreground uppercase">Stop Loss</p>
                      <p className="text-xs font-bold font-mono text-loss">
                        {s.stopLoss >= 1e6 ? `${(s.stopLoss / 1e6).toFixed(1)}M` : s.stopLoss.toLocaleString('id-ID')}
                      </p>
                    </div>
                  )}
                  {s.timeframe && !s.targetPrice && (
                    <div className="bg-muted/50 rounded-lg p-2 text-center">
                      <Clock className="w-3 h-3 mx-auto mb-1 text-primary" />
                      <p className="text-[9px] text-muted-foreground uppercase">Timeframe</p>
                      <p className="text-xs font-bold text-primary">{s.timeframe}</p>
                    </div>
                  )}
                </div>

                {s.timeframe && s.targetPrice && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Timeframe: <span className="text-foreground font-semibold">{s.timeframe}</span></span>
                  </div>
                )}
              </div>
            )}

            {/* Full Analysis */}
            <details className="group">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Lihat analisis lengkap
              </summary>
              <div className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-3 max-h-60 overflow-y-auto scrollbar-thin">
                {result.analysis}
              </div>
            </details>

            <p className="text-[9px] text-muted-foreground/50 text-right">
              {new Date(result.timestamp).toLocaleString('id-ID')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
