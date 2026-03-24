import { getCurrentHalvingPhase } from '@/lib/strategies';
import { Zap, BarChart3, Clock, Crosshair, Layers, Scale, TrendingUp, Box, XCircle, Activity, GitBranch, Waves } from 'lucide-react';

const STRATEGIES = [
  { id: 'none', name: 'Tanpa Indikator', icon: XCircle, desc: 'Chart bersih tanpa overlay' },
  { id: 'swing-trading', name: 'Swing Trading', icon: TrendingUp, desc: 'Swing High/Low detection — auto trade signal' },
  { id: 'halving', name: 'Halving Cycle', icon: Clock, desc: 'Bitcoin halving profit zones' },
  { id: 'gainzalgo', name: 'GainzAlgo V2', icon: Zap, desc: 'Multi-layer momentum + BOS' },
  { id: 'fabio', name: 'Fabio Valentini', icon: BarChart3, desc: 'Order flow & volume profile' },
  { id: 'crt', name: 'CRT Overlay', icon: Crosshair, desc: '4H candle sweep reversal' },
  { id: 'poi', name: 'POI (FVG & OB)', icon: Layers, desc: 'Fair Value Gap & Order Block' },
  { id: 'balance', name: 'Balance Area', icon: Scale, desc: 'Konsolidasi & breakout analysis' },
  { id: 'multitf', name: 'Multi-TF S/R', icon: TrendingUp, desc: 'Multi-timeframe support resistance' },
  { id: 'darvas', name: 'Darvas Box', icon: Box, desc: 'Consolidation box breakout theory' },
  // --- 3 NEW INDICATORS ---
  { id: 'trendlines-breaks', name: 'Trendlines + Breaks', icon: GitBranch, desc: 'LuxAlgo: Trendline otomatis + sinyal breakout' },
  { id: 'rsi-panel', name: 'RSI (14)', icon: Activity, desc: 'Relative Strength Index — overbought/oversold' },
  { id: 'trama', name: 'TRAMA (LuxAlgo)', icon: Waves, desc: 'Trend Regularity Adaptive Moving Average' },
];

interface StrategyPanelProps {
  activeStrategy: string;
  onStrategyChange: (id: string) => void;
}

export default function StrategyPanel({ activeStrategy, onStrategyChange }: StrategyPanelProps) {
  const phase = getCurrentHalvingPhase();

  return (
    <div className="terminal-card p-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Strategy Engine</h3>
      
      <div className="space-y-1.5 mb-4">
        {STRATEGIES.map(s => {
          const Icon = s.icon;
          const active = activeStrategy === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onStrategyChange(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all ${
                active
                  ? 'bg-primary/10 border border-primary/30 text-primary glow-cyan'
                  : 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <div>
                <p className="text-xs font-medium">{s.name}</p>
                <p className="text-[10px] opacity-60">{s.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Halving Status */}
      {activeStrategy === 'swing-trading' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Swing Trading Signal</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Deteksi <span className="text-profit font-semibold">Swing Low (SL)</span> → sinyal <span className="text-profit font-bold">BUY</span></p>
            <p>• Deteksi <span className="text-loss font-semibold">Swing High (SH)</span> → sinyal <span className="text-loss font-bold">SELL</span></p>
            <p>• Short-term: timeframe 15m, SL 2%</p>
            <p>• Long-term: timeframe 1h, SL 8%</p>
            <p>• Stop Loss otomatis aktif</p>
          </div>
          <div className="mt-2 space-y-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-profit" /> Swing Low = Area beli (hijau)
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-loss" /> Swing High = Area jual (merah)
            </div>
          </div>
        </div>
      )}

      {activeStrategy === 'halving' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Phase</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: phase.color }} />
            <span className="font-mono text-sm font-bold" style={{ color: phase.color }}>{phase.phase}</span>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {phase.weeksPost} weeks post 4th halving
          </p>
          <div className="mt-2 space-y-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-profit" /> Profit START: 40 weeks
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-loss" /> Profit END: 80 weeks
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-warning" /> DCA Zone: 135 weeks
            </div>
          </div>
        </div>
      )}

      {activeStrategy === 'gainzalgo' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Signal Logic</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• ATR(14) volatility filter</p>
            <p>• EMA(12,26) momentum scoring</p>
            <p>• Break of Structure detection</p>
            <p>• Risk: 1:2 R/R with ATR stops</p>
          </div>
        </div>
      )}

      {activeStrategy === 'fabio' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Order Flow</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Volume Profile (POC/VAH/VAL)</p>
            <p>• Cumulative Volume Delta</p>
            <p>• Absorption detection</p>
            <p>• Aggressive delta spikes</p>
          </div>
        </div>
      )}

      {activeStrategy === 'crt' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CRT Overlay</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• 4H candle High/Low sebagai referensi</p>
            <p>• SELL: sweep High lalu reversal turun</p>
            <p>• BUY: sweep Low lalu reversal naik</p>
            <p>• Target: sisi berlawanan dari CRT range</p>
            <p>• Eksekusi cepat (~10 menit)</p>
          </div>
        </div>
      )}

      {activeStrategy === 'poi' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">POI: FVG & Order Block</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Fair Value Gap: celah candle 1 & 3</p>
            <p>• Order Block: candle terakhir sebelum impulse</p>
            <p>• OB valid jika berlawanan arah + volume tinggi</p>
            <p>• Entry saat harga kembali ke zona POI</p>
          </div>
        </div>
      )}

      {activeStrategy === 'balance' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance Area</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Identifikasi area konsolidasi</p>
            <p>• Volume delta positif = dominasi buyer</p>
            <p>• Breakout dikonfirmasi oleh agresivitas</p>
            <p>• Follow arah breakout di luar balance</p>
          </div>
        </div>
      )}

      {activeStrategy === 'multitf' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Multi-TF S/R</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Daily: key levels (S/R utama)</p>
            <p>• H4: struktur pasar (Break of Structure)</p>
            <p>• H1: zona entry spesifik</p>
            <p>• M15: konfirmasi rejection</p>
            <p>• SL: 50-60 pips, Partial TP: 150 pips</p>
          </div>
        </div>
      )}

      {activeStrategy === 'darvas' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Darvas Box Theory</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Identifikasi kotak konsolidasi (sideways)</p>
            <p>• Valid jika harga menyentuh top/bottom berkali-kali</p>
            <p>• BUY: breakout atas kotak + volume tinggi</p>
            <p>• SELL: breakdown bawah kotak + volume tinggi</p>
            <p>• SL: tepat di bawah garis atas kotak yang ditembus</p>
            <p>• Ideal timeframe: 4H atau 1D</p>
          </div>
        </div>
      )}

      {activeStrategy === 'trendlines-breaks' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trendlines with Breaks [LuxAlgo]</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• <span className="text-[#14b8a6] font-semibold">Garis Atas (Teal)</span>: trendline resistance otomatis</p>
            <p>• <span className="text-loss font-semibold">Garis Bawah (Red)</span>: trendline support otomatis</p>
            <p>• <span className="text-profit font-semibold">Label B (Up)</span>: breakout naik menembus trendline</p>
            <p>• <span className="text-loss font-semibold">Label B (Down)</span>: breakdown menembus trendline</p>
            <p>• Slope dihitung dari ATR × multiplier</p>
            <p>• Pivot length: 14 candle</p>
          </div>
        </div>
      )}

      {activeStrategy === 'rsi-panel' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">RSI (14)</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• <span className="text-loss font-semibold">RSI {'>'} 70</span>: Overbought — area jual potensial</p>
            <p>• <span className="text-profit font-semibold">RSI {'<'} 30</span>: Oversold — area beli potensial</p>
            <p>• RSI antara 30–70: momentum netral</p>
            <p>• <span className="text-[#a855f7] font-semibold">Garis ungu</span>: moving average RSI (14)</p>
            <p>• Sinyal optimal: divergence harga vs RSI</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full bg-[#eab308]" /> RSI Line
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full bg-[#a855f7]" /> MA Signal
            </div>
          </div>
        </div>
      )}

      {activeStrategy === 'trama' && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">TRAMA [LuxAlgo]</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>• Adaptive MA yang menyesuaikan kecepatan sesuai tren</p>
            <p>• Lambat saat sideways, cepat saat trending</p>
            <p>• <span className="text-[#ff1100] font-semibold">Garis Merah</span>: TRAMA line</p>
            <p>• Harga di atas TRAMA = <span className="text-profit font-semibold">Bullish</span></p>
            <p>• Harga di bawah TRAMA = <span className="text-loss font-semibold">Bearish</span></p>
            <p>• Period: 99 — cocok untuk swing trading</p>
          </div>
        </div>
      )}
    </div>
  );
}
