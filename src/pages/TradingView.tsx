import { useState, useCallback } from 'react';
import { parsePineScript } from '@/lib/pine-parser';
import { Link } from 'react-router-dom';
import TradingChart from '@/components/TradingChart';
import { useIndodaxData } from '@/hooks/useIndodaxData';
import { toast } from 'sonner';
import { ArrowLeft, Code, Layers, BarChart3, ChevronDown, ChevronUp, Search, BookOpen, X, Plus, Save, Trash2, Edit3, TrendingUp, TrendingDown, Bot, Loader2 } from 'lucide-react';
import AIAdvisorPanel from '@/components/AIAdvisorPanel';
import OrderBookPanel from '@/components/trading/OrderBookPanel';
import RecentTradesPanel from '@/components/trading/RecentTradesPanel';
import MarketStatsBar from '@/components/trading/MarketStatsBar';
import TechnicalSummary from '@/components/trading/TechnicalSummary';
import PriceAlerts from '@/components/trading/PriceAlerts';
import StrategyPanel from '@/components/StrategyPanel';
import type { GainzVersion } from '@/lib/tradingIndicators';
/* ─── Indicator Templates ─── */
const INDICATOR_TEMPLATES = [
  {
    id: 'gainzalgo',
    name: 'GainzAlgo V2 Alpha',
    category: 'Strategy',
    strategyId: 'gainzalgo',
    description: 'Strategi proprietary menggunakan ATR untuk normalisasi volatilitas, EMA (12, 26) untuk momentum, dan Rolling Max/Min (5 periode) untuk deteksi Break of Structure (BOS). Sinyal BUY muncul saat breakout ke atas dengan momentum bullish. Sinyal SELL saat breakdown dengan momentum bearish. Dilengkapi osilator momentum histogram EMA di bawah chart utama.',
    pineCode: `//@version=5
indicator("GainzAlgo V2 Alpha", overlay=true)
atr_len = input.int(14, "ATR Length")
ema_fast = input.int(12, "EMA Fast")
ema_slow = input.int(26, "EMA Slow")
bos_len = input.int(5, "BOS Lookback")

atr = ta.atr(atr_len)
ef = ta.ema(close, ema_fast)
es = ta.ema(close, ema_slow)
momentum = (ef - es) / atr

rMax = ta.highest(high, bos_len)
rMin = ta.lowest(low, bos_len)

buySignal = close > rMax[1] and momentum > 0
sellSignal = close < rMin[1] and momentum < 0

plot(ef, "EMA 12", color=color.aqua, linewidth=2)
plot(es, "EMA 26", color=color.orange, linewidth=2)
plotshape(buySignal, "BUY", shape.triangleup, location.belowbar, color.green, size=size.small)
plotshape(sellSignal, "SELL", shape.triangledown, location.abovebar, color.red, size=size.small)`,
  },
  {
    id: 'fabio',
    name: 'Fabio Valentini',
    category: 'Strategy',
    strategyId: 'fabio',
    description: 'Strategi Order Flow berbasis Volume Profile (POC, VAH, VAL) dan Cumulative Volume Delta (CVD). Deteksi penyerapan harga (absorption) saat volume tinggi tapi harga tidak bergerak signifikan. BUY saat CVD reversal bullish di dekat POC/VAL. SELL saat CVD reversal bearish di dekat POC/VAH. Penanda sinyal mencakup label data Point of Control (POC).',
    pineCode: `//@version=5
indicator("Fabio Valentini - Order Flow", overlay=true)
vp_len = input.int(20, "VP Length")
cvd_len = input.int(14, "CVD Smooth")

// Volume Profile Approximation
poc = ta.vwap(close)
atr = ta.atr(14)
vah = poc + atr * 0.5
val = poc - atr * 0.5

// CVD Approximation
delta = close > open ? volume : close < open ? -volume : 0
cvd = ta.ema(math.sum(delta, cvd_len), 5)
cvd_prev = cvd[1]

// Absorption Detection
vol_ma = ta.sma(volume, 20)
high_vol = volume > vol_ma * 1.5
small_body = math.abs(close - open) < atr * 0.3
absorption = high_vol and small_body

buy = cvd > cvd_prev and close <= val and absorption
sell = cvd < cvd_prev and close >= vah and absorption

plot(poc, "POC", color=color.yellow, linewidth=2, style=plot.style_circles)
plot(vah, "VAH", color=color.red, linewidth=1, style=plot.style_cross)
plot(val, "VAL", color=color.green, linewidth=1, style=plot.style_cross)
plotshape(buy, "BUY", shape.triangleup, location.belowbar, color.green, size=size.small)
plotshape(sell, "SELL", shape.triangledown, location.abovebar, color.red, size=size.small)`,
  },
  {
    id: 'bill-williams-3lines',
    name: "Bill William's 3 Lines",
    category: 'Trend',
    description: 'Menggunakan 3 garis Moving Average (5, 8, 13 periode) dari Bill Williams. Ketika ketiga garis sejajar ke atas dan harga di atas semua garis → tren bullish kuat. Ketika ketiga garis sejajar ke bawah → tren bearish. Crossover antara garis menandakan perubahan tren.',
    pineCode: `//@version=5
indicator("Bill Williams 3 Lines", overlay=true)
jaw = ta.sma(close, 13)
teeth = ta.sma(close, 8)
lips = ta.sma(close, 5)
plot(jaw, "Jaw", color=color.blue, linewidth=2)
plot(teeth, "Teeth", color=color.red, linewidth=2)
plot(lips, "Lips", color=color.green, linewidth=2)`,
  },
  {
    id: 'displaced-ema',
    name: 'Displaced EMA',
    category: 'Trend',
    description: 'EMA yang digeser beberapa periode ke depan untuk mengurangi noise dan memberikan sinyal tren yang lebih smooth. Ketika harga di atas Displaced EMA → zona beli. Ketika harga menembus ke bawah → potensi reversal bearish. Cocok untuk swing trading.',
    pineCode: `//@version=5
indicator("Displaced EMA", overlay=true)
len = input.int(20, "Length")
disp = input.int(5, "Displacement")
ema_val = ta.ema(close, len)
plot(ema_val, "DEMA", color=color.orange, linewidth=2, offset=disp)`,
  },
  {
    id: 'ma-exp-ribbon',
    name: 'MA Exp Ribbon',
    category: 'Trend',
    description: 'Kumpulan EMA dengan periode bertingkat (8, 13, 21, 34, 55, 89) yang membentuk "pita". Ketika semua pita mengembang ke atas → tren bullish sangat kuat. Pita menyempit → konsolidasi. Pita bersilangan → sinyal reversal.',
    pineCode: `//@version=5
indicator("MA Exp Ribbon", overlay=true)
e8  = ta.ema(close, 8)
e13 = ta.ema(close, 13)
e21 = ta.ema(close, 21)
e34 = ta.ema(close, 34)
e55 = ta.ema(close, 55)
e89 = ta.ema(close, 89)
plot(e8, "EMA 8", color=color.new(color.lime, 0))
plot(e13, "EMA 13", color=color.new(color.green, 10))
plot(e21, "EMA 21", color=color.new(color.teal, 20))
plot(e34, "EMA 34", color=color.new(color.blue, 30))
plot(e55, "EMA 55", color=color.new(color.purple, 40))
plot(e89, "EMA 89", color=color.new(color.red, 50))`,
  },
  {
    id: 'oscillators',
    name: 'Oscillators',
    category: 'Momentum',
    description: 'Gabungan RSI dan Stochastic untuk mendeteksi kondisi overbought/oversold. RSI > 70 → overbought (siap jual). RSI < 30 → oversold (siap beli). Stochastic crossover di zona ekstrem memberikan konfirmasi entry/exit yang akurat.',
    pineCode: `//@version=5
indicator("Oscillator Combo", overlay=false)
rsi_val = ta.rsi(close, 14)
k = ta.stoch(close, high, low, 14)
d = ta.sma(k, 3)
plot(rsi_val, "RSI", color=color.yellow)
plot(k, "%K", color=color.aqua)
plot(d, "%D", color=color.orange)
hline(70, "OB", color=color.red)
hline(30, "OS", color=color.green)`,
  },
  {
    id: 'swing-trading',
    name: 'Swing Trading',
    category: 'Strategy',
    description: 'Identifikasi swing high/low menggunakan pivot detection. Beli saat harga bounce dari support + RSI oversold. Jual saat harga sentuh resistance + RSI overbought.',
    pineCode: `//@version=5
indicator("Swing Trading", overlay=true)
swingH = ta.pivothigh(5, 5)
swingL = ta.pivotlow(5, 5)
plot(swingH, "Swing High", style=plot.style_cross, color=color.red, linewidth=2, offset=-5)
plot(swingL, "Swing Low", style=plot.style_cross, color=color.green, linewidth=2, offset=-5)
rsi = ta.rsi(close, 14)
bgcolor(rsi < 30 ? color.new(color.green, 90) : rsi > 70 ? color.new(color.red, 90) : na)`,
  },
  {
    id: 'volume-based',
    name: 'Volume Based',
    category: 'Volume',
    description: 'Analisis volume menggunakan VWAP dan Volume Moving Average. Volume spike di atas rata-rata 2x → potensi breakout.',
    pineCode: `//@version=5
indicator("Volume Analysis", overlay=false)
vol_ma = ta.sma(volume, 20)
vol_ratio = volume / vol_ma
plot(volume, "Volume", style=plot.style_columns, 
     color=close > open ? color.new(color.green, 40) : color.new(color.red, 40))
plot(vol_ma, "Vol MA 20", color=color.yellow, linewidth=2)
hline(1.0, "Avg")
plot(vol_ratio, "Vol Ratio", color=color.aqua, display=display.data_window)`,
  },
  {
    id: 'zero-lag-trend',
    name: 'Zero Lag Trend Signals',
    category: 'Strategy',
    description: 'Indikator tren Zero Lag berbasis ZLEMA (Zero Lag EMA) dengan band volatilitas ATR. Sinyal Bullish muncul saat harga menembus band atas, Bearish saat menembus band bawah. Entry tambahan muncul saat harga crossover/crossunder ZLEMA dalam arah tren yang sudah terkonfirmasi. Cocok untuk menangkap tren awal dengan lag minimal.',
    pineCode: `//@version=5
indicator("Zero Lag Trend Signals (MTF) [AlgoAlpha]", shorttitle="AlgoAlpha - Zero Lag Signals", overlay=true)
length = input.int(70, "Length")
mult = input.float(1.2, "Band Multiplier")
src = close
lag = math.floor((length - 1) / 2)
zlema = ta.ema(src + (src - src[lag]), length)
volatility = ta.highest(ta.atr(length), length*3) * mult
// Trend: 1 = Bullish, -1 = Bearish
// Entry signals on ZLEMA crossover within trend`,
  },
];

/* ─── Chart Types ─── */
const CHART_TYPES = [
  { id: 'candle', name: 'Candle', icon: '🕯️' },
  { id: 'bar', name: 'Bar', icon: '📊' },
  { id: 'hollow-candle', name: 'Candle Kosong', icon: '⬜' },
  { id: 'candle-volume', name: 'Candle Volume', icon: '📈' },
  { id: 'line', name: 'Garis', icon: '📉' },
  { id: 'line-markers', name: 'Garis + Penanda', icon: '📍' },
  { id: 'step-line', name: 'Garis Tahap', icon: '🪜' },
  { id: 'volume-footprint', name: 'Jejak Volume', icon: '👣' },
  { id: 'price-time', name: 'Peluang Harga Waktu', icon: '⏱️' },
  { id: 'session-vp', name: 'Profil Volume Sesi', icon: '📐' },
  { id: 'heikin-ashi', name: 'Heikin Ashi', icon: '🎌' },
  { id: 'renko', name: 'Renko', icon: '🧱' },
];

const BOTTOM_TABS = [
  { id: 'orderbook' as const, label: 'Order Book', icon: '📊' },
  { id: 'trades' as const, label: 'Trades', icon: '⚡' },
  { id: 'technical' as const, label: 'Technical', icon: '📈' },
  { id: 'alerts' as const, label: 'Alerts', icon: '🔔' },
  { id: 'ai' as const, label: 'AI Advisor', icon: '🧠' },
];

export default function TradingView() {
  const [selectedPair, setSelectedPair] = useState('btc_idr');
  const [activeStrategies, setActiveStrategies] = useState<string[]>([]);
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [gainzVersion, setGainzVersion] = useState<GainzVersion>('V2_Alpha');
  const [strategy, setStrategy] = useState('none');
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null);
  const [chartType, setChartType] = useState('candle');
  const [customPineCode, setCustomPineCode] = useState('');
  const [showPineEditor, setShowPineEditor] = useState(false);
  const [showChartTypes, setShowChartTypes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [panelTab, setPanelTab] = useState<'indicators' | 'pine'>('indicators');
  const [savedScripts, setSavedScripts] = useState<{ name: string; code: string }[]>(() => {
    try {
      const stored = localStorage.getItem('pine_saved_scripts');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [scriptName, setScriptName] = useState('');
  const [editingScript, setEditingScript] = useState<number | null>(null);

  // Persist saved scripts to localStorage
  const updateSavedScripts = (updater: (prev: { name: string; code: string }[]) => { name: string; code: string }[]) => {
    setSavedScripts(prev => {
      const next = updater(prev);
      localStorage.setItem('pine_saved_scripts', JSON.stringify(next));
      return next;
    });
  };

  const detectPineTemplate = (code: string): { templateId: string | null; strategyOverride: string | null } => {
    const normalized = code.toLowerCase();

    // CRT Overlay
    if (
      normalized.includes('custom crt overlay style') ||
      normalized.includes('crt candle start') ||
      normalized.includes('purge duration')
    ) {
      return { templateId: 'custom-crt-overlay', strategyOverride: null };
    }

    // Box Theory Pro
    if (
      normalized.includes('box theory pro') ||
      normalized.includes('interactive zones') ||
      (normalized.includes('pivothigh') && normalized.includes('pivotlow') && normalized.includes('premium') && normalized.includes('discount'))
    ) {
      return { templateId: 'box-theory-pro', strategyOverride: null };
    }

    // Zero Lag Trend Signals
    if (
      normalized.includes('zero lag trend') ||
      normalized.includes('zero lag signals') ||
      normalized.includes('algoalpha') ||
      (normalized.includes('zlema') && normalized.includes('volatility') && normalized.includes('trend'))
    ) {
      return { templateId: 'zero-lag-trend', strategyOverride: null };
    }

    // Halving Cycle
    if (
      normalized.includes('halving cycle profit') ||
      normalized.includes('halving cycle') ||
      (normalized.includes('halving') && normalized.includes('dca') && normalized.includes('profit'))
    ) {
      return { templateId: null, strategyOverride: 'halving' };
    }

    // Match built-in indicator templates
    const template = INDICATOR_TEMPLATES.find((tpl) =>
      normalized.includes(tpl.name.toLowerCase()) || normalized.includes(tpl.id.toLowerCase())
    );
    if (template) {
      return { templateId: template.id, strategyOverride: template.strategyId || null };
    }

    // Auto-detect common patterns from Pine code
    if (normalized.includes('ta.ema') || normalized.includes('ta.sma')) {
      // Count EMA/SMA calls to pick best match
      const emaMatches = normalized.match(/ta\.ema/g)?.length || 0;
      const smaMatches = normalized.match(/ta\.sma/g)?.length || 0;
      if (emaMatches >= 4) return { templateId: 'ma-exp-ribbon', strategyOverride: null };
      if (smaMatches >= 3 && normalized.includes('jaw') || normalized.includes('teeth') || normalized.includes('lips'))
        return { templateId: 'bill-williams-3lines', strategyOverride: null };
      if (normalized.includes('displacement') || normalized.includes('offset') || normalized.includes('disp'))
        return { templateId: 'displaced-ema', strategyOverride: null };
    }
    if (normalized.includes('ta.rsi') && normalized.includes('ta.stoch'))
      return { templateId: 'oscillators', strategyOverride: null };
    if (normalized.includes('ta.rsi') && normalized.includes('pivothigh'))
      return { templateId: 'swing-trading', strategyOverride: null };
    if (normalized.includes('volume') && (normalized.includes('vol_ma') || normalized.includes('vol_ratio')))
      return { templateId: 'volume-based', strategyOverride: null };
    if (normalized.includes('ta.pivothigh') && normalized.includes('ta.pivotlow'))
      return { templateId: 'swing-trading', strategyOverride: null };

    return { templateId: null, strategyOverride: null };
  };

  const applyPineCode = (code: string, name: string) => {
    setCustomPineCode(code);
    setShowPineEditor(true);

    const { templateId, strategyOverride } = detectPineTemplate(code);
    
    if (strategyOverride) {
      setStrategy(strategyOverride);
      setActiveIndicator(null);
      toast.success(`Strategi "${name}" diterapkan ke chart`);
      return;
    }
    
    if (templateId) {
      setActiveIndicator(templateId);
      const tpl = INDICATOR_TEMPLATES.find(i => i.id === templateId);
      if (tpl?.strategyId) {
        setStrategy(tpl.strategyId);
      }
      toast.success(`Indikator "${name}" diterapkan ke chart`);
      return;
    }

    // Always use Pine parser engine for any unrecognized code
    setActiveIndicator('custom-pine');
    
    // Parse and show helpful feedback
    try {
      const parsed = parsePineScript(code);
      const varCount = parsed.variables.length;
      const plotCount = parsed.plots.length;
      
      if (varCount === 0 && plotCount === 0) {
        toast.info(`"${name}" — Script ini menggunakan fitur Pine Script yang belum didukung parser (drawing objects, custom functions, dll). Indikator akan ditampilkan sebatas kemampuan parser.`);
      } else {
        toast.success(`"${parsed.title}" berhasil di-parse: ${varCount} variabel, ${plotCount} plot`);
        if (parsed.unsupportedFeatures.length > 0) {
          toast.info(`Fitur belum didukung: ${parsed.unsupportedFeatures.slice(0, 3).join(', ')}. Hasil mungkin tidak 100% sesuai TradingView.`, { duration: 5000 });
        }
      }
    } catch {
      toast.success(`Pine Script "${name}" diterapkan ke chart`);
    }
  };
  const [tradeLoading, setTradeLoading] = useState<'buy' | 'sell' | 'auto' | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [bottomTab, setBottomTab] = useState<'orderbook' | 'trades' | 'technical' | 'alerts' | 'ai'>('orderbook');

  const { allCoins } = useIndodaxData();

  const loadAutoTradeStatus = useCallback(async (pair: string, indicatorId: string) => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const strategyName = `indicator-${indicatorId}`;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = await res.json();
      const config = data?.configs?.find((c: any) => c.pair === pair && c.strategy === strategyName);
      setAutoTradeEnabled(config?.enabled || false);
    } catch {
      setAutoTradeEnabled(false);
    }
  }, []);

  const selectedChartType = CHART_TYPES.find(c => c.id === chartType);

  const filteredCoins = allCoins.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  }).slice(0, 30);

  const selectedSymbol = selectedPair.replace('_idr', '').toUpperCase();
  const currentCoin = allCoins.find(c => c.id === selectedPair);

  const executeQuickTrade = async (tradeType: 'buy' | 'sell') => {
    if (!activeIndicator) { toast.error('Pilih indikator terlebih dahulu'); return; }
    setTradeLoading(tradeType);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const tickerEndpoint = `ticker/${selectedPair.replace('_', '')}`;
      const proxyRes = await fetch(`https://${projectId}.supabase.co/functions/v1/indodax-proxy?endpoint=${encodeURIComponent(tickerEndpoint)}`);
      const proxyData = await proxyRes.json();
      const price = proxyData?.ticker?.last || proxyData?.ticker?.buy || 0;
      if (!price) { toast.error('Gagal mendapatkan harga'); return; }

      const strategyName = `indicator-${activeIndicator}`;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', pair: selectedPair, strategy: strategyName, type: tradeType, price }),
      });
      const data = await res.json();
      if (data.success) {
        const indName = INDICATOR_TEMPLATES.find(i => i.id === activeIndicator)?.name || activeIndicator;
        toast.success(`${tradeType.toUpperCase()} ${selectedSymbol} @ Rp ${Number(price).toLocaleString('id-ID')} • ${indName}`);
      } else {
        toast.error(data.error || 'Trade gagal');
      }
    } catch {
      toast.error('Gagal eksekusi trade');
    } finally {
      setTradeLoading(null);
    }
  };

  const toggleAutoTrade = async () => {
    if (!activeIndicator) { toast.error('Pilih indikator terlebih dahulu'); return; }
    setTradeLoading('auto');
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const strategyName = `indicator-${activeIndicator}`;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', pair: selectedPair, strategy: strategyName, update_strategy: true }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoTradeEnabled(data.config.enabled);
        const indName = INDICATOR_TEMPLATES.find(i => i.id === activeIndicator)?.name || activeIndicator;
        const statusText = data.config.enabled ? 'AKTIF ✅' : 'NONAKTIF ❌';
        toast.success(`Auto-trade ${statusText} • ${selectedSymbol} • ${indName}`);
      }
    } catch {
      toast.error('Gagal toggle auto-trade');
    } finally {
      setTradeLoading(null);
    }
  };

  const handleSelectIndicator = (id: string) => {
    const newId = activeIndicator === id ? null : id;
    setActiveIndicator(newId);
    if (newId) {
      loadAutoTradeStatus(selectedPair, newId);
    } else {
      setAutoTradeEnabled(false);
    }
    const tpl = INDICATOR_TEMPLATES.find(i => i.id === id);
    if (tpl) setCustomPineCode(tpl.pineCode);
    const strategyId = tpl?.strategyId;
    if (strategyId && newId) {
      setStrategy(strategyId);
    } else if (!newId) {
      setStrategy('none');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-10 border-b border-border flex items-center px-4 shrink-0 sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
        <Link to="/" className="p-1 rounded hover:bg-muted transition-colors mr-2">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider ml-2">Trading View</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold ml-2 hidden sm:inline">
          Advanced Chart
        </span>

        {/* Chart Type Selector */}
        <div className="ml-4 relative">
          <button
            onClick={() => setShowChartTypes(!showChartTypes)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold bg-muted border border-border hover:border-muted-foreground text-foreground transition-colors"
          >
            <span>{selectedChartType?.icon}</span>
            <span className="hidden sm:inline">{selectedChartType?.name}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>

          {showChartTypes && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowChartTypes(false)} />
              <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-80 overflow-y-auto scrollbar-thin">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Tipe Chart
                </div>
                {CHART_TYPES.map(ct => (
                  <button
                    key={ct.id}
                    onClick={() => { setChartType(ct.id); setShowChartTypes(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      chartType === ct.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="text-sm">{ct.icon}</span>
                    <span className="font-medium">{ct.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowPineEditor(!showPineEditor)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
              showPineEditor
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-muted text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            <Code className="w-3 h-3" />
            <span className="hidden sm:inline">Pine Editor</span>
          </button>
        </div>
      </header>

      {/* Market Stats Ticker Bar */}
      <MarketStatsBar pair={selectedPair} />

      {/* Main Layout */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* LEFT: Coin Search + Select */}
        <div className="w-[220px] shrink-0 border-r border-border bg-card flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 bg-muted border border-border rounded px-2 py-1.5">
              <Search className="w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari koin..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-foreground placeholder-muted-foreground outline-none flex-1 font-mono"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredCoins.map(coin => {
              const pairId = coin.id;
              const isActive = pairId === selectedPair;
              return (
                <button
                  key={pairId}
                  onClick={() => setSelectedPair(pairId)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors border-l-2 ${
                    isActive ? 'bg-primary/10 border-primary' : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-foreground">{coin.symbol}</span>
                    <span className="text-[9px] text-muted-foreground">/IDR</span>
                  </div>
                  <div className={`text-[10px] font-semibold ${coin.change24h >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER: Chart */}
        <div className="flex-1 min-w-0 flex flex-col max-w-[650px] mx-auto">
          <div className="h-[45vh] min-h-[280px] max-h-[420px]">
            <TradingChart pair={selectedPair} strategies={strategy !== 'none' ? [strategy] : []} chartType={chartType as any} activeIndicators={activeIndicator ? [activeIndicator] : []} customPineCode={activeIndicator === 'custom-pine' ? customPineCode : ''} />
          </div>

          {/* Pine Code Editor */}
          {showPineEditor && (
            <div className="border-t border-border bg-card animate-slide-up">
              <div className="panel-header">
                <div className="flex items-center gap-2">
                  <Code className="w-3.5 h-3.5 text-primary" />
                  <span className="panel-header-title">Pine Script Editor</span>
                </div>
                <button onClick={() => setShowPineEditor(false)} className="p-1.5 hover:bg-muted rounded-md transition-colors">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-3">
                <textarea
                  value={customPineCode}
                  onChange={e => setCustomPineCode(e.target.value)}
                  placeholder={`// Tulis Pine Script kustom di sini...\n//@version=5\nindicator('Custom Indicator', overlay=true)`}
                  className="w-full h-36 bg-background border border-border rounded-lg p-3 text-xs font-mono text-foreground placeholder-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors scrollbar-thin"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Pine Script v5 • {customPineCode.split('\n').length} baris
                  </span>
                  <button
                    onClick={() => applyPineCode(customPineCode, 'Custom')}
                    className="px-4 py-1.5 text-[10px] font-bold rounded-md bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors">
                    Terapkan Indikator
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Professional Panels */}
          <div className="border-t border-border">
            {/* Tab Bar */}
            <div className="flex items-center border-b border-border bg-card/80 overflow-x-auto scrollbar-thin">
              {BOTTOM_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setBottomTab(tab.id)}
                  className={`tab-button ${
                    bottomTab === tab.id ? 'tab-button-active' : 'tab-button-inactive'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="h-[320px] overflow-hidden">
              {bottomTab === 'orderbook' && <OrderBookPanel pair={selectedPair} />}
              {bottomTab === 'trades' && <RecentTradesPanel pair={selectedPair} />}
              {bottomTab === 'technical' && <TechnicalSummary pair={selectedPair} />}
              {bottomTab === 'alerts' && (
                <PriceAlerts
                  pair={selectedPair}
                  currentPrice={currentCoin?.last || 0}
                />
              )}
              {bottomTab === 'ai' && (
                <div className="p-3 h-full overflow-y-auto scrollbar-thin">
                  <AIAdvisorPanel
                    coin={selectedSymbol}
                    price={currentCoin?.last || 0}
                    change24h={currentCoin?.change24h || 0}
                    volume={currentCoin?.volumeIdr || 0}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Indicator Panel */}
        <div className="w-[280px] shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
          {/* Panel Tabs */}
          <div className="flex items-center border-b border-border">
            <button
              onClick={() => setPanelTab('indicators')}
              className={`tab-button flex-1 justify-center ${
                panelTab === 'indicators' ? 'tab-button-active' : 'tab-button-inactive'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Template
            </button>
            <button
              onClick={() => { setPanelTab('pine'); setShowPineEditor(true); }}
              className={`tab-button flex-1 justify-center ${
                panelTab === 'pine' ? 'tab-button-active' : 'tab-button-inactive'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              Pine Code
            </button>
          </div>

          {/* Indicator List */}
          {panelTab === 'indicators' ? (
            <div className="max-h-[50vh] lg:max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin">
              {INDICATOR_TEMPLATES.map(ind => {
                const isActive = activeIndicator === ind.id;
                return (
                  <div key={ind.id} className="border-b border-border/50">
                    <button
                      onClick={() => handleSelectIndicator(ind.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all ${
                        isActive ? 'bg-primary/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${isActive ? 'bg-primary shadow-sm shadow-primary/50' : 'bg-muted-foreground/30'}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{ind.name}</div>
                          <div className="text-[9px] text-muted-foreground">{ind.category}</div>
                        </div>
                      </div>
                      {isActive ? <ChevronUp className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    </button>

                    {isActive && (
                      <div className="px-3 pb-3 space-y-2.5 animate-slide-up">
                        {/* Description */}
                        <div className="bg-primary/5 border border-primary/15 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <BookOpen className="w-3 h-3 text-primary" />
                            <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Cara Penggunaan</span>
                          </div>
                          <p className="text-[10px] text-foreground/80 leading-relaxed">{ind.description}</p>
                        </div>

                        {/* Pine Code Preview */}
                        <div className="bg-background border border-border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-2 py-1 bg-muted/50 border-b border-border">
                            <span className="text-[9px] font-mono text-muted-foreground">Pine Script v5</span>
                            <button
                              onClick={() => { setCustomPineCode(ind.pineCode); setScriptName(ind.name); setPanelTab('pine'); }}
                              className="text-[9px] font-semibold text-primary hover:text-primary/80 transition-colors"
                            >
                              Edit →
                            </button>
                          </div>
                          <pre className="p-2 text-[9px] font-mono text-foreground/60 whitespace-pre-wrap break-all leading-relaxed max-h-24 overflow-y-auto scrollbar-thin">
                            {ind.pineCode}
                          </pre>
                        </div>

                        <button
                          onClick={() => applyPineCode(ind.pineCode, ind.name)}
                          className="w-full py-1.5 text-[10px] font-bold rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors">
                          Terapkan ke Chart
                        </button>

                        {/* Auto Trade Controls */}
                        <div className="bg-muted/30 border border-border rounded-lg p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Auto Trade</span>
                            <span className="text-[9px] text-muted-foreground font-mono">{selectedSymbol}/IDR</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => executeQuickTrade('buy')}
                              disabled={tradeLoading !== null}
                              className="btn-trade-buy flex-1 py-1.5 text-[10px]"
                            >
                              {tradeLoading === 'buy' ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                              BUY
                            </button>
                            <button
                              onClick={toggleAutoTrade}
                              disabled={tradeLoading !== null}
                              className={`btn-trade-auto flex-1 py-1.5 text-[10px] ${
                                autoTradeEnabled
                                  ? 'bg-primary/20 text-primary border border-primary/40 shadow-sm shadow-primary/20'
                                  : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground'
                              }`}
                            >
                              {tradeLoading === 'auto' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                              {autoTradeEnabled ? 'ON' : 'AUTO'}
                            </button>
                            <button
                              onClick={() => executeQuickTrade('sell')}
                              disabled={tradeLoading !== null}
                              className="btn-trade-sell flex-1 py-1.5 text-[10px]"
                            >
                              {tradeLoading === 'sell' ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingDown className="w-3 h-3" />}
                              SELL
                            </button>
                          </div>
                          {autoTradeEnabled && (
                            <div className="flex items-center gap-1.5 text-[9px] text-primary font-mono animate-fade-in">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                              Auto-trade aktif • {ind.name}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Pine Code Tab */
            <div className="max-h-[50vh] lg:max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin">
              <div className="p-3 border-b border-border space-y-2">
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">
                    {editingScript !== null ? 'Edit Indikator' : 'Tambah Indikator'}
                  </span>
                </div>

                <input
                  type="text"
                  value={scriptName}
                  onChange={e => setScriptName(e.target.value)}
                  placeholder="Nama indikator..."
                  className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 transition-colors"
                />

                <textarea
                  value={customPineCode}
                  onChange={e => setCustomPineCode(e.target.value)}
                  placeholder={"// @version=5\nindicator('My Indicator', overlay=true)\nplot(ta.sma(close, 20))"}
                  className="w-full h-32 bg-background border border-border rounded-lg p-2 text-[10px] font-mono text-foreground placeholder-muted-foreground resize-none outline-none focus:border-primary/50 transition-colors scrollbar-thin"
                  spellCheck={false}
                />

                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {customPineCode.split('\n').length} baris
                  </span>
                  <div className="flex items-center gap-1.5">
                    {editingScript !== null && (
                      <button
                        onClick={() => { setEditingScript(null); setCustomPineCode(''); setScriptName(''); }}
                        className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-muted text-muted-foreground border border-border hover:text-foreground transition-colors"
                      >
                        Batal
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!scriptName.trim() || !customPineCode.trim()) return;
                        if (editingScript !== null) {
                          updateSavedScripts(prev => prev.map((s, i) => i === editingScript ? { name: scriptName, code: customPineCode } : s));
                          setEditingScript(null);
                        } else {
                          updateSavedScripts(prev => [...prev, { name: scriptName, code: customPineCode }]);
                        }
                        setCustomPineCode('');
                        setScriptName('');
                      }}
                      disabled={!scriptName.trim() || !customPineCode.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 disabled:opacity-40 transition-colors"
                    >
                      <Save className="w-3 h-3" />
                      {editingScript !== null ? 'Update' : 'Simpan'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Saved Scripts */}
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
                          <button
                            onClick={() => { setCustomPineCode(script.code); setScriptName(script.name); setEditingScript(idx); }}
                            className="p-1 rounded-md hover:bg-muted transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button
                            onClick={() => updateSavedScripts(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </button>
                          <button
                            onClick={() => applyPineCode(script.code, script.name)}
                            className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
                            Terapkan
                          </button>
                        </div>
                      </div>
                      <pre className="px-3 pb-2 text-[9px] font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed max-h-16 overflow-y-auto scrollbar-thin">
                        {script.code.split('\n').slice(0, 4).join('\n')}{script.code.split('\n').length > 4 ? '\n...' : ''}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-8 text-center">
                  <Code className="w-7 h-7 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground">Belum ada indikator kustom</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Tulis Pine Script dan simpan</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
