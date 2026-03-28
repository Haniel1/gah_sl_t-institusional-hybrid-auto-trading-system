// TradingChart v5 - with Pine Script parser support + multi-strategy/indicator stacking
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, BarSeries, HistogramSeries, LineSeries, AreaSeries, BaselineSeries, createSeriesMarkers, type IChartApi, ColorType, LineType } from 'lightweight-charts';
import { useIndodaxCandles } from '@/hooks/useIndodax';
import { calculateGainzAlgo, calculateFabioValentini, getCurrentHalvingPhase } from '@/lib/strategies';
import { calculateCRTOverlay, calculatePOIStrategy, calculateBalanceArea, calculateMultiTFSR, calculateDarvasBox } from '@/lib/strategies/index';
import { useSignalNotifier } from '@/hooks/useSignalNotifier';
import { useAuth } from '@/contexts/AuthContext';
import { parsePineScript, computePineData } from '@/lib/pine-parser';

export type ChartTypeId = 'candle' | 'bar' | 'hollow-candle' | 'candle-volume' | 'line' | 'line-markers' | 'step-line' | 'volume-footprint' | 'price-time' | 'session-vp' | 'heikin-ashi' | 'renko';

interface TradingChartProps {
  pair: string;
  strategies: string[];
  chartType?: ChartTypeId;
  activeIndicators?: string[];
  customPineCode?: string;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export default function TradingChart({ pair, strategies, chartType = 'candle', activeIndicators = [], customPineCode = '' }: TradingChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const oscRef = useRef<HTMLDivElement>(null);
  const stochRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const rsiPanelRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any>(null);
  const halvingSeriesRefs = useRef<any[]>([]);
  const chartInstance = useRef<IChartApi | null>(null);
  const oscChartInstance = useRef<IChartApi | null>(null);
  const stochChartInstance = useRef<IChartApi | null>(null);
  const rsiChartInstance = useRef<IChartApi | null>(null);
  const rsiPanelChartInstance = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const indicatorSeriesRefs = useRef<any[]>([]);
  const [timeframe, setTimeframe] = useState('1h');
  const userInteractingRef = useRef(false);
  const interactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRangeSetRef = useRef(false);
  const lookbackCandles = strategies.includes('halving')
    ? timeframe === '1M'
      ? 240
      : timeframe === '1w'
      ? 1200
      : 4000
    : 300;
  const { candles, loading, setPaused } = useIndodaxCandles(pair, timeframe, lookbackCandles);

  const { user } = useAuth();
  useSignalNotifier(pair, strategies[0] || 'none', candles, user?.id);

  useEffect(() => {
    if (strategies.includes('halving') && !['1d', '1w', '1M'].includes(timeframe)) {
      setTimeframe('1d');
    }
    initialRangeSetRef.current = false;
  }, [strategies, timeframe, pair]);

  // Main chart - recreate when chartType changes
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'hsl(220, 20%, 4%)' },
        textColor: 'hsl(210, 20%, 50%)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'hsl(220, 14%, 12%)' },
        horzLines: { color: 'hsl(220, 14%, 12%)' },
      },
      crosshair: {
        vertLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 },
        horzLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 },
      },
      rightPriceScale: { borderColor: 'hsl(220, 14%, 18%)' },
      timeScale: { borderColor: 'hsl(220, 14%, 18%)', timeVisible: true },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
    });

    // Create main series based on chartType
    let mainSeries: any;
    switch (chartType) {
      case 'bar':
        mainSeries = chart.addSeries(BarSeries, {
          upColor: '#22c55e', downColor: '#ef4444',
          thinBars: false,
        });
        break;
      case 'hollow-candle':
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: 'transparent', downColor: '#ef4444',
          borderUpColor: '#22c55e', borderDownColor: '#ef4444',
          wickUpColor: '#22c55e', wickDownColor: '#ef4444',
        });
        break;
      case 'line':
        mainSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6', lineWidth: 2,
        });
        break;
      case 'line-markers':
        mainSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6', lineWidth: 2,
          crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
          crosshairMarkerBackgroundColor: '#3b82f6',
        });
        break;
      case 'step-line':
        mainSeries = chart.addSeries(LineSeries, {
          color: '#8b5cf6', lineWidth: 2,
          lineType: LineType.WithSteps,
        });
        break;
      case 'heikin-ashi':
        // Heikin-Ashi uses candle series but data is transformed
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e', downColor: '#ef4444',
          borderUpColor: '#22c55e', borderDownColor: '#ef4444',
          wickUpColor: '#22c55e', wickDownColor: '#ef4444',
        });
        break;
      case 'candle-volume':
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e', downColor: '#ef4444',
          borderUpColor: '#22c55e', borderDownColor: '#ef4444',
          wickUpColor: '#22c55e', wickDownColor: '#ef4444',
        });
        break;
      default: // 'candle' and others
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e', downColor: '#ef4444',
          borderUpColor: '#22c55e', borderDownColor: '#ef4444',
          wickUpColor: '#22c55e', wickDownColor: '#ef4444',
        });
        break;
    }

    const vs = chart.addSeries(HistogramSeries, {
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartInstance.current = chart;
    mainSeriesRef.current = mainSeries;
    volumeSeriesRef.current = vs;

    // Pause refresh when user is panning/zooming
    const handleInteractionStart = () => {
      userInteractingRef.current = true;
      setPaused(true);
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
    };
    const handleInteractionEnd = () => {
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
      interactTimeoutRef.current = setTimeout(() => {
        userInteractingRef.current = false;
        setPaused(false);
      }, 2000);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleInteractionStart);
    // Resume after scroll/zoom ends via mouse up / touch end on the container
    const el = chartRef.current;
    el?.addEventListener('mouseup', handleInteractionEnd);
    el?.addEventListener('touchend', handleInteractionEnd);
    el?.addEventListener('wheel', handleInteractionEnd, { passive: true });

    // Use ResizeObserver for accurate container size tracking
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.applyOptions({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
      }
    });
    resizeObserver.observe(chartRef.current);

    // Force resize after layout settles (fixes initial small chart)
    requestAnimationFrame(() => {
      if (chartRef.current) {
        chart.applyOptions({
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight,
        });
        chart.timeScale().fitContent();
      }
    });

    return () => {
      resizeObserver.disconnect();
      indicatorSeriesRefs.current = [];
      el?.removeEventListener('mouseup', handleInteractionEnd);
      el?.removeEventListener('touchend', handleInteractionEnd);
      el?.removeEventListener('wheel', handleInteractionEnd);
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
      chart.remove();
    };
  }, [chartType, setPaused]);

  // Oscillator chart for GainzAlgo
  useEffect(() => {
    if (!oscRef.current || !strategies.includes('gainzalgo')) return;

    const oscChart = createChart(oscRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'hsl(220, 20%, 4%)' },
        textColor: 'hsl(210, 20%, 50%)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'hsl(220, 14%, 10%)' },
        horzLines: { color: 'hsl(220, 14%, 10%)' },
      },
      rightPriceScale: { borderColor: 'hsl(220, 14%, 18%)' },
      timeScale: { borderColor: 'hsl(220, 14%, 18%)', timeVisible: true, visible: true },
      crosshair: {
        vertLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 },
        horzLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 },
      },
      width: oscRef.current.clientWidth,
      height: oscRef.current.clientHeight,
    });

    oscChartInstance.current = oscChart;

    const handleResize = () => {
      if (oscRef.current) {
        oscChart.applyOptions({
          width: oscRef.current.clientWidth,
          height: oscRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      oscChart.remove();
      oscChartInstance.current = null;
    };
  }, [strategies]);

  // Update data & indicators
  useEffect(() => {
    if (!mainSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    // Transform data for Heikin-Ashi
    let processedCandles = candles;
    if (chartType === 'heikin-ashi') {
      processedCandles = candles.map((c, i) => {
        const prevHA = i > 0 ? processedCandles[i - 1] : c;
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        const haOpen = (prevHA.open + prevHA.close) / 2;
        return { ...c, open: haOpen, close: haClose, high: Math.max(c.high, haOpen, haClose), low: Math.min(c.low, haOpen, haClose) };
      });
    }

    const isLineSeries = ['line', 'line-markers', 'step-line'].includes(chartType);

    if (isLineSeries) {
      const lineData = processedCandles.map(c => ({ time: c.time as any, value: c.close }));
      mainSeriesRef.current.setData(lineData);
    } else {
      const candleData = processedCandles.map(c => ({
        time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      mainSeriesRef.current.setData(candleData);
    }

    const volData = candles.map(c => ({
      time: c.time as any,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
    }));
    volumeSeriesRef.current.setData(volData);

    // Set initial visible range
    if (!initialRangeSetRef.current && chartInstance.current && candles.length > 0) {
      initialRangeSetRef.current = true;
      const intervalSec = timeframe === '1m' ? 60
        : timeframe === '5m' ? 300
        : timeframe === '15m' ? 900
        : timeframe === '4h' ? 14400
        : timeframe === '1d' ? 86400
        : timeframe === '1w' ? 604800
        : timeframe === '1M' ? 2592000
        : 3600;
      const twoDaysSec = 2 * 24 * 3600;
      const visibleCandles = Math.ceil(twoDaysSec / intervalSec);
      const lastIdx = candles.length - 1;
      const fromIdx = Math.max(0, lastIdx - visibleCandles);
      chartInstance.current.timeScale().setVisibleLogicalRange({ from: fromIdx, to: lastIdx + 3 });
    }

    // --- Clean old indicator/strategy overlays ---
    for (const s of indicatorSeriesRefs.current) {
      try { chartInstance.current?.removeSeries(s); } catch {}
    }
    indicatorSeriesRefs.current = [];

    // --- Add markers for signals ---
    const markers: any[] = [];

    // Always clear halving background when strategy changes
    for (const s of halvingSeriesRefs.current) {
      try { chartInstance.current?.removeSeries(s); } catch {}
    }
    halvingSeriesRefs.current = [];

    // Helper arrays
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    // ═══════════════════════════════════════════════════
    // STRATEGIES (independent if blocks - stackable)
    // ═══════════════════════════════════════════════════

    if (strategies.includes('swing-trading')) {
      for (let i = 5; i < candles.length - 5; i++) {
        const isHigh = highs.slice(i - 5, i).every(h => h <= highs[i]) && highs.slice(i + 1, i + 6).every(h => h <= highs[i]);
        const isLow = lows.slice(i - 5, i).every(l => l >= lows[i]) && lows.slice(i + 1, i + 6).every(l => l >= lows[i]);
        if (isHigh) markers.push({ time: candles[i].time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'Swing H' });
        if (isLow) markers.push({ time: candles[i].time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'Swing L' });
      }
    }

    if (strategies.includes('gainzalgo')) {
      const signals = calculateGainzAlgo(candles);
      for (const s of signals) {
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: s.type === 'buy' ? 'BUY' : 'SELL',
        });
      }

      // Momentum oscillator sub-chart
      if (oscChartInstance.current) {
        const emaFast = ema(closes, 12);
        const emaSlow = ema(closes, 26);
        const momentum = emaFast.map((f, i) => f - emaSlow[i]);
        const maxAbs = Math.max(...momentum.map(Math.abs)) || 1;

        const histData = candles.map((c, i) => ({
          time: c.time as any,
          value: momentum[i] / maxAbs,
          color: momentum[i] >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
        }));

        const existingSeries = (oscChartInstance.current as any).__momentumSeries;
        if (existingSeries) {
          try { oscChartInstance.current.removeSeries(existingSeries); } catch {}
        }

        const momentumSeries = oscChartInstance.current.addSeries(HistogramSeries, {
          priceFormat: { type: 'custom', formatter: (v: number) => v.toFixed(2) },
          priceScaleId: 'right',
        });
        (oscChartInstance.current as any).__momentumSeries = momentumSeries;
        momentumSeries.setData(histData);

        const existingZero = (oscChartInstance.current as any).__zeroLine;
        if (existingZero) {
          try { oscChartInstance.current.removeSeries(existingZero); } catch {}
        }
        const zeroLine = oscChartInstance.current.addSeries(LineSeries, {
          color: 'rgba(255,255,255,0.2)',
          lineWidth: 1,
          priceScaleId: 'right',
        });
        (oscChartInstance.current as any).__zeroLine = zeroLine;
        zeroLine.setData(candles.map(c => ({ time: c.time as any, value: 0 })));

        oscChartInstance.current.timeScale().fitContent();
      }
    }

    if (strategies.includes('fabio')) {
      const signals = calculateFabioValentini(candles);
      for (const s of signals) {
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: s.type === 'buy' ? `BUY (POC:${s.poc.toFixed(0)})` : `SELL (POC:${s.poc.toFixed(0)})`,
        });
      }
    }

    if (strategies.includes('crt')) {
      const signals = calculateCRTOverlay(candles);
      for (const s of signals) {
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: s.type === 'buy'
            ? `BUY (CRT:${s.crtLow.toFixed(0)})`
            : `SELL (CRT:${s.crtHigh.toFixed(0)})`,
        });
      }
    }

    if (strategies.includes('poi')) {
      const signals = calculatePOIStrategy(candles);
      for (const s of signals) {
        const label = s.poiType === 'fvg' ? 'FVG' : 'OB';
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${s.type.toUpperCase()} (${label})`,
        });
      }
    }

    if (strategies.includes('balance')) {
      const signals = calculateBalanceArea(candles);
      for (const s of signals) {
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${s.type.toUpperCase()} (Breakout ${s.breakoutStrength.toFixed(1)}x)`,
        });
      }
    }

    if (strategies.includes('multitf')) {
      const signals = calculateMultiTFSR(candles);
      for (const s of signals) {
        const bos = s.bosConfirmed ? '✓BOS' : '';
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${s.type.toUpperCase()} S/R:${s.keyLevel.toFixed(0)} ${bos}`,
        });
      }
    }

    if (strategies.includes('darvas')) {
      const signals = calculateDarvasBox(candles);
      for (const s of signals) {
        markers.push({
          time: s.time,
          position: s.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: s.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: s.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${s.type.toUpperCase()} Box(${s.boxTop.toFixed(0)}-${s.boxBottom.toFixed(0)}) Vol:${s.volumeRatio.toFixed(1)}x`,
        });
      }
    }

    if (strategies.includes('trendlines-breaks')) {
      // LuxAlgo Trendlines with Breaks — native implementation
      const tbCloses = candles.map(c => c.close);
      const tbHighs = candles.map(c => c.high);
      const tbLows = candles.map(c => c.low);
      const tbLength = 14;
      const tbMult = 1.0;
      const tbAtr = atr(candles, tbLength);

      // Pivot High / Pivot Low detection
      const pivotHighIdx: number[] = [];
      const pivotLowIdx: number[] = [];
      for (let i = tbLength; i < candles.length - tbLength; i++) {
        let isPH = true, isPL = true;
        for (let j = i - tbLength; j <= i + tbLength; j++) {
          if (j === i) continue;
          if (candles[j].high >= candles[i].high) isPH = false;
          if (candles[j].low <= candles[i].low) isPL = false;
        }
        if (isPH) pivotHighIdx.push(i);
        if (isPL) pivotLowIdx.push(i);
      }

      let upperLine: { time: any; value: number }[] = [];
      let lowerLine: { time: any; value: number }[] = [];
      const upperBreakData: { time: any }[] = [];
      const lowerBreakData: { time: any }[] = [];

      if (pivotHighIdx.length >= 1) {
        const phIdx = pivotHighIdx[pivotHighIdx.length - 1];
        let slope = (tbAtr[phIdx] / tbLength) * tbMult;
        let upperVal = candles[phIdx].high;
        let upos = 0;
        for (let i = phIdx; i < candles.length; i++) {
          upperVal = upperVal - slope;
          if (pivotHighIdx.includes(i)) { upperVal = candles[i].high; slope = (tbAtr[i] / tbLength) * tbMult; upos = 0; }
          const prevUpos = upos;
          if (tbCloses[i] > upperVal + slope * tbLength) upos = 1;
          upperLine.push({ time: candles[i].time as any, value: upperVal });
          if (upos === 1 && prevUpos === 0) upperBreakData.push({ time: candles[i].time as any });
        }
      }

      if (pivotLowIdx.length >= 1) {
        const plIdx = pivotLowIdx[pivotLowIdx.length - 1];
        let slope = (tbAtr[plIdx] / tbLength) * tbMult;
        let lowerVal = candles[plIdx].low;
        let dnos = 0;
        for (let i = plIdx; i < candles.length; i++) {
          lowerVal = lowerVal + slope;
          if (pivotLowIdx.includes(i)) { lowerVal = candles[i].low; slope = (tbAtr[i] / tbLength) * tbMult; dnos = 0; }
          const prevDnos = dnos;
          if (tbCloses[i] < lowerVal - slope * tbLength) dnos = 1;
          lowerLine.push({ time: candles[i].time as any, value: lowerVal });
          if (dnos === 1 && prevDnos === 0) lowerBreakData.push({ time: candles[i].time as any });
        }
      }

      if (upperLine.length > 0) {
        const upTrendSeries = chartInstance.current!.addSeries(LineSeries, {
          color: '#14b8a6', lineWidth: 2, priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        upTrendSeries.setData(upperLine);
        indicatorSeriesRefs.current.push(upTrendSeries);
      }
      if (lowerLine.length > 0) {
        const dnTrendSeries = chartInstance.current!.addSeries(LineSeries, {
          color: '#ef4444', lineWidth: 2, priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        dnTrendSeries.setData(lowerLine);
        indicatorSeriesRefs.current.push(dnTrendSeries);
      }

      for (const b of upperBreakData) {
        markers.push({ time: b.time, position: 'belowBar', color: '#14b8a6', shape: 'arrowUp', text: 'B↑ Break' });
      }
      for (const b of lowerBreakData) {
        markers.push({ time: b.time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'B↓ Break' });
      }
    }

    if (strategies.includes('trama')) {
      // LuxAlgo TRAMA — Trend Regularity Adaptive Moving Average
      const tramaLength = 99;
      const tramaHighs = candles.map(c => c.high);
      const tramaLows = candles.map(c => c.low);
      const tramaCloses = candles.map(c => c.close);
      const hhArr: number[] = new Array(candles.length).fill(0);
      const llArr: number[] = new Array(candles.length).fill(0);
      for (let i = tramaLength; i < candles.length; i++) {
        const prevHighest = Math.max(...tramaHighs.slice(i - tramaLength, i));
        const curHighest = Math.max(...tramaHighs.slice(i - tramaLength + 1, i + 1));
        hhArr[i] = curHighest > prevHighest ? 1 : 0;
        const prevLowest = Math.min(...tramaLows.slice(i - tramaLength, i));
        const curLowest = Math.min(...tramaLows.slice(i - tramaLength + 1, i + 1));
        llArr[i] = curLowest < prevLowest ? 1 : 0;
      }
      const tcRaw: number[] = candles.map((_, i) => (hhArr[i] === 1 || llArr[i] === 1) ? 1 : 0);
      const tcSma = sma(tcRaw, tramaLength);
      const tc = tcSma.map(v => v * v);

      const tramaVals: number[] = new Array(candles.length).fill(0);
      tramaVals[0] = tramaCloses[0];
      for (let i = 1; i < candles.length; i++) {
        tramaVals[i] = tramaVals[i - 1] + tc[i] * (tramaCloses[i] - tramaVals[i - 1]);
      }

      const tramaSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#ff1100', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false,
      });
      tramaSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: tramaVals[i] })));
      indicatorSeriesRefs.current.push(tramaSeries);

      for (let i = 1; i < candles.length; i++) {
        if (tramaCloses[i - 1] <= tramaVals[i - 1] && tramaCloses[i] > tramaVals[i]) {
          markers.push({ time: candles[i].time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'TRAMA ▲' });
        }
        if (tramaCloses[i - 1] >= tramaVals[i - 1] && tramaCloses[i] < tramaVals[i]) {
          markers.push({ time: candles[i].time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'TRAMA ▼' });
        }
      }
    }

    if (strategies.includes('rsi-panel')) {
      const rsiCloses = candles.map(c => c.close);
      const rsiVals = rsi(rsiCloses, 14);
      for (let i = 1; i < candles.length; i++) {
        if (rsiVals[i - 1] > 30 && rsiVals[i] <= 30) {
          markers.push({ time: candles[i].time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'RSI Oversold' });
        }
        if (rsiVals[i - 1] < 70 && rsiVals[i] >= 70) {
          markers.push({ time: candles[i].time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'RSI Overbought' });
        }
      }
    }

    if (strategies.includes('halving')) {
      const priceMax = Math.max(...candles.map(c => c.high));
      const minTime = candles[0]?.time ?? 0;
      const maxTime = candles[candles.length - 1]?.time ?? 0;
      const WEEK_SEC = 7 * 24 * 60 * 60;

      const halvingCycles = [
        { date: new Date('2012-11-28'), label: '11/28/2012' },
        { date: new Date('2016-07-09'), label: '7/9/2016' },
        { date: new Date('2020-05-11'), label: '5/11/2020' },
        { date: new Date('2024-04-19'), label: '4/19/2024' },
      ];

      const addBand = (startSec: number, endSec: number, color: string, heightMult = 1.1) => {
        if (endSec < minTime || startSec > maxTime) return;
        const bandData = candles
          .filter(c => c.time >= startSec && c.time <= endSec)
          .map(c => ({ time: c.time as any, value: priceMax * heightMult, color }));
        if (bandData.length === 0) return;

        const bgSeries = chartInstance.current!.addSeries(HistogramSeries, {
          priceScaleId: 'halving-bg',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        bgSeries.setData(bandData);
        halvingSeriesRefs.current.push(bgSeries);
      };

      for (const cycle of halvingCycles) {
        const halvingSec = Math.floor(cycle.date.getTime() / 1000);
        const profitStartSec = halvingSec + 40 * WEEK_SEC;
        const profitEndSec = halvingSec + 80 * WEEK_SEC;
        const dcaSec = halvingSec + 135 * WEEK_SEC;

        // Halving vertical marker band + label (orange)
        addBand(halvingSec - WEEK_SEC * 0.35, halvingSec + WEEK_SEC * 0.35, 'rgba(249,115,22,0.20)', 1.12);
        const halvingCandle = candles.find(c => Math.abs(c.time - halvingSec) <= WEEK_SEC * 2);
        if (halvingCandle) {
          markers.push({
            time: halvingCandle.time,
            position: 'belowBar',
            color: '#f97316',
            shape: 'circle',
            text: `⛏ Halving\n${cycle.label}`,
          });
        }

        // Skip cycle if its main profit window not in current chart range
        if (profitEndSec < minTime || profitStartSec > maxTime) continue;

        // Green stripes matching Pine offsets: +40, +47, +54, +61, +68, +75 weeks
        const stripeOffsets = [40, 47, 54, 61, 68, 75];
        const stripeDurations = [5.5, 5.5, 5.5, 5.5, 5.5, 3.5];
        const stripeOpacities = [0.12, 0.16, 0.20, 0.24, 0.28, 0.22];

        stripeOffsets.forEach((offset, idx) => {
          const stripeStart = halvingSec + offset * WEEK_SEC;
          const stripeEnd = stripeStart + stripeDurations[idx] * WEEK_SEC;
          addBand(stripeStart, stripeEnd, `rgba(34,197,94,${stripeOpacities[idx]})`);
        });

        // Profit START / END vertical highlights (mimic dotted guides)
        addBand(profitStartSec - WEEK_SEC * 0.18, profitStartSec + WEEK_SEC * 0.18, 'rgba(34,197,94,0.42)', 1.12);
        addBand(profitEndSec - WEEK_SEC * 0.18, profitEndSec + WEEK_SEC * 0.18, 'rgba(239,68,68,0.42)', 1.12);

        const startCandle = candles.find(c => Math.abs(c.time - profitStartSec) <= WEEK_SEC * 2);
        if (startCandle) {
          markers.push({
            time: startCandle.time,
            position: 'aboveBar',
            color: '#22c55e',
            shape: 'arrowUp',
            text: 'Profit START ● 40w',
          });
        }

        const endCandle = candles.find(c => Math.abs(c.time - profitEndSec) <= WEEK_SEC * 2);
        if (endCandle) {
          markers.push({
            time: endCandle.time,
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: 'Profit END ● 80w',
          });
        }

        // DCA marker + trailing dots
        const dcaCandle = candles.find(c => Math.abs(c.time - dcaSec) <= WEEK_SEC * 2);
        if (dcaCandle) {
          markers.push({
            time: dcaCandle.time,
            position: 'belowBar',
            color: '#eab308',
            shape: 'circle',
            text: 'DCA ● 135w',
          });

          const dotOffsets = [12, 24, 36, 48];
          dotOffsets.forEach((wk, idx) => {
            const dotTime = dcaSec + wk * WEEK_SEC;
            const dotCandle = candles.find(c => Math.abs(c.time - dotTime) <= WEEK_SEC * 2);
            if (dotCandle) {
              markers.push({
                time: dotCandle.time,
                position: 'belowBar',
                color: ['#eab308', '#d9f99d', '#bef264', '#84cc16'][idx],
                shape: 'circle',
                text: '',
              });
            }
          });
        }
      }

      if (halvingSeriesRefs.current.length > 0) {
        try {
          chartInstance.current?.priceScale('halving-bg').applyOptions({
            scaleMargins: { top: 0, bottom: 0 },
            visible: false,
          });
        } catch {}
      }
    }

    // ═══════════════════════════════════════════════════
    // INDICATOR TEMPLATES (independent if blocks - stackable)
    // ═══════════════════════════════════════════════════

    if (activeIndicators.includes('bill-williams-3lines')) {
      const jaw = sma(closes, 13);
      const teeth = sma(closes, 8);
      const lips = sma(closes, 5);
      const colors = ['#3b82f6', '#ef4444', '#22c55e'];
      const names = [jaw, teeth, lips];
      names.forEach((data, idx) => {
        const s = chartInstance.current!.addSeries(LineSeries, {
          color: colors[idx], lineWidth: 2, priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        s.setData(candles.map((c, i) => ({ time: c.time as any, value: data[i] })));
        indicatorSeriesRefs.current.push(s);
      });
    }

    if (activeIndicators.includes('displaced-ema')) {
      const emaData = ema(closes, 20);
      const displacement = 5;
      const displaced = candles.slice(0, candles.length - displacement).map((_, i) => ({
        time: candles[i + displacement].time as any,
        value: emaData[i],
      }));
      const s = chartInstance.current!.addSeries(LineSeries, {
        color: '#f97316', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      s.setData(displaced);
      indicatorSeriesRefs.current.push(s);
    }

    if (activeIndicators.includes('ma-exp-ribbon')) {
      const periods = [8, 13, 21, 34, 55, 89];
      const colors = ['#84cc16', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ef4444'];
      periods.forEach((p, idx) => {
        const data = ema(closes, p);
        const s = chartInstance.current!.addSeries(LineSeries, {
          color: colors[idx], lineWidth: 1, priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        s.setData(candles.map((c, i) => ({ time: c.time as any, value: data[i] })));
        indicatorSeriesRefs.current.push(s);
      });
    }

    if (activeIndicators.includes('oscillators')) {
      // Oscillators rendered in separate sub-charts
    }

    if (activeIndicators.includes('swing-trading-ind')) {
      for (let i = 5; i < candles.length - 5; i++) {
        const isHigh = highs.slice(i - 5, i).every(h => h <= highs[i]) && highs.slice(i + 1, i + 6).every(h => h <= highs[i]);
        const isLow = lows.slice(i - 5, i).every(l => l >= lows[i]) && lows.slice(i + 1, i + 6).every(l => l >= lows[i]);
        if (isHigh) markers.push({ time: candles[i].time, position: 'aboveBar', color: '#ef4444', shape: 'circle', text: 'SH' });
        if (isLow) markers.push({ time: candles[i].time, position: 'belowBar', color: '#22c55e', shape: 'circle', text: 'SL' });
      }
    }

    if (activeIndicators.includes('volume-based')) {
      const volMA = sma(volumes, 20);
      const volRatio = volumes.map((v, i) => volMA[i] > 0 ? v / volMA[i] : 1);
      for (let i = 0; i < candles.length; i++) {
        if (volRatio[i] > 2) {
          markers.push({
            time: candles[i].time, position: candles[i].close >= candles[i].open ? 'belowBar' : 'aboveBar',
            color: '#eab308', shape: 'circle', text: `${volRatio[i].toFixed(1)}x`,
          });
        }
      }
    }

    if (activeIndicators.includes('gainzalgo')) {
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      const s1 = chartInstance.current!.addSeries(LineSeries, {
        color: '#06b6d4', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      s1.setData(candles.map((c, i) => ({ time: c.time as any, value: ema12[i] })));
      indicatorSeriesRefs.current.push(s1);
      const s2 = chartInstance.current!.addSeries(LineSeries, {
        color: '#f97316', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      s2.setData(candles.map((c, i) => ({ time: c.time as any, value: ema26[i] })));
      indicatorSeriesRefs.current.push(s2);
    }

    if (activeIndicators.includes('fabio')) {
      // Volume Profile approximation overlay (POC, VAH, VAL)
      const vwapData = vwap(candles);
      const atrData = atr(candles, 14);
      const pocSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#eab308', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false, lineType: LineType.Simple,
      });
      pocSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: vwapData[i] })));
      indicatorSeriesRefs.current.push(pocSeries);
      const vahSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#ef4444', lineWidth: 1, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      vahSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: vwapData[i] + atrData[i] * 0.5 })));
      indicatorSeriesRefs.current.push(vahSeries);
      const valSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#22c55e', lineWidth: 1, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      valSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: vwapData[i] - atrData[i] * 0.5 })));
      indicatorSeriesRefs.current.push(valSeries);
    }

    if (activeIndicators.includes('custom-crt-overlay')) {
      // Native approximation for script: "Custom CRT Overlay Style"
      const nyFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const sessionStartMinute = 5 * 60;
      const sessionEndMinute = sessionStartMinute + 90;
      const sessionBgTop = Math.max(...highs) * 1.05;

      let sessionHigh: number | null = null;
      let sessionLow: number | null = null;
      let wasInSession = false;

      const highLineData: any[] = [];
      const lowLineData: any[] = [];
      const midLineData: any[] = [];
      const bgData: any[] = [];

      for (const candle of candles) {
        const parts = nyFormatter.formatToParts(new Date(candle.time * 1000));
        const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
        const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
        const minuteOfDay = hour * 60 + minute;
        const isInSession = minuteOfDay >= sessionStartMinute && minuteOfDay < sessionEndMinute;

        if (isInSession && !wasInSession) {
          sessionHigh = candle.high;
          sessionLow = candle.low;
        } else if (isInSession && sessionHigh !== null && sessionLow !== null) {
          sessionHigh = Math.max(sessionHigh, candle.high);
          sessionLow = Math.min(sessionLow, candle.low);
        }

        if (isInSession && sessionHigh !== null && sessionLow !== null) {
          const mid = (sessionHigh + sessionLow) / 2;
          highLineData.push({ time: candle.time as any, value: sessionHigh });
          lowLineData.push({ time: candle.time as any, value: sessionLow });
          midLineData.push({ time: candle.time as any, value: mid });
          bgData.push({ time: candle.time as any, value: sessionBgTop, color: 'rgba(59,130,246,0.12)' });
        } else {
          highLineData.push({ time: candle.time as any });
          lowLineData.push({ time: candle.time as any });
          midLineData.push({ time: candle.time as any });
        }

        wasInSession = isInSession;
      }

      const highSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      highSeries.setData(highLineData);

      const lowSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      lowSeries.setData(lowLineData);

      const midSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#e5e7eb',
        lineWidth: 1,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      midSeries.setData(midLineData);

      const bgSeries = chartInstance.current!.addSeries(HistogramSeries, {
        priceScaleId: 'crt-session-bg',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      bgSeries.setData(bgData);

      chartInstance.current?.priceScale('crt-session-bg').applyOptions({
        scaleMargins: { top: 0, bottom: 0 },
        visible: false,
      });

      indicatorSeriesRefs.current.push(highSeries, lowSeries, midSeries, bgSeries);
    }

    if (activeIndicators.includes('box-theory-pro')) {
      // Native approximation for "Box Theory Pro [Interactive Zones]"
      // Uses pivot highs/lows to define a range box with premium/discount zones
      const leftLen = 20;
      const rightLen = 20;
      const zonePct = 0.25;

      // Find pivot highs and lows
      let activeTop: number | null = null;
      let activeBot: number | null = null;
      let activeLeftIdx = 0;

      for (let i = leftLen + rightLen; i < candles.length; i++) {
        // Check pivot high
        const pivotIdx = i - rightLen;
        let isPivotHigh = true;
        let isPivotLow = true;
        for (let j = pivotIdx - leftLen; j < pivotIdx; j++) {
          if (j < 0) { isPivotHigh = false; isPivotLow = false; break; }
          if (highs[j] > highs[pivotIdx]) isPivotHigh = false;
          if (lows[j] < lows[pivotIdx]) isPivotLow = false;
        }
        for (let j = pivotIdx + 1; j <= pivotIdx + rightLen && j < candles.length; j++) {
          if (highs[j] > highs[pivotIdx]) isPivotHigh = false;
          if (lows[j] < lows[pivotIdx]) isPivotLow = false;
        }

        if (isPivotHigh) {
          activeTop = highs[pivotIdx];
          activeLeftIdx = pivotIdx;
        }
        if (isPivotLow) {
          activeBot = lows[pivotIdx];
          if (activeLeftIdx === 0 || pivotIdx < activeLeftIdx) {
            activeLeftIdx = pivotIdx;
          }
        }
      }

      if (activeTop !== null && activeBot !== null && activeTop > activeBot) {
        const rangeHeight = activeTop - activeBot;
        const midPoint = (activeTop + activeBot) / 2;
        const topLimit = activeTop - rangeHeight * zonePct;
        const botLimit = activeBot + rangeHeight * zonePct;

        const startIdx = Math.max(0, activeLeftIdx);
        const boxCandles = candles.slice(startIdx);

        // Premium zone (top → topLimit) - red background
        const premiumBg = chartInstance.current!.addSeries(HistogramSeries, {
          priceScaleId: 'box-premium-bg',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        premiumBg.setData(boxCandles.map(c => ({
          time: c.time as any,
          value: activeTop!,
          color: 'rgba(239, 68, 68, 0.15)',
        })));

        // Discount zone (botLimit → bot) - green background
        const discountBg = chartInstance.current!.addSeries(HistogramSeries, {
          priceScaleId: 'box-discount-bg',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        discountBg.setData(boxCandles.map(c => ({
          time: c.time as any,
          value: botLimit,
          color: 'rgba(34, 197, 94, 0.15)',
        })));

        chartInstance.current?.priceScale('box-premium-bg').applyOptions({
          scaleMargins: { top: 0, bottom: 0 }, visible: false,
        });
        chartInstance.current?.priceScale('box-discount-bg').applyOptions({
          scaleMargins: { top: 0, bottom: 0 }, visible: false,
        });

        // Top line (resistance)
        const topLine = chartInstance.current!.addSeries(LineSeries, {
          color: '#ef4444', lineWidth: 2, priceScaleId: 'right',
          lastValueVisible: true, priceLineVisible: false,
        });
        topLine.setData(boxCandles.map(c => ({ time: c.time as any, value: activeTop! })));

        // Bottom line (support)
        const botLine = chartInstance.current!.addSeries(LineSeries, {
          color: '#22c55e', lineWidth: 2, priceScaleId: 'right',
          lastValueVisible: true, priceLineVisible: false,
        });
        botLine.setData(boxCandles.map(c => ({ time: c.time as any, value: activeBot! })));

        // Midline (EQ)
        const midLine = chartInstance.current!.addSeries(LineSeries, {
          color: '#9ca3af', lineWidth: 1, priceScaleId: 'right',
          lastValueVisible: true, priceLineVisible: false,
          lineType: LineType.Simple,
        });
        midLine.setData(boxCandles.map(c => ({ time: c.time as any, value: midPoint })));

        // Premium zone boundary
        const topLimitLine = chartInstance.current!.addSeries(LineSeries, {
          color: 'rgba(239, 68, 68, 0.5)', lineWidth: 1, priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        topLimitLine.setData(boxCandles.map(c => ({ time: c.time as any, value: topLimit })));

        // Discount zone boundary
        const botLimitLine = chartInstance.current!.addSeries(LineSeries, {
          color: 'rgba(34, 197, 94, 0.5)', lineWidth: 1, priceScaleId: 'right',
          lastValueVisible: false, priceLineVisible: false,
        });
        botLimitLine.setData(boxCandles.map(c => ({ time: c.time as any, value: botLimit })));

        indicatorSeriesRefs.current.push(premiumBg, discountBg, topLine, botLine, midLine, topLimitLine, botLimitLine);

        // Add breakout / zone entry markers
        for (let i = 1; i < boxCandles.length; i++) {
          const c = boxCandles[i];
          const prev = boxCandles[i - 1];
          // Breakout up
          if (c.close > activeTop! && prev.close <= activeTop!) {
            markers.push({ time: c.time, position: 'aboveBar', color: '#22c55e', shape: 'arrowUp', text: 'Breakout ↑' });
          }
          // Breakout down
          if (c.close < activeBot! && prev.close >= activeBot!) {
            markers.push({ time: c.time, position: 'belowBar', color: '#ef4444', shape: 'arrowDown', text: 'Breakout ↓' });
          }
          // In premium zone
          if (c.high > topLimit && c.high < activeTop! && c.close < c.open) {
            markers.push({ time: c.time, position: 'aboveBar', color: '#f97316', shape: 'circle', text: 'Premium' });
          }
          // In discount zone
          if (c.low < botLimit && c.low > activeBot! && c.close > c.open) {
            markers.push({ time: c.time, position: 'belowBar', color: '#06b6d4', shape: 'circle', text: 'Discount' });
          }
        }
      }
    }

    if (activeIndicators.includes('zero-lag-trend')) {
      // Zero Lag Trend Signals (AlgoAlpha) - native implementation
      const length = 70;
      const bandMult = 1.2;
      const lag = Math.floor((length - 1) / 2);

      // Build zero-lag source: src + (src - src[lag])
      const zlSrc = closes.map((c, i) => i >= lag ? c + (c - closes[i - lag]) : c);
      const zlemaData = ema(zlSrc, length);

      // ATR and highest ATR for volatility band
      const atrData = atr(candles, length);
      const volBand: number[] = new Array(candles.length).fill(0);
      for (let i = 0; i < candles.length; i++) {
        let maxAtr = 0;
        for (let j = Math.max(0, i - length * 3 + 1); j <= i; j++) {
          if (atrData[j] > maxAtr) maxAtr = atrData[j];
        }
        volBand[i] = maxAtr * bandMult;
      }

      // Compute trend state
      const trend: number[] = new Array(candles.length).fill(0);
      for (let i = 1; i < candles.length; i++) {
        trend[i] = trend[i - 1];
        if (closes[i] > zlemaData[i] + volBand[i]) trend[i] = 1;
        if (closes[i] < zlemaData[i] - volBand[i]) trend[i] = -1;
      }

      // ZLEMA basis line
      const zlemaSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#3b82f6', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false,
      });
      zlemaSeries.setData(candles.map((c, i) => ({
        time: c.time as any,
        value: zlemaData[i],
        color: trend[i] === 1 ? 'rgba(0,255,187,0.5)' : 'rgba(255,17,0,0.5)',
      })));
      indicatorSeriesRefs.current.push(zlemaSeries);

      // Upper band (bearish trend)
      const upperData = candles.map((c, i) => ({
        time: c.time as any,
        value: trend[i] === -1 ? zlemaData[i] + volBand[i] : zlemaData[i],
      }));
      const upperSeries = chartInstance.current!.addSeries(LineSeries, {
        color: 'rgba(255,17,0,0.3)', lineWidth: 1, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      upperSeries.setData(upperData);
      indicatorSeriesRefs.current.push(upperSeries);

      // Lower band (bullish trend)
      const lowerData = candles.map((c, i) => ({
        time: c.time as any,
        value: trend[i] === 1 ? zlemaData[i] - volBand[i] : zlemaData[i],
      }));
      const lowerSeries = chartInstance.current!.addSeries(LineSeries, {
        color: 'rgba(0,255,187,0.3)', lineWidth: 1, priceScaleId: 'right',
        lastValueVisible: false, priceLineVisible: false,
      });
      lowerSeries.setData(lowerData);
      indicatorSeriesRefs.current.push(lowerSeries);

      // Trend change markers (big arrows)
      for (let i = 1; i < candles.length; i++) {
        if (trend[i] === 1 && trend[i - 1] !== 1) {
          markers.push({
            time: candles[i].time, position: 'belowBar',
            color: '#00ffbb', shape: 'arrowUp', text: '▲ Bullish',
          });
        }
        if (trend[i] === -1 && trend[i - 1] !== -1) {
          markers.push({
            time: candles[i].time, position: 'aboveBar',
            color: '#ff1100', shape: 'arrowDown', text: '▼ Bearish',
          });
        }
        // Entry signals (small arrows)
        if (closes[i] > zlemaData[i] && closes[i - 1] <= zlemaData[i - 1] && trend[i] === 1 && trend[i - 1] === 1) {
          markers.push({
            time: candles[i].time, position: 'belowBar',
            color: '#00ffbb', shape: 'circle', text: 'Entry ▲',
          });
        }
        if (closes[i] < zlemaData[i] && closes[i - 1] >= zlemaData[i - 1] && trend[i] === -1 && trend[i - 1] === -1) {
          markers.push({
            time: candles[i].time, position: 'aboveBar',
            color: '#ff1100', shape: 'circle', text: 'Entry ▼',
          });
        }
      }
    }

    if (activeIndicators.includes('custom-pine') && customPineCode) {
      // Parse and render arbitrary Pine Script
      try {
        const parsed = parsePineScript(customPineCode);
        const computed = computePineData(parsed, candles);

        let renderedPlotCount = 0;

        // Render plot() instructions as line/histogram series
        for (const plot of parsed.plots) {
          if (plot.type === 'line') {
            const varData = computed[plot.dataSource];
            if (varData && varData.length === candles.length) {
              // Check data has meaningful variance (not all zeros or NaN)
              const sample = varData.slice(0, 50);
              const hasData = sample.some(v => v !== 0 && !isNaN(v));
              if (!hasData) continue;

              const s = chartInstance.current!.addSeries(LineSeries, {
                color: plot.color,
                lineWidth: (Math.min(plot.lineWidth, 4) as 1 | 2 | 3 | 4),
                priceScaleId: parsed.isOverlay ? 'right' : 'pine-osc',
                lastValueVisible: true,
                priceLineVisible: false,
              });
              s.setData(candles.map((c, i) => ({ time: c.time as any, value: varData[i] })));
              indicatorSeriesRefs.current.push(s);
              renderedPlotCount++;
            }
          } else if (plot.type === 'histogram') {
            const varData = computed[plot.dataSource];
            if (varData && varData.length === candles.length) {
              const s = chartInstance.current!.addSeries(HistogramSeries, {
                priceScaleId: parsed.isOverlay ? 'pine-hist' : 'pine-osc',
                lastValueVisible: false,
                priceLineVisible: false,
              });
              s.setData(candles.map((c, i) => ({
                time: c.time as any, value: varData[i], color: plot.color,
              })));
              indicatorSeriesRefs.current.push(s);
              renderedPlotCount++;

              if (parsed.isOverlay) {
                chartInstance.current?.priceScale('pine-hist').applyOptions({
                  scaleMargins: { top: 0.85, bottom: 0 }, visible: false,
                });
              }
            }
          } else if (plot.type === 'hline' && plot.hlineValue !== undefined) {
            const s = chartInstance.current!.addSeries(LineSeries, {
              color: plot.color, lineWidth: 1,
              priceScaleId: parsed.isOverlay ? 'right' : 'pine-osc',
              lastValueVisible: false, priceLineVisible: false,
            });
            s.setData(candles.map(c => ({ time: c.time as any, value: plot.hlineValue! })));
            indicatorSeriesRefs.current.push(s);
            renderedPlotCount++;
          } else if (plot.type === 'shape') {
            const condVar = plot.shapeCondition || '';
            const varData = computed[condVar];
            if (varData) {
              for (let i = 0; i < candles.length; i++) {
                if (!isNaN(varData[i]) && varData[i] !== 0) {
                  markers.push({
                    time: candles[i].time,
                    position: plot.shapeLocation === 'abovebar' ? 'aboveBar' : 'belowBar',
                    color: plot.color,
                    shape: plot.shapeType === 'triangledown' || plot.shapeType === 'arrowdown' ? 'arrowDown'
                         : plot.shapeType === 'circle' || plot.shapeType === 'diamond' ? 'circle'
                         : 'arrowUp',
                    text: plot.title,
                  });
                }
              }
              renderedPlotCount++;
            }
          }
        }

        // If no plot() instructions matched, auto-render all computed variables
        if (renderedPlotCount === 0) {
          const autoColors = ['#06b6d4', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#3b82f6', '#ec4899'];
          let colorIdx = 0;
          for (const v of parsed.variables) {
            if (['arithmetic', 'pivothigh', 'pivotlow', 'crossover', 'crossunder', 'change', 'math_abs'].includes(v.func)) continue;
            const d = computed[v.name];
            if (!d || d.length !== candles.length) continue;
            const unique = new Set(d.slice(0, 50).map(val => Math.round(val * 100)));
            if (unique.size <= 1) continue;

            const s = chartInstance.current!.addSeries(LineSeries, {
              color: autoColors[colorIdx % autoColors.length],
              lineWidth: 2,
              priceScaleId: parsed.isOverlay ? 'right' : 'pine-osc',
              lastValueVisible: true,
              priceLineVisible: false,
            });
            s.setData(candles.map((c, i) => ({ time: c.time as any, value: d[i] })));
            indicatorSeriesRefs.current.push(s);
            colorIdx++;
          }
        }

        // Render pivot markers
        for (const v of parsed.variables) {
          if (v.func === 'pivothigh' || v.func === 'pivotlow') {
            const d = computed[v.name];
            if (!d) continue;
            for (let i = 0; i < candles.length; i++) {
              if (!isNaN(d[i])) {
                markers.push({
                  time: candles[i].time,
                  position: v.func === 'pivothigh' ? 'aboveBar' : 'belowBar',
                  color: v.func === 'pivothigh' ? '#ef4444' : '#22c55e',
                  shape: 'circle',
                  text: v.func === 'pivothigh' ? 'PH' : 'PL',
                });
              }
            }
          }
          // Render crossover/crossunder as markers
          if (v.func === 'crossover' || v.func === 'crossunder') {
            const d = computed[v.name];
            if (!d) continue;
            for (let i = 0; i < candles.length; i++) {
              if (d[i] === 1) {
                markers.push({
                  time: candles[i].time,
                  position: v.func === 'crossover' ? 'belowBar' : 'aboveBar',
                  color: v.func === 'crossover' ? '#22c55e' : '#ef4444',
                  shape: v.func === 'crossover' ? 'arrowUp' : 'arrowDown',
                  text: v.func === 'crossover' ? '▲' : '▼',
                });
              }
            }
          }
        }

        if (!parsed.isOverlay) {
          chartInstance.current?.priceScale('pine-osc').applyOptions({
            scaleMargins: { top: 0.7, bottom: 0 },
          });
        }
      } catch (err) {
        console.warn('Pine Script parse error:', err);
      }
    }

    // --- Support & Resistance Zones ---
    if (activeIndicators.includes('support-resistance')) {
      const srPeriod = 20;
      const srLevels: { price: number; type: 'support' | 'resistance'; strength: number }[] = [];
      
      for (let i = srPeriod; i < candles.length - srPeriod; i++) {
        let isPH = true, isPL = true;
        for (let j = i - srPeriod; j <= i + srPeriod; j++) {
          if (j === i) continue;
          if (j < 0 || j >= candles.length) { isPH = false; isPL = false; break; }
          if (highs[j] >= highs[i]) isPH = false;
          if (lows[j] <= lows[i]) isPL = false;
        }
        if (isPH) srLevels.push({ price: highs[i], type: 'resistance', strength: 1 });
        if (isPL) srLevels.push({ price: lows[i], type: 'support', strength: 1 });
      }

      // Cluster nearby levels
      const clustered: typeof srLevels = [];
      const atrVal = atr(candles, 14);
      const threshold = atrVal[atrVal.length - 1] * 0.5;
      for (const level of srLevels) {
        const existing = clustered.find(c => Math.abs(c.price - level.price) < threshold);
        if (existing) {
          existing.strength++;
          existing.price = (existing.price + level.price) / 2;
        } else {
          clustered.push({ ...level });
        }
      }

      // Draw top 6 strongest levels
      clustered.sort((a, b) => b.strength - a.strength);
      const topLevels = clustered.slice(0, 6);
      
      for (const level of topLevels) {
        const color = level.type === 'resistance' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)';
        const s = chartInstance.current!.addSeries(LineSeries, {
          color, lineWidth: 2, priceScaleId: 'right',
          lastValueVisible: true, priceLineVisible: false,
          lineType: LineType.Simple,
        });
        s.setData(candles.map(c => ({ time: c.time as any, value: level.price })));
        indicatorSeriesRefs.current.push(s);

        // Zone band (±0.3 ATR)
        const bandColor = level.type === 'resistance' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)';
        const bandS = chartInstance.current!.addSeries(HistogramSeries, {
          priceScaleId: `sr-band-${level.price.toFixed(0)}`,
          lastValueVisible: false, priceLineVisible: false,
        });
        bandS.setData(candles.map(c => ({
          time: c.time as any,
          value: level.price + (level.type === 'resistance' ? threshold * 0.3 : -threshold * 0.3),
          color: bandColor,
        })));
        chartInstance.current?.priceScale(`sr-band-${level.price.toFixed(0)}`).applyOptions({
          scaleMargins: { top: 0, bottom: 0 }, visible: false,
        });
        indicatorSeriesRefs.current.push(bandS);
      }
    }

    // --- Volume Delta ---
    if (activeIndicators.includes('volume-delta')) {
      const deltaData = candles.map((c, i) => {
        // Estimate buy/sell volume: if close > open, more buy pressure
        const totalVol = c.volume;
        const range = c.high - c.low;
        const bodySize = Math.abs(c.close - c.open);
        const ratio = range > 0 ? bodySize / range : 0.5;
        const buyVol = c.close >= c.open ? totalVol * (0.5 + ratio * 0.5) : totalVol * (0.5 - ratio * 0.5);
        const sellVol = totalVol - buyVol;
        return buyVol - sellVol;
      });

      const deltaSeries = chartInstance.current!.addSeries(HistogramSeries, {
        priceScaleId: 'vol-delta',
        lastValueVisible: true, priceLineVisible: false,
        priceFormat: { type: 'volume' },
      });
      deltaSeries.setData(candles.map((c, i) => ({
        time: c.time as any,
        value: deltaData[i],
        color: deltaData[i] >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
      })));
      chartInstance.current?.priceScale('vol-delta').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      indicatorSeriesRefs.current.push(deltaSeries);

      // Cumulative delta line
      const cumDelta: number[] = [];
      let cum = 0;
      for (const d of deltaData) { cum += d; cumDelta.push(cum); }
      const cdSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#eab308', lineWidth: 2, priceScaleId: 'vol-delta-cum',
        lastValueVisible: true, priceLineVisible: false,
      });
      cdSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: cumDelta[i] })));
      chartInstance.current?.priceScale('vol-delta-cum').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0.05 },
      });
      indicatorSeriesRefs.current.push(cdSeries);
    }

    // --- Trading Sessions ---
    if (activeIndicators.includes('trading-sessions')) {
      const sessions = [
        { name: 'Tokyo', tz: 'Asia/Tokyo', startH: 9, endH: 15, color: 'rgba(239, 68, 68, 0.08)' },
        { name: 'Singapore', tz: 'Asia/Singapore', startH: 9, endH: 17, color: 'rgba(249, 115, 22, 0.06)' },
        { name: 'Hong Kong', tz: 'Asia/Hong_Kong', startH: 9, endH: 16, color: 'rgba(234, 179, 8, 0.06)' },
        { name: 'London', tz: 'Europe/London', startH: 8, endH: 16, color: 'rgba(59, 130, 246, 0.08)' },
        { name: 'New York', tz: 'America/New_York', startH: 9, endH: 16, color: 'rgba(34, 197, 94, 0.08)' },
        { name: 'Sydney', tz: 'Australia/Sydney', startH: 10, endH: 16, color: 'rgba(168, 85, 247, 0.06)' },
      ];

      for (const session of sessions) {
        const bgData: any[] = [];
        const sessionHighs: any[] = [];
        let sessionHigh: number | null = null;
        let sessionLow: number | null = null;
        let prevInSession = false;

        for (const candle of candles) {
          let hour: number;
          try {
            const fmt = new Intl.DateTimeFormat('en-US', { timeZone: session.tz, hour: '2-digit', hour12: false });
            const parts = fmt.formatToParts(new Date(candle.time * 1000));
            hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
          } catch { hour = 0; }

          const isInSession = hour >= session.startH && hour < session.endH;

          if (isInSession && !prevInSession) {
            sessionHigh = candle.high;
            sessionLow = candle.low;
          } else if (isInSession && sessionHigh !== null && sessionLow !== null) {
            sessionHigh = Math.max(sessionHigh, candle.high);
            sessionLow = Math.min(sessionLow, candle.low);
          }

          if (isInSession) {
            bgData.push({ time: candle.time as any, value: Math.max(...highs) * 1.05, color: session.color });
          }

          prevInSession = isInSession;
        }

        if (bgData.length > 0) {
          const scaleId = `session-${session.name}`;
          const bgSeries = chartInstance.current!.addSeries(HistogramSeries, {
            priceScaleId: scaleId, lastValueVisible: false, priceLineVisible: false,
          });
          bgSeries.setData(bgData);
          chartInstance.current?.priceScale(scaleId).applyOptions({
            scaleMargins: { top: 0, bottom: 0 }, visible: false,
          });
          indicatorSeriesRefs.current.push(bgSeries);
        }
      }

      // Overlap: London & New York (13:00-16:00 UTC)
      const overlapLN: any[] = [];
      // Overlap: Tokyo & London (08:00-09:00 UTC roughly)
      const overlapTL: any[] = [];

      for (const candle of candles) {
        const d = new Date(candle.time * 1000);
        const utcH = d.getUTCHours();
        if (utcH >= 13 && utcH < 17) {
          overlapLN.push({ time: candle.time as any, value: Math.max(...highs) * 1.05, color: 'rgba(0, 255, 187, 0.12)' });
        }
        if (utcH >= 7 && utcH < 9) {
          overlapTL.push({ time: candle.time as any, value: Math.max(...highs) * 1.05, color: 'rgba(255, 215, 0, 0.10)' });
        }
      }

      if (overlapLN.length > 0) {
        const s = chartInstance.current!.addSeries(HistogramSeries, {
          priceScaleId: 'overlap-ln', lastValueVisible: false, priceLineVisible: false,
        });
        s.setData(overlapLN);
        chartInstance.current?.priceScale('overlap-ln').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
        indicatorSeriesRefs.current.push(s);
      }
      if (overlapTL.length > 0) {
        const s = chartInstance.current!.addSeries(HistogramSeries, {
          priceScaleId: 'overlap-tl', lastValueVisible: false, priceLineVisible: false,
        });
        s.setData(overlapTL);
        chartInstance.current?.priceScale('overlap-tl').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
        indicatorSeriesRefs.current.push(s);
      }
    }

    // --- Order Flow (Buy vs Sell) ---
    if (activeIndicators.includes('order-flow')) {
      // Estimate buy/sell volume per candle based on price action
      const buyVolumes: number[] = [];
      const sellVolumes: number[] = [];
      
      for (const c of candles) {
        const totalVol = c.volume;
        const range = c.high - c.low;
        const bodySize = Math.abs(c.close - c.open);
        const wickUp = c.high - Math.max(c.open, c.close);
        const wickDown = Math.min(c.open, c.close) - c.low;
        
        // Enhanced estimation using wick analysis
        let buyRatio: number;
        if (range > 0) {
          const bodyRatio = bodySize / range;
          const wickRatio = range > 0 ? wickDown / range : 0;
          if (c.close >= c.open) {
            // Bullish candle: more buy pressure
            buyRatio = 0.5 + bodyRatio * 0.3 + wickRatio * 0.2;
          } else {
            // Bearish candle: more sell pressure
            buyRatio = 0.5 - bodyRatio * 0.3 - (range > 0 ? wickUp / range : 0) * 0.2;
          }
        } else {
          buyRatio = 0.5;
        }
        
        buyRatio = Math.max(0.1, Math.min(0.9, buyRatio));
        buyVolumes.push(totalVol * buyRatio);
        sellVolumes.push(totalVol * (1 - buyRatio));
      }

      // Net flow histogram (buy - sell)
      const netFlow = buyVolumes.map((b, i) => b - sellVolumes[i]);
      const flowSeries = chartInstance.current!.addSeries(HistogramSeries, {
        priceScaleId: 'order-flow',
        lastValueVisible: true, priceLineVisible: false,
        priceFormat: { type: 'volume' },
      });
      flowSeries.setData(candles.map((c, i) => ({
        time: c.time as any,
        value: netFlow[i],
        color: netFlow[i] >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
      })));
      chartInstance.current?.priceScale('order-flow').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      indicatorSeriesRefs.current.push(flowSeries);

      // Cumulative buy/sell ratio line
      let cumBuy = 0, cumSell = 0;
      const ratioData: number[] = [];
      for (let i = 0; i < candles.length; i++) {
        cumBuy += buyVolumes[i];
        cumSell += sellVolumes[i];
        ratioData.push(cumSell > 0 ? cumBuy / cumSell : 1);
      }
      const ratioSeries = chartInstance.current!.addSeries(LineSeries, {
        color: '#eab308', lineWidth: 2, priceScaleId: 'order-flow-ratio',
        lastValueVisible: true, priceLineVisible: false,
      });
      ratioSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: ratioData[i] })));
      chartInstance.current?.priceScale('order-flow-ratio').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0.05 },
      });
      indicatorSeriesRefs.current.push(ratioSeries);

      // Add markers for extreme imbalance
      const window20 = 20;
      for (let i = window20; i < candles.length; i++) {
        let windowBuy = 0, windowSell = 0;
        for (let j = i - window20 + 1; j <= i; j++) {
          windowBuy += buyVolumes[j];
          windowSell += sellVolumes[j];
        }
        const ratio = windowSell > 0 ? windowBuy / windowSell : 1;
        if (ratio > 1.8) {
          markers.push({ time: candles[i].time, position: 'belowBar', color: '#22c55e', shape: 'circle', text: `B:${(ratio).toFixed(1)}x` });
        } else if (ratio < 0.55) {
          markers.push({ time: candles[i].time, position: 'aboveBar', color: '#ef4444', shape: 'circle', text: `S:${(1/ratio).toFixed(1)}x` });
        }
      }
    }

    if (markersRef.current) {
      try { markersRef.current.detach(); } catch {}
      markersRef.current = null;
    }
    if (markers.length > 0) {
      markersRef.current = createSeriesMarkers(mainSeriesRef.current, markers);
    }

    // Only fitContent on initial load, not on zoom/pan
    if (!userInteractingRef.current) {
      // Don't reset zoom when user has been interacting
    }
  }, [candles, strategies, chartType, activeIndicators, customPineCode]);

  // Stochastic sub-chart for oscillators template
  useEffect(() => {
    if (!activeIndicators.includes('oscillators') || !stochRef.current) {
      if (stochChartInstance.current) { stochChartInstance.current.remove(); stochChartInstance.current = null; }
      return;
    }

    const chart = createChart(stochRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'hsl(220, 20%, 4%)' }, textColor: 'hsl(210, 20%, 50%)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
      grid: { vertLines: { color: 'hsl(220, 14%, 10%)' }, horzLines: { color: 'hsl(220, 14%, 10%)' } },
      rightPriceScale: { borderColor: 'hsl(220, 14%, 18%)' },
      timeScale: { borderColor: 'hsl(220, 14%, 18%)', timeVisible: true, visible: false },
      crosshair: { vertLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 }, horzLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 } },
      width: stochRef.current.clientWidth, height: stochRef.current.clientHeight,
    });
    stochChartInstance.current = chart;

    const handleResize = () => { if (stochRef.current) chart.applyOptions({ width: stochRef.current.clientWidth, height: stochRef.current.clientHeight }); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); stochChartInstance.current = null; };
  }, [activeIndicators]);

  // RSI sub-chart for oscillators template
  useEffect(() => {
    if (!activeIndicators.includes('oscillators') || !rsiRef.current) {
      if (rsiChartInstance.current) { rsiChartInstance.current.remove(); rsiChartInstance.current = null; }
      return;
    }

    const chart = createChart(rsiRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'hsl(220, 20%, 4%)' }, textColor: 'hsl(210, 20%, 50%)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
      grid: { vertLines: { color: 'hsl(220, 14%, 10%)' }, horzLines: { color: 'hsl(220, 14%, 10%)' } },
      rightPriceScale: { borderColor: 'hsl(220, 14%, 18%)' },
      timeScale: { borderColor: 'hsl(220, 14%, 18%)', timeVisible: true, visible: true },
      crosshair: { vertLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 }, horzLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 } },
      width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight,
    });
    rsiChartInstance.current = chart;

    const handleResize = () => { if (rsiRef.current) chart.applyOptions({ width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight }); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); rsiChartInstance.current = null; };
  }, [activeIndicators]);

  // Populate oscillator sub-charts data
  useEffect(() => {
    if (!activeIndicators.includes('oscillators') || candles.length === 0) return;

    const oscCloses = candles.map(c => c.close);
    const oscHighs = candles.map(c => c.high);
    const oscLows = candles.map(c => c.low);

    // Stochastic
    if (stochChartInstance.current) {
      const chart = stochChartInstance.current;
      try { (chart as any).__series?.forEach((s: any) => chart.removeSeries(s)); } catch {}

      const kData = stochasticK(oscCloses, oscHighs, oscLows, 14);
      const dData = sma(kData, 3);

      // Zone fill (25-75 purple area)
      const zoneSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false,
      });
      zoneSeries.setData(candles.map((c, i) => ({
        time: c.time as any,
        value: Math.min(Math.max(kData[i], 25), 75) - 25,
        color: 'rgba(139, 92, 246, 0.3)',
      })));

      const kSeries = chart.addSeries(LineSeries, {
        color: '#3b82f6', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false,
      });
      kSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: kData[i] })));

      const dSeries = chart.addSeries(LineSeries, {
        color: '#f97316', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false,
      });
      dSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: dData[i] })));

      (chart as any).__series = [zoneSeries, kSeries, dSeries];
      chart.timeScale().fitContent();
    }

    // RSI
    if (rsiChartInstance.current) {
      const chart = rsiChartInstance.current;
      try { (chart as any).__series?.forEach((s: any) => chart.removeSeries(s)); } catch {}

      const rsiData = rsi(oscCloses, 14);
      const rsiMA = sma(rsiData, 14);

      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#eab308', lineWidth: 2, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false,
      });
      rsiSeries.setData(candles.map((c, i) => ({ time: c.time as any, value: rsiData[i] })));

      const rsiMASeries = chart.addSeries(LineSeries, {
        color: '#a855f7', lineWidth: 1, priceScaleId: 'right',
        lastValueVisible: true, priceLineVisible: false,
      });
      rsiMASeries.setData(candles.map((c, i) => ({ time: c.time as any, value: rsiMA[i] })));

      (chart as any).__series = [rsiSeries, rsiMASeries];
      chart.timeScale().fitContent();
    }
  }, [candles, activeIndicators]);

  // RSI sub-chart for rsi-panel strategy
  useEffect(() => {
    if (!strategies.includes('rsi-panel') || !rsiPanelRef.current) {
      if (rsiPanelChartInstance.current) { rsiPanelChartInstance.current.remove(); rsiPanelChartInstance.current = null; }
      return;
    }
    const chart = createChart(rsiPanelRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'hsl(220, 20%, 4%)' }, textColor: 'hsl(210, 20%, 50%)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
      grid: { vertLines: { color: 'hsl(220, 14%, 10%)' }, horzLines: { color: 'hsl(220, 14%, 10%)' } },
      rightPriceScale: { borderColor: 'hsl(220, 14%, 18%)' },
      timeScale: { borderColor: 'hsl(220, 14%, 18%)', timeVisible: true, visible: true },
      crosshair: { vertLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 }, horzLine: { color: 'hsl(174, 72%, 50%)', width: 1, style: 2 } },
      width: rsiPanelRef.current.clientWidth, height: rsiPanelRef.current.clientHeight,
    });
    rsiPanelChartInstance.current = chart;
    const ro = new ResizeObserver(() => { if (rsiPanelRef.current) chart.applyOptions({ width: rsiPanelRef.current.clientWidth, height: rsiPanelRef.current.clientHeight }); });
    if (rsiPanelRef.current) ro.observe(rsiPanelRef.current);
    return () => { ro.disconnect(); chart.remove(); rsiPanelChartInstance.current = null; };
  }, [strategies]);

  // Populate RSI panel data
  useEffect(() => {
    if (!strategies.includes('rsi-panel') || !rsiPanelChartInstance.current || candles.length === 0) return;
    const chart = rsiPanelChartInstance.current;
    try { (chart as any).__rsiSeries?.forEach((s: any) => chart.removeSeries(s)); } catch {}
    const rsiCloses = candles.map(c => c.close);
    const rsiVals = rsi(rsiCloses, 14);
    const rsiMaVals = sma(rsiVals, 14);

    // OB/OS zone fill
    const zoneSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false,
    });
    zoneSeries.setData(candles.map((c, i) => ({
      time: c.time as any, value: Math.min(Math.max(rsiVals[i], 30), 70) - 30, color: 'rgba(139, 92, 246, 0.2)',
    })));

    const rsiLine = chart.addSeries(LineSeries, {
      color: '#eab308', lineWidth: 2, priceScaleId: 'right', lastValueVisible: true, priceLineVisible: false,
    });
    rsiLine.setData(candles.map((c, i) => ({ time: c.time as any, value: rsiVals[i] })));

    const rsiMaLine = chart.addSeries(LineSeries, {
      color: '#a855f7', lineWidth: 1, priceScaleId: 'right', lastValueVisible: true, priceLineVisible: false,
    });
    rsiMaLine.setData(candles.map((c, i) => ({ time: c.time as any, value: rsiMaVals[i] })));

    const ob = chart.addSeries(LineSeries, { color: 'rgba(239,68,68,0.5)', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    ob.setData(candles.map(c => ({ time: c.time as any, value: 70 })));
    const os = chart.addSeries(LineSeries, { color: 'rgba(34,197,94,0.5)', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
    os.setData(candles.map(c => ({ time: c.time as any, value: 30 })));

    (chart as any).__rsiSeries = [zoneSeries, rsiLine, rsiMaLine, ob, os];
    chart.timeScale().fitContent();
  }, [candles, strategies]);

  const symbol = pair.replace('_idr', '').toUpperCase();

  // Compute last signal for toolbar
  const getLastSignal = () => {
    if (candles.length === 0) return null;
    let allSignals: { type: string; time: number }[] = [];
    for (const strat of strategies) {
      let signals: { type: string; time: number }[] = [];
      switch (strat) {
        case 'gainzalgo': signals = calculateGainzAlgo(candles); break;
        case 'fabio': signals = calculateFabioValentini(candles); break;
        case 'crt': signals = calculateCRTOverlay(candles); break;
        case 'poi': signals = calculatePOIStrategy(candles); break;
        case 'balance': signals = calculateBalanceArea(candles); break;
        case 'multitf': signals = calculateMultiTFSR(candles); break;
        case 'darvas': signals = calculateDarvasBox(candles); break;
      }
      allSignals = allSignals.concat(signals);
    }
    if (allSignals.length === 0) return null;
    allSignals.sort((a, b) => a.time - b.time);
    return allSignals[allSignals.length - 1];
  };

  const lastSignal = getLastSignal();
  const halvingPhase = strategies.includes('halving') ? getCurrentHalvingPhase() : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 border-b border-border overflow-x-auto">
        <span className="font-mono font-bold text-xs sm:text-sm text-foreground mr-1 sm:mr-3 shrink-0">{symbol}/IDR</span>
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-mono rounded transition-colors shrink-0 ${
              timeframe === tf
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tf}
          </button>
        ))}

        {halvingPhase && (
          <div className="ml-auto flex items-center gap-1.5 text-[10px] sm:text-xs font-mono shrink-0" style={{ color: halvingPhase.color }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: halvingPhase.color }} />
            <span className="hidden sm:inline">{halvingPhase.phase} • {halvingPhase.weeksPost}w post-halving</span>
          </div>
        )}

        {lastSignal && (
          <div className={`${halvingPhase ? '' : 'ml-auto'} flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-mono shrink-0 ${lastSignal.type === 'buy' ? 'text-profit' : 'text-loss'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${lastSignal.type === 'buy' ? 'bg-profit' : 'bg-loss'} animate-pulse`} />
            <span className="hidden sm:inline">Last Signal:</span> {lastSignal.type.toUpperCase()}
          </div>
        )}
        {loading && (
          <div className={`${lastSignal || halvingPhase ? '' : 'ml-auto'} flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground shrink-0`}>
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-yellow animate-pulse" />
            <span className="hidden sm:inline">Loading...</span>
          </div>
        )}
      </div>

      {/* Main Chart */}
      <div className="relative" style={{ flex: (strategies.includes('gainzalgo') || activeIndicators.includes('oscillators') || strategies.includes('rsi-panel')) ? '3 1 0' : '1 1 0' }}>
        <div ref={chartRef} className="w-full h-full" />
        {!loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center text-muted-foreground font-mono text-sm">
              <p className="text-lg mb-1">📊</p>
              <p>Data chart tidak tersedia untuk {symbol}/IDR</p>
              <p className="text-xs mt-1">Coba timeframe lain atau koin ini belum memiliki data trading</p>
            </div>
          </div>
        )}
      </div>

      {/* GainzAlgo Oscillator Sub-Panel */}
      {strategies.includes('gainzalgo') && (
        <>
          <div className="px-3 py-1 border-y border-border text-[10px] font-mono text-muted-foreground flex items-center gap-2">
            <span className="text-foreground font-semibold">DLO</span>
            <span>(14, 360, 0.18, 3, 2.5, 7)</span>
            <span className="text-profit">■</span>
            <span className="text-loss">■</span>
          </div>
          <div ref={oscRef} style={{ flex: '1 1 0', minHeight: 80 }} />
        </>
      )}

      {/* RSI Panel Sub-chart */}
      {strategies.includes('rsi-panel') && (
        <>
          <div className="px-3 py-1 border-y border-border text-[10px] font-mono text-muted-foreground flex items-center gap-2">
            <span className="text-foreground font-semibold">RSI</span>
            <span>(14)</span>
            <span className="text-[#eab308]">■ RSI</span>
            <span className="text-[#a855f7]">■ MA(14)</span>
            <span className="ml-auto text-muted-foreground/50">30 — 70</span>
          </div>
          <div ref={rsiPanelRef} style={{ flex: '1 1 0', minHeight: 120 }} />
        </>
      )}

      {/* Oscillator Template Sub-Panels */}
      {activeIndicators.includes('oscillators') && (
        <>
          <div className="px-3 py-1 border-y border-border text-[10px] font-mono text-muted-foreground flex items-center gap-2">
            <span className="text-foreground font-semibold">Stochastic</span>
            <span>(14, 3)</span>
            <span className="text-[#3b82f6]">■ %K</span>
            <span className="text-[#f97316]">■ %D</span>
            <span className="ml-auto text-muted-foreground/50">25 — 75</span>
          </div>
          <div ref={stochRef} style={{ flex: '1 1 0', minHeight: 100 }} />

          <div className="px-3 py-1 border-y border-border text-[10px] font-mono text-muted-foreground flex items-center gap-2">
            <span className="text-foreground font-semibold">RSI</span>
            <span>(14)</span>
            <span className="text-[#eab308]">■ RSI</span>
            <span className="text-[#a855f7]">■ MA</span>
            <span className="ml-auto text-muted-foreground/50">30 — 70</span>
          </div>
          <div ref={rsiRef} style={{ flex: '1 1 0', minHeight: 100 }} />
        </>
      )}
    </div>
  );
}

// Helper EMA
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  const mult = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * mult + result[i - 1];
  }
  return result;
}

// Helper SMA
function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result[i] = data[i]; continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

// Helper RSI
function rsi(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

// Helper Stochastic %K
function stochasticK(closes: number[], highs: number[], lows: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  for (let i = period - 1; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    result[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  return result;
}

// Helper VWAP
function vwap(candles: { close: number; high: number; low: number; volume: number }[]): number[] {
  const result: number[] = [];
  let cumVol = 0, cumPV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumPV += tp * c.volume;
    result.push(cumVol > 0 ? cumPV / cumVol : tp);
  }
  return result;
}

// Helper ATR
function atr(candles: { high: number; low: number; close: number }[], period: number): number[] {
  const result: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const tr = i === 0
      ? candles[i].high - candles[i].low
      : Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        );
    if (i < period) {
      result[i] = tr;
    } else if (i === period) {
      let sum = 0;
      for (let j = 1; j <= period; j++) sum += result[j - 1];
      result[i] = (sum + tr) / period;
    } else {
      result[i] = (result[i - 1] * (period - 1) + tr) / period;
    }
  }
  return result;
}
