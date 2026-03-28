import { useState, useEffect } from 'react';
import { getCurrentHalvingPhase } from '@/lib/strategies';
import { parsePineScript } from '@/lib/pine-parser';
import { toast } from 'sonner';
import {
  Zap, BarChart3, Clock, Crosshair, Layers, Scale, TrendingUp,
  Box, XCircle, Activity, GitBranch, Waves, ChevronDown, ChevronUp,
  Code, BookOpen, Plus, Save, Trash2, Edit3,
} from 'lucide-react';

/* ─── Core Strategies ─── */
const STRATEGIES = [
  { id: 'swing-trading', name: 'Swing Trading', icon: TrendingUp, desc: 'Swing High/Low detection — auto trade signal' },
  { id: 'halving', name: 'Halving Cycle', icon: Clock, desc: 'Bitcoin halving profit zones' },
  { id: 'gainzalgo', name: 'GainzAlgo V2', icon: Zap, desc: 'Multi-layer momentum + BOS' },
  { id: 'fabio', name: 'Fabio Valentini', icon: BarChart3, desc: 'Order flow & volume profile' },
  { id: 'crt', name: 'CRT Overlay', icon: Crosshair, desc: '4H candle sweep reversal' },
  { id: 'poi', name: 'POI (FVG & OB)', icon: Layers, desc: 'Fair Value Gap & Order Block' },
  { id: 'balance', name: 'Balance Area', icon: Scale, desc: 'Konsolidasi & breakout analysis' },
  { id: 'multitf', name: 'Multi-TF S/R', icon: TrendingUp, desc: 'Multi-timeframe support resistance' },
  { id: 'darvas', name: 'Darvas Box', icon: Box, desc: 'Consolidation box breakout theory' },
  { id: 'trendlines-breaks', name: 'Trendlines + Breaks', icon: GitBranch, desc: 'LuxAlgo: Trendline otomatis + sinyal breakout' },
  { id: 'rsi-panel', name: 'RSI (14)', icon: Activity, desc: 'Relative Strength Index — overbought/oversold' },
  { id: 'trama', name: 'TRAMA (LuxAlgo)', icon: Waves, desc: 'Trend Regularity Adaptive Moving Average' },
];

/* ─── Indicator Templates ─── */
export const INDICATOR_TEMPLATES = [
  {
    id: 'gainzalgo', name: 'GainzAlgo V2 Alpha', category: 'Strategy', strategyId: 'gainzalgo',
    description: 'ATR normalisasi volatilitas, EMA (12, 26) momentum, Rolling Max/Min (5) untuk BOS.',
    pineCode: `//@version=5\nindicator("GainzAlgo V2 Alpha", overlay=true)\natr_len = input.int(14, "ATR Length")\nema_fast = input.int(12, "EMA Fast")\nema_slow = input.int(26, "EMA Slow")\nbos_len = input.int(5, "BOS Lookback")\natr = ta.atr(atr_len)\nef = ta.ema(close, ema_fast)\nes = ta.ema(close, ema_slow)\nmomentum = (ef - es) / atr\nrMax = ta.highest(high, bos_len)\nrMin = ta.lowest(low, bos_len)\nbuySignal = close > rMax[1] and momentum > 0\nsellSignal = close < rMin[1] and momentum < 0\nplot(ef, "EMA 12", color=color.aqua, linewidth=2)\nplot(es, "EMA 26", color=color.orange, linewidth=2)\nplotshape(buySignal, "BUY", shape.triangleup, location.belowbar, color.green, size=size.small)\nplotshape(sellSignal, "SELL", shape.triangledown, location.abovebar, color.red, size=size.small)`,
  },
  {
    id: 'fabio', name: 'Fabio Valentini', category: 'Strategy', strategyId: 'fabio',
    description: 'Volume Profile (POC, VAH, VAL) dan CVD.',
    pineCode: `//@version=5\nindicator("Fabio Valentini - Order Flow", overlay=true)\nvp_len = input.int(20, "VP Length")\ncvd_len = input.int(14, "CVD Smooth")\npoc = ta.vwap(close)\natr = ta.atr(14)\nvah = poc + atr * 0.5\nval = poc - atr * 0.5\ndelta = close > open ? volume : close < open ? -volume : 0\ncvd = ta.ema(math.sum(delta, cvd_len), 5)\ncvd_prev = cvd[1]\nvol_ma = ta.sma(volume, 20)\nhigh_vol = volume > vol_ma * 1.5\nsmall_body = math.abs(close - open) < atr * 0.3\nabsorption = high_vol and small_body\nbuy = cvd > cvd_prev and close <= val and absorption\nsell = cvd < cvd_prev and close >= vah and absorption`,
  },
  {
    id: 'bill-williams-3lines', name: "Bill William's 3 Lines", category: 'Trend',
    description: '3 garis MA (5, 8, 13). Sejajar ke atas = bullish kuat.',
    pineCode: `//@version=5\nindicator("Bill Williams 3 Lines", overlay=true)\njaw = ta.sma(close, 13)\nteeth = ta.sma(close, 8)\nlips = ta.sma(close, 5)\nplot(jaw, "Jaw", color=color.blue, linewidth=2)\nplot(teeth, "Teeth", color=color.red, linewidth=2)\nplot(lips, "Lips", color=color.green, linewidth=2)`,
  },
  {
    id: 'displaced-ema', name: 'Displaced EMA', category: 'Trend',
    description: 'EMA digeser ke depan untuk mengurangi noise.',
    pineCode: `//@version=5\nindicator("Displaced EMA", overlay=true)\nlen = input.int(20, "Length")\ndisp = input.int(5, "Displacement")\nema_val = ta.ema(close, len)\nplot(ema_val, "DEMA", color=color.orange, linewidth=2, offset=disp)`,
  },
  {
    id: 'ma-exp-ribbon', name: 'MA Exp Ribbon', category: 'Trend',
    description: 'EMA bertingkat (8-89). Pita mengembang ke atas = bullish.',
    pineCode: `//@version=5\nindicator("MA Exp Ribbon", overlay=true)\ne8=ta.ema(close,8)\ne13=ta.ema(close,13)\ne21=ta.ema(close,21)\ne34=ta.ema(close,34)\ne55=ta.ema(close,55)\ne89=ta.ema(close,89)`,
  },
  {
    id: 'oscillators', name: 'Oscillators', category: 'Momentum',
    description: 'RSI + Stochastic. RSI>70 overbought, RSI<30 oversold.',
    pineCode: `//@version=5\nindicator("Oscillator Combo", overlay=false)\nrsi_val = ta.rsi(close, 14)\nk = ta.stoch(close, high, low, 14)\nd = ta.sma(k, 3)\nplot(rsi_val, "RSI", color=color.yellow)\nplot(k, "%K", color=color.aqua)\nplot(d, "%D", color=color.orange)`,
  },
  {
    id: 'swing-trading-ind', name: 'Swing Trading', category: 'Strategy',
    description: 'Pivot detection. Beli saat bounce dari support + RSI oversold.',
    pineCode: `//@version=5\nindicator("Swing Trading", overlay=true)\nswingH = ta.pivothigh(5, 5)\nswingL = ta.pivotlow(5, 5)\nplot(swingH, "Swing High", style=plot.style_cross, color=color.red, linewidth=2, offset=-5)\nplot(swingL, "Swing Low", style=plot.style_cross, color=color.green, linewidth=2, offset=-5)`,
  },
  {
    id: 'volume-based', name: 'Volume Based', category: 'Volume',
    description: 'VWAP dan Volume MA. Volume spike 2x rata-rata = potensi breakout.',
    pineCode: `//@version=5\nindicator("Volume Analysis", overlay=false)\nvol_ma = ta.sma(volume, 20)\nvol_ratio = volume / vol_ma\nplot(volume, "Volume", style=plot.style_columns, color=close > open ? color.new(color.green, 40) : color.new(color.red, 40))\nplot(vol_ma, "Vol MA 20", color=color.yellow, linewidth=2)`,
  },
  {
    id: 'zero-lag-trend', name: 'Zero Lag Trend Signals', category: 'Strategy',
    description: 'ZLEMA + band volatilitas ATR. Sinyal Bullish saat breakout band atas.',
    pineCode: `//@version=5\nindicator("Zero Lag Trend Signals", overlay=true)\nlength = input.int(70, "Length")\nmult = input.float(1.2, "Band Multiplier")\nsrc = close\nlag = math.floor((length - 1) / 2)\nzlema = ta.ema(src + (src - src[lag]), length)`,
  },
  {
    id: 'support-resistance', name: 'Support & Resistance Zones', category: 'Structure',
    description: 'Menampilkan zona Support (hijau) dan Resistance (merah) berdasarkan Pivot High/Low clustering.',
    pineCode: '',
  },
  {
    id: 'volume-delta', name: 'Volume Delta', category: 'Volume',
    description: 'Selisih volume beli vs jual per candle (histogram) dan Cumulative Volume Delta (garis kuning).',
    pineCode: '',
  },
  {
    id: 'trading-sessions', name: 'Trading Sessions', category: 'Sessions',
    description: 'Sesi trading: Asia, Eropa, Amerika, Pasifik, dan overlap London-NY & Tokyo-London.',
    pineCode: '',
  },
  {
    id: 'order-flow', name: 'Order Flow (Buy vs Sell)', category: 'Volume',
    description: 'Menampilkan perbandingan jumlah buyer vs seller berdasarkan estimasi volume. Histogram hijau = buyer dominan, merah = seller dominan. Garis kuning = ratio buyer/seller kumulatif. Panel bawah menampilkan persentase buyer vs seller.',
    pineCode: '',
  },
];

interface StrategyPanelProps {
  activeStrategies: string[];
  onStrategyToggle: (id: string) => void;
  activeIndicators: string[];
  onIndicatorToggle: (id: string) => void;
  onApplyPineCode?: (code: string, name: string) => void;
  selectedPair?: string;
  customPineCode?: string;
  onCustomPineCodeChange?: (code: string) => void;
}

export default function StrategyPanel({
  activeStrategies, onStrategyToggle,
  activeIndicators, onIndicatorToggle,
  onApplyPineCode, selectedPair = '',
  customPineCode = '', onCustomPineCodeChange,
}: StrategyPanelProps) {
  const phase = getCurrentHalvingPhase();
  const [panelTab, setPanelTab] = useState<'strategies' | 'indicators' | 'pine'>('strategies');
  const [savedScripts, setSavedScripts] = useState<{ name: string; code: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('pine_saved_scripts') || '[]'); } catch { return []; }
  });
  const [scriptName, setScriptName] = useState('');
  const [editingScript, setEditingScript] = useState<number | null>(null);
  const [localPineCode, setLocalPineCode] = useState(customPineCode);

  useEffect(() => { setLocalPineCode(customPineCode); }, [customPineCode]);

  const updateSavedScripts = (updater: (prev: { name: string; code: string }[]) => { name: string; code: string }[]) => {
    setSavedScripts(prev => {
      const next = updater(prev);
      localStorage.setItem('pine_saved_scripts', JSON.stringify(next));
      return next;
    });
  };

  const applyPineCode = (code: string, name: string) => {
    if (onApplyPineCode) {
      onApplyPineCode(code, name);
    } else {
      toast.success(`"${name}" diterapkan ke chart`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab Header */}
      <div className="flex items-center border-b border-border shrink-0">
        <button onClick={() => setPanelTab('strategies')}
          className={`tab-button flex-1 justify-center text-[10px] ${panelTab === 'strategies' ? 'tab-button-active' : 'tab-button-inactive'}`}>
          ⚙️ Strategy
        </button>
        <button onClick={() => setPanelTab('indicators')}
          className={`tab-button flex-1 justify-center text-[10px] ${panelTab === 'indicators' ? 'tab-button-active' : 'tab-button-inactive'}`}>
          <BarChart3 className="w-3 h-3" /> Template
        </button>
        <button onClick={() => setPanelTab('pine')}
          className={`tab-button flex-1 justify-center text-[10px] ${panelTab === 'pine' ? 'tab-button-active' : 'tab-button-inactive'}`}>
          <Code className="w-3 h-3" /> Pine
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* ─── Strategies Tab (Multi-select) ─── */}
        {panelTab === 'strategies' && (
          <div className="p-3 space-y-1.5">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
              Klik untuk aktifkan/nonaktifkan (bisa tumpuk)
            </div>
            {STRATEGIES.map(s => {
              const Icon = s.icon;
              const active = activeStrategies.includes(s.id);
              return (
                <button key={s.id} onClick={() => onStrategyToggle(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-all ${
                    active ? 'bg-primary/10 border border-primary/30 text-primary glow-cyan'
                    : 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{s.name}</p>
                    <p className="text-[10px] opacity-60">{s.desc}</p>
                  </div>
                  {active && <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />}
                </button>
              );
            })}
            {activeStrategies.length > 0 && (
              <button onClick={() => activeStrategies.forEach(s => onStrategyToggle(s))}
                className="w-full py-1.5 text-[10px] font-semibold rounded-md text-muted-foreground border border-border hover:bg-muted mt-2">
                <XCircle className="w-3 h-3 inline mr-1" /> Hapus Semua ({activeStrategies.length} aktif)
              </button>
            )}
            <StrategyInfo activeStrategies={activeStrategies} phase={phase} />
          </div>
        )}

        {/* ─── Indicator Templates Tab (Multi-select, no auto trade) ─── */}
        {panelTab === 'indicators' && (
          <div>
            <div className="px-3 py-1.5 text-[9px] text-muted-foreground uppercase tracking-wider font-semibold border-b border-border">
              Klik untuk aktifkan/nonaktifkan (bisa tumpuk)
            </div>
            {INDICATOR_TEMPLATES.map(ind => {
              const isActive = activeIndicators.includes(ind.id);
              return (
                <div key={ind.id} className="border-b border-border/50">
                  <button onClick={() => {
                    onIndicatorToggle(ind.id);
                    if (!isActive && ind.pineCode) {
                      setLocalPineCode(ind.pineCode);
                      onCustomPineCodeChange?.(ind.pineCode);
                    }
                  }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all ${isActive ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-primary shadow-sm shadow-primary/50 animate-pulse' : 'bg-muted-foreground/30'}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">{ind.name}</div>
                        <div className="text-[9px] text-muted-foreground">{ind.category}</div>
                      </div>
                    </div>
                    {isActive ? <ChevronUp className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {isActive && (
                    <div className="px-3 pb-3 space-y-2.5 animate-slide-up">
                      <div className="bg-primary/5 border border-primary/15 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BookOpen className="w-3 h-3 text-primary" />
                          <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Cara Penggunaan</span>
                        </div>
                        <p className="text-[10px] text-foreground/80 leading-relaxed">{ind.description}</p>
                      </div>
                      {ind.pineCode && (
                        <button onClick={() => applyPineCode(ind.pineCode, ind.name)}
                          className="w-full py-1.5 text-[10px] font-bold rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors">
                          Terapkan Pine Code ke Chart
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {activeIndicators.length > 0 && (
              <div className="p-3">
                <button onClick={() => activeIndicators.forEach(i => onIndicatorToggle(i))}
                  className="w-full py-1.5 text-[10px] font-semibold rounded-md text-muted-foreground border border-border hover:bg-muted">
                  <XCircle className="w-3 h-3 inline mr-1" /> Hapus Semua ({activeIndicators.length} aktif)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Pine Code Tab ─── */}
        {panelTab === 'pine' && (
          <div>
            <div className="p-3 border-b border-border space-y-2">
              <div className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">
                  {editingScript !== null ? 'Edit Indikator' : 'Tambah Indikator'}
                </span>
              </div>
              <input type="text" value={scriptName} onChange={e => setScriptName(e.target.value)}
                placeholder="Nama indikator..." className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50" />
              <textarea value={localPineCode}
                onChange={e => { setLocalPineCode(e.target.value); onCustomPineCodeChange?.(e.target.value); }}
                placeholder={"// @version=5\nindicator('My Indicator', overlay=true)\nplot(ta.sma(close, 20))"}
                className="w-full h-32 bg-background border border-border rounded-lg p-2 text-[10px] font-mono text-foreground placeholder-muted-foreground resize-none outline-none focus:border-primary/50 scrollbar-thin"
                spellCheck={false} />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground font-mono">{localPineCode.split('\n').length} baris</span>
                <div className="flex items-center gap-1.5">
                  {editingScript !== null && (
                    <button onClick={() => { setEditingScript(null); setLocalPineCode(''); setScriptName(''); }}
                      className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-muted text-muted-foreground border border-border">Batal</button>
                  )}
                  <button onClick={() => {
                    if (!scriptName.trim() || !localPineCode.trim()) return;
                    if (editingScript !== null) {
                      updateSavedScripts(prev => prev.map((s, i) => i === editingScript ? { name: scriptName, code: localPineCode } : s));
                      setEditingScript(null);
                    } else {
                      updateSavedScripts(prev => [...prev, { name: scriptName, code: localPineCode }]);
                    }
                    setLocalPineCode(''); setScriptName('');
                  }} disabled={!scriptName.trim() || !localPineCode.trim()}
                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-primary/15 text-primary border border-primary/25 disabled:opacity-40">
                    <Save className="w-3 h-3" /> {editingScript !== null ? 'Update' : 'Simpan'}
                  </button>
                </div>
              </div>
              {localPineCode.trim() && (
                <button onClick={() => applyPineCode(localPineCode, scriptName || 'Custom')}
                  className="w-full py-1.5 text-[10px] font-bold rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25">
                  Terapkan Indikator
                </button>
              )}
            </div>

            {savedScripts.length > 0 ? (
              <div>
                <div className="px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                  Tersimpan ({savedScripts.length})
                </div>
                {savedScripts.map((script, idx) => (
                  <div key={idx} className="border-b border-border/50">
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Code className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">{script.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setLocalPineCode(script.code); setScriptName(script.name); setEditingScript(idx); }} className="p-1 rounded-md hover:bg-muted">
                          <Edit3 className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => updateSavedScripts(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded-md hover:bg-destructive/10">
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => applyPineCode(script.code, script.name)}
                          className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-primary/15 text-primary hover:bg-primary/25">Terapkan</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-8 text-center">
                <Code className="w-7 h-7 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-[11px] text-muted-foreground">Belum ada indikator kustom</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Strategy Info Sub-component ─── */
function StrategyInfo({ activeStrategies, phase }: { activeStrategies: string[]; phase: any }) {
  const infos: Record<string, React.ReactNode> = {
    'swing-trading': (
      <div className="space-y-1 text-[10px] text-muted-foreground">
        <p>• Deteksi <span className="text-profit font-semibold">Swing Low</span> → <span className="text-profit font-bold">BUY</span></p>
        <p>• Deteksi <span className="text-loss font-semibold">Swing High</span> → <span className="text-loss font-bold">SELL</span></p>
        <p>• Stop Loss otomatis aktif</p>
      </div>
    ),
    halving: (
      <>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: phase.color }} />
          <span className="font-mono text-sm font-bold" style={{ color: phase.color }}>{phase.phase}</span>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{phase.weeksPost} weeks post 4th halving</p>
      </>
    ),
    gainzalgo: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• ATR(14) + EMA(12,26) momentum</p><p>• Break of Structure detection</p></div>,
    fabio: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Volume Profile (POC/VAH/VAL)</p><p>• CVD + Absorption detection</p></div>,
    crt: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• 4H candle sweep reversal</p><p>• SELL: sweep High, BUY: sweep Low</p></div>,
    poi: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Fair Value Gap & Order Block</p><p>• Entry saat harga kembali ke zona POI</p></div>,
    balance: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Identifikasi area konsolidasi</p><p>• Follow arah breakout</p></div>,
    multitf: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Daily key levels, H4 BOS, H1 entry</p></div>,
    darvas: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Kotak konsolidasi + breakout volume</p></div>,
    'trendlines-breaks': <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Trendline otomatis + sinyal breakout</p></div>,
    'rsi-panel': <div className="space-y-1 text-[10px] text-muted-foreground"><p>• RSI {'>'} 70 overbought, {'<'} 30 oversold</p></div>,
    trama: <div className="space-y-1 text-[10px] text-muted-foreground"><p>• Adaptive MA, cepat saat trending</p></div>,
  };

  const activeInfos = activeStrategies.filter(s => infos[s]);
  if (activeInfos.length === 0) return null;

  return (
    <div className="border border-border rounded-md p-3 space-y-2 mt-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Aktif: {activeInfos.length} strategi</p>
      {activeInfos.map(s => (
        <div key={s}>
          <p className="text-[10px] font-semibold text-foreground mb-0.5">{STRATEGIES.find(st => st.id === s)?.name}</p>
          {infos[s]}
        </div>
      ))}
    </div>
  );
}
