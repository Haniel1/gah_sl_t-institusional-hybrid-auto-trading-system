/**
 * Pine Script Parser v2.0
 * Enhanced parser for TradingView Pine Script code.
 * Supports: ta.ema, ta.sma, ta.rsi, ta.stoch, ta.atr, ta.vwap, ta.pivothigh, ta.pivotlow,
 *           ta.highest, ta.lowest, ta.macd, ta.bb, ta.wma, ta.rma, ta.tr, ta.cci, ta.mfi,
 *           ta.crossover, ta.crossunder, ta.change, ta.cum, ta.valuewhen,
 *           math.abs, math.max, math.min, math.sum, math.avg, math.round, math.log,
 *           plot(), plotshape(), plotchar(), bgcolor(), hline(), fill(),
 *           input.int, input.float, input.bool, input.string, input.color, input.timeframe,
 *           Conditional (ternary) expressions, var declarations, basic arithmetic
 */

export interface PinePlotInstruction {
  type: 'line' | 'histogram' | 'hline' | 'shape' | 'bgcolor' | 'columns';
  dataSource: string;
  color: string;
  lineWidth: number;
  title: string;
  overlay: boolean;
  style?: string;
  shapeType?: 'triangleup' | 'triangledown' | 'circle' | 'cross' | 'diamond' | 'arrowup' | 'arrowdown' | 'flag' | 'label_up' | 'label_down';
  shapeLocation?: 'abovebar' | 'belowbar';
  shapeCondition?: string;
  hlineValue?: number;
  bgCondition?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface PineVariable {
  name: string;
  expression: string;
  func: string;
  params: (string | number)[];
  sourceVar?: string;
}

export interface PineParseResult {
  title: string;
  isOverlay: boolean;
  variables: PineVariable[];
  plots: PinePlotInstruction[];
  inputs: Record<string, number | string | boolean>;
  unsupportedFeatures: string[];
}

// Pine Script color name to hex mapping
const PINE_COLORS: Record<string, string> = {
  'color.red': '#ef4444', 'color.green': '#22c55e', 'color.blue': '#3b82f6',
  'color.yellow': '#eab308', 'color.orange': '#f97316', 'color.purple': '#a855f7',
  'color.aqua': '#06b6d4', 'color.lime': '#84cc16', 'color.teal': '#14b8a6',
  'color.white': '#e5e7eb', 'color.gray': '#9ca3af', 'color.silver': '#d1d5db',
  'color.maroon': '#991b1b', 'color.olive': '#854d0e', 'color.navy': '#1e3a5f',
  'color.fuchsia': '#d946ef', 'color.black': '#1f2937',
};

function resolveColor(colorStr: string): string {
  if (!colorStr) return '#3b82f6';
  const cleaned = colorStr.trim();

  // color.new(color.xxx, transparency)
  const newMatch = cleaned.match(/color\.new\((.+?),\s*(\d+)\)/);
  if (newMatch) return resolveColor(newMatch[1].trim());

  // color.rgb(r, g, b) or color.rgb(r, g, b, a)
  const rgbMatch = cleaned.match(/color\.rgb\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)/);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    if (a) return `rgba(${r},${g},${b},${(100 - parseInt(a)) / 100})`;
    return `rgb(${r},${g},${b})`;
  }

  if (cleaned.startsWith('#')) return cleaned;
  if (PINE_COLORS[cleaned]) return PINE_COLORS[cleaned];
  const withPrefix = `color.${cleaned}`;
  if (PINE_COLORS[withPrefix]) return PINE_COLORS[withPrefix];
  return '#3b82f6';
}

function extractInputDefaults(code: string): Record<string, number | string | boolean> {
  const inputs: Record<string, number | string | boolean> = {};

  // input.int(default, ...) or input.int(defval=default, ...)
  for (const m of code.matchAll(/(\w+)\s*=\s*input\.int\((?:defval\s*=\s*)?(\d+)/g))
    inputs[m[1]] = parseInt(m[2]);

  // input.float(default, ...)
  for (const m of code.matchAll(/(\w+)\s*=\s*input\.float\((?:defval\s*=\s*)?([\d.]+)/g))
    inputs[m[1]] = parseFloat(m[2]);

  // input.bool(true/false, ...)
  for (const m of code.matchAll(/(\w+)\s*=\s*input\.bool\((?:defval\s*=\s*)?(true|false)/g))
    inputs[m[1]] = m[2] === 'true';

  // input(defval=value, ...) or input(value, ...)
  for (const m of code.matchAll(/(\w+)\s*=\s*input\((?:defval\s*=\s*)?(true|false)/g))
    inputs[m[1]] = m[2] === 'true';
  for (const m of code.matchAll(/(\w+)\s*=\s*input\((?:defval\s*=\s*)?(\d+(?:\.\d+)?)\s*[,)]/g))
    if (inputs[m[1]] === undefined) inputs[m[1]] = parseFloat(m[2]);

  // var x = input(true/false, ...) or var x = input(number, ...)
  for (const m of code.matchAll(/var\s+(\w+)\s*=\s*input\((true|false)/g))
    inputs[m[1]] = m[2] === 'true';
  for (const m of code.matchAll(/var\s+(\w+)\s*=\s*input\((\d+(?:\.\d+)?)\s*[,)]/g))
    if (inputs[m[1]] === undefined) inputs[m[1]] = parseFloat(m[2]);

  // input.timeframe("D", ...) — store as string
  for (const m of code.matchAll(/(\w+)\s*=\s*input\.timeframe\(["']([^"']+)["']/g))
    inputs[m[1]] = m[2];

  return inputs;
}

function detectUnsupportedFeatures(code: string): string[] {
  const unsupported: string[] = [];
  if (code.includes('request.security')) unsupported.push('request.security (multi-timeframe)');
  if (code.includes('box.new')) unsupported.push('box.new (drawing boxes)');
  if (code.includes('line.new')) unsupported.push('line.new (drawing lines)');
  if (code.includes('label.new')) unsupported.push('label.new (drawing labels)');
  if (/\w+\s*\([^)]*\)\s*=>/.test(code)) unsupported.push('custom functions');
  if (code.includes('strategy.')) unsupported.push('strategy.* (backtesting)');
  if (code.includes('table.new')) unsupported.push('table.new (tables)');
  if (code.includes('array.')) unsupported.push('array.* (arrays)');
  if (code.includes('matrix.')) unsupported.push('matrix.* (matrices)');
  if (code.includes('request.earnings')) unsupported.push('request.earnings');
  if (code.includes('request.dividends')) unsupported.push('request.dividends');
  return unsupported;
}

function extractVariables(code: string, inputs: Record<string, number | string | boolean>): PineVariable[] {
  const vars: PineVariable[] = [];
  const lines = code.split('\n');

  const resolveParam = (p: string): string | number => {
    const trimmed = p.trim();
    if (!isNaN(Number(trimmed))) return Number(trimmed);
    if (inputs[trimmed] !== undefined) return Number(inputs[trimmed]) || trimmed;
    return trimmed;
  };

  // Patterns to match ta.* function calls
  const taPatterns: { regex: RegExp; func: string; sourceIdx: number; paramIdx: number }[] = [
    { regex: /(\w+)\s*=\s*ta\.ema\((\w+),\s*(.+?)\)/, func: 'ema', sourceIdx: 2, paramIdx: 3 },
    { regex: /(\w+)\s*=\s*ta\.sma\((\w+),\s*(.+?)\)/, func: 'sma', sourceIdx: 2, paramIdx: 3 },
    { regex: /(\w+)\s*=\s*ta\.wma\((\w+),\s*(.+?)\)/, func: 'wma', sourceIdx: 2, paramIdx: 3 },
    { regex: /(\w+)\s*=\s*ta\.rma\((\w+),\s*(.+?)\)/, func: 'rma', sourceIdx: 2, paramIdx: 3 },
    { regex: /(\w+)\s*=\s*ta\.rsi\((\w+),\s*(.+?)\)/, func: 'rsi', sourceIdx: 2, paramIdx: 3 },
    { regex: /(\w+)\s*=\s*ta\.cci\((\w+),\s*(.+?)\)/, func: 'cci', sourceIdx: 2, paramIdx: 3 },
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed === '') continue;
    // Skip drawing/unsupported lines
    if (/^(box|line|label|table|strategy|alert|if |else|for |while |var\s+box|var\s+line|var\s+label)/.test(trimmed)) continue;

    // Match standard ta.func(source, length) patterns
    let matched = false;
    for (const pat of taPatterns) {
      const m = trimmed.match(pat.regex);
      if (m) {
        vars.push({
          name: m[1], expression: trimmed, func: pat.func,
          params: [resolveParam(m[pat.sourceIdx]), resolveParam(m[pat.paramIdx])],
          sourceVar: m[pat.sourceIdx],
        });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // ta.stoch(close, high, low, length)
    const stochMatch = trimmed.match(/(\w+)\s*=\s*ta\.stoch\((\w+),\s*(\w+),\s*(\w+),\s*(.+?)\)/);
    if (stochMatch) {
      vars.push({ name: stochMatch[1], expression: trimmed, func: 'stoch',
        params: [resolveParam(stochMatch[5])], sourceVar: 'close' });
      continue;
    }

    // ta.atr(length)
    const atrMatch = trimmed.match(/(\w+)\s*=\s*ta\.atr\((.+?)\)/);
    if (atrMatch) {
      vars.push({ name: atrMatch[1], expression: trimmed, func: 'atr',
        params: [resolveParam(atrMatch[2])], sourceVar: 'close' });
      continue;
    }

    // ta.tr or ta.tr(true)
    const trMatch = trimmed.match(/(\w+)\s*=\s*ta\.tr(?:\(.*?\))?/);
    if (trMatch && !trimmed.includes('ta.tr(') || (trMatch && trimmed.includes('ta.tr'))) {
      if (trMatch && trimmed.match(/(\w+)\s*=\s*ta\.tr(?:\(.*?\))?$/)) {
        vars.push({ name: trMatch[1], expression: trimmed, func: 'tr', params: [], sourceVar: 'close' });
        continue;
      }
    }

    // ta.vwap(source)
    const vwapMatch = trimmed.match(/(\w+)\s*=\s*ta\.vwap\((.+?)\)/);
    if (vwapMatch) {
      vars.push({ name: vwapMatch[1], expression: trimmed, func: 'vwap', params: [], sourceVar: 'close' });
      continue;
    }

    // ta.pivothigh / ta.pivotlow
    const phMatch = trimmed.match(/(\w+)\s*=\s*ta\.pivothigh\((.+?)\)/);
    if (phMatch) {
      vars.push({ name: phMatch[1], expression: trimmed, func: 'pivothigh',
        params: phMatch[2].split(',').map(s => resolveParam(s)), sourceVar: 'high' });
      continue;
    }
    const plMatch = trimmed.match(/(\w+)\s*=\s*ta\.pivotlow\((.+?)\)/);
    if (plMatch) {
      vars.push({ name: plMatch[1], expression: trimmed, func: 'pivotlow',
        params: plMatch[2].split(',').map(s => resolveParam(s)), sourceVar: 'low' });
      continue;
    }

    // ta.highest / ta.lowest
    const highestMatch = trimmed.match(/(\w+)\s*=\s*ta\.highest\((\w+),\s*(.+?)\)/);
    if (highestMatch) {
      vars.push({ name: highestMatch[1], expression: trimmed, func: 'highest',
        params: [resolveParam(highestMatch[2]), resolveParam(highestMatch[3])], sourceVar: highestMatch[2] });
      continue;
    }
    const lowestMatch = trimmed.match(/(\w+)\s*=\s*ta\.lowest\((\w+),\s*(.+?)\)/);
    if (lowestMatch) {
      vars.push({ name: lowestMatch[1], expression: trimmed, func: 'lowest',
        params: [resolveParam(lowestMatch[2]), resolveParam(lowestMatch[3])], sourceVar: lowestMatch[2] });
      continue;
    }

    // ta.macd(source, fast, slow, signal) → returns [macdLine, signalLine, histogram]
    const macdMatch = trimmed.match(/\[(\w+),\s*(\w+),\s*(\w+)\]\s*=\s*ta\.macd\((\w+),\s*(.+?),\s*(.+?),\s*(.+?)\)/);
    if (macdMatch) {
      vars.push({ name: macdMatch[1], expression: trimmed, func: 'macd_line',
        params: [resolveParam(macdMatch[4]), resolveParam(macdMatch[5]), resolveParam(macdMatch[6]), resolveParam(macdMatch[7])],
        sourceVar: macdMatch[4] });
      vars.push({ name: macdMatch[2], expression: trimmed, func: 'macd_signal',
        params: [resolveParam(macdMatch[4]), resolveParam(macdMatch[5]), resolveParam(macdMatch[6]), resolveParam(macdMatch[7])],
        sourceVar: macdMatch[4] });
      vars.push({ name: macdMatch[3], expression: trimmed, func: 'macd_hist',
        params: [resolveParam(macdMatch[4]), resolveParam(macdMatch[5]), resolveParam(macdMatch[6]), resolveParam(macdMatch[7])],
        sourceVar: macdMatch[4] });
      continue;
    }

    // ta.bb(source, length, mult) → returns [middle, upper, lower]
    const bbMatch = trimmed.match(/\[(\w+),\s*(\w+),\s*(\w+)\]\s*=\s*ta\.bb\((\w+),\s*(.+?),\s*(.+?)\)/);
    if (bbMatch) {
      vars.push({ name: bbMatch[1], expression: trimmed, func: 'bb_middle',
        params: [resolveParam(bbMatch[4]), resolveParam(bbMatch[5]), resolveParam(bbMatch[6])],
        sourceVar: bbMatch[4] });
      vars.push({ name: bbMatch[2], expression: trimmed, func: 'bb_upper',
        params: [resolveParam(bbMatch[4]), resolveParam(bbMatch[5]), resolveParam(bbMatch[6])],
        sourceVar: bbMatch[4] });
      vars.push({ name: bbMatch[3], expression: trimmed, func: 'bb_lower',
        params: [resolveParam(bbMatch[4]), resolveParam(bbMatch[5]), resolveParam(bbMatch[6])],
        sourceVar: bbMatch[4] });
      continue;
    }

    // ta.crossover(a, b) / ta.crossunder(a, b) — store as boolean signal
    const crossOverMatch = trimmed.match(/(\w+)\s*=\s*ta\.crossover\((\w+),\s*(\w+)\)/);
    if (crossOverMatch) {
      vars.push({ name: crossOverMatch[1], expression: trimmed, func: 'crossover',
        params: [crossOverMatch[2], crossOverMatch[3]], sourceVar: 'close' });
      continue;
    }
    const crossUnderMatch = trimmed.match(/(\w+)\s*=\s*ta\.crossunder\((\w+),\s*(\w+)\)/);
    if (crossUnderMatch) {
      vars.push({ name: crossUnderMatch[1], expression: trimmed, func: 'crossunder',
        params: [crossUnderMatch[2], crossUnderMatch[3]], sourceVar: 'close' });
      continue;
    }

    // ta.change(source) or ta.change(source, length)
    const changeMatch = trimmed.match(/(\w+)\s*=\s*ta\.change\((\w+)(?:,\s*(.+?))?\)/);
    if (changeMatch) {
      vars.push({ name: changeMatch[1], expression: trimmed, func: 'change',
        params: [changeMatch[2], changeMatch[3] ? resolveParam(changeMatch[3]) : 1],
        sourceVar: changeMatch[2] });
      continue;
    }

    // math.sum(source, length)
    const sumMatch = trimmed.match(/(\w+)\s*=\s*math\.sum\((\w+),\s*(.+?)\)/);
    if (sumMatch) {
      vars.push({ name: sumMatch[1], expression: trimmed, func: 'math_sum',
        params: [resolveParam(sumMatch[2]), resolveParam(sumMatch[3])], sourceVar: sumMatch[2] });
      continue;
    }

    // math.abs(expr) - simple case
    const absMatch = trimmed.match(/(\w+)\s*=\s*math\.abs\((.+?)\)$/);
    if (absMatch) {
      vars.push({ name: absMatch[1], expression: trimmed, func: 'math_abs',
        params: [absMatch[2].trim()], sourceVar: 'close' });
      continue;
    }

    // Simple arithmetic: var = expr1 op expr2
    const arithMatch = trimmed.match(/^(?:var\s+(?:float|int)\s+)?(\w+)\s*:?=\s*(.+)$/);
    if (arithMatch && !trimmed.includes('ta.') && !trimmed.includes('input.') && !trimmed.includes('math.')
        && !trimmed.includes('plot') && !trimmed.includes('color.') && !trimmed.includes('str.')
        && !trimmed.includes('request.') && !trimmed.includes('//')) {
      const name = arithMatch[1];
      const expr = arithMatch[2].trim();
      // Check if expression references known variables or price data
      const knownNames = [...vars.map(v => v.name), 'close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4'];
      const tokens = expr.match(/\b\w+\b/g) || [];
      const hasKnownRef = tokens.some(t => knownNames.includes(t) || inputs[t] !== undefined);
      if (hasKnownRef && !['na', 'true', 'false', 'if', 'else', 'and', 'or', 'not'].includes(name)) {
        vars.push({ name, expression: trimmed, func: 'arithmetic', params: [], sourceVar: 'close' });
      }
    }
  }

  return vars;
}

function extractPlots(code: string): PinePlotInstruction[] {
  const plots: PinePlotInstruction[] = [];
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;

    // plot(data, ...) — parse all named/positional args
    const plotMatch = trimmed.match(/^plot\((.+)\)\s*$/);
    if (plotMatch) {
      const args = splitArgs(plotMatch[1]);
      const dataSource = args[0]?.trim();
      if (!dataSource) continue;

      const namedArgs = parseNamedArgs(args.slice(1));
      const title = namedArgs['title'] || (args[1]?.startsWith('"') ? args[1].replace(/"/g, '') : dataSource);
      const colorMatch = namedArgs['color'];
      const color = colorMatch ? resolveColor(colorMatch) : '#3b82f6';
      const lwStr = namedArgs['linewidth'];
      const lineWidth = lwStr ? parseInt(lwStr) : 2;
      const styleStr = namedArgs['style'] || '';
      const isHist = styleStr.includes('histogram') || styleStr.includes('columns');
      const isDashed = styleStr.includes('dashed');
      const isDotted = styleStr.includes('dotted') || styleStr.includes('circles') || styleStr.includes('cross');

      plots.push({
        type: isHist ? 'histogram' : 'line',
        dataSource, color, lineWidth, title,
        overlay: true,
        style: styleStr,
        lineStyle: isDashed ? 'dashed' : isDotted ? 'dotted' : 'solid',
      });
      continue;
    }

    // plotshape(condition, ...)
    const shapeMatch = trimmed.match(/^plotshape\((.+)\)\s*$/);
    if (shapeMatch) {
      const args = splitArgs(shapeMatch[1]);
      const condition = args[0]?.trim();
      const namedArgs = parseNamedArgs(args.slice(1));
      const title = namedArgs['title'] || (args[1]?.startsWith('"') ? args[1].replace(/"/g, '') : condition);
      const colorStr = namedArgs['color'] || '';
      const color = resolveColor(colorStr);
      const locStr = namedArgs['location'] || args.find(a => a.includes('location.')) || '';
      const shapeStr = namedArgs['style'] || namedArgs['shape'] || args.find(a => a.includes('shape.')) || '';

      let shapeType: PinePlotInstruction['shapeType'] = 'triangleup';
      if (shapeStr.includes('triangledown')) shapeType = 'triangledown';
      else if (shapeStr.includes('circle')) shapeType = 'circle';
      else if (shapeStr.includes('cross')) shapeType = 'cross';
      else if (shapeStr.includes('diamond')) shapeType = 'diamond';
      else if (shapeStr.includes('arrowdown')) shapeType = 'arrowdown';
      else if (shapeStr.includes('arrowup')) shapeType = 'arrowup';
      else if (shapeStr.includes('flag')) shapeType = 'flag';
      else if (shapeStr.includes('label_down')) shapeType = 'label_down';
      else if (shapeStr.includes('label_up')) shapeType = 'label_up';

      plots.push({
        type: 'shape', dataSource: condition, color, lineWidth: 1,
        title, overlay: true,
        shapeType,
        shapeLocation: locStr.includes('abovebar') ? 'abovebar' : 'belowbar',
        shapeCondition: condition,
      });
      continue;
    }

    // plotchar(condition, ...) — treat like plotshape
    const charMatch = trimmed.match(/^plotchar\((.+)\)\s*$/);
    if (charMatch) {
      const args = splitArgs(charMatch[1]);
      const condition = args[0]?.trim();
      const namedArgs = parseNamedArgs(args.slice(1));
      const color = resolveColor(namedArgs['color'] || '');
      const locStr = namedArgs['location'] || '';

      plots.push({
        type: 'shape', dataSource: condition, color, lineWidth: 1,
        title: namedArgs['title'] || condition, overlay: true,
        shapeType: 'circle',
        shapeLocation: locStr.includes('abovebar') ? 'abovebar' : 'belowbar',
        shapeCondition: condition,
      });
      continue;
    }

    // hline(value, ...)
    const hlineMatch = trimmed.match(/^hline\((\d+(?:\.\d+)?)/);
    if (hlineMatch) {
      const namedArgs = parseNamedArgs(splitArgs(trimmed.match(/^hline\((.+)\)/)![1]).slice(1));
      const color = resolveColor(namedArgs['color'] || '');

      plots.push({
        type: 'hline', dataSource: '', color: color || '#9ca3af', lineWidth: 1,
        title: `hline ${hlineMatch[1]}`, overlay: true,
        hlineValue: parseFloat(hlineMatch[1]),
      });
      continue;
    }

    // bgcolor(...)
    const bgMatch = trimmed.match(/^bgcolor\((.+)\)\s*$/);
    if (bgMatch) {
      const expr = bgMatch[1];
      const colorMatch = expr.match(/color\.[^,)]+/);
      const color = colorMatch ? resolveColor(colorMatch[0]) : 'rgba(59,130,246,0.1)';
      plots.push({
        type: 'bgcolor', dataSource: '', color, lineWidth: 1,
        title: 'background', overlay: true, bgCondition: expr,
      });
    }
  }

  return plots;
}

/** Split arguments respecting parentheses and string literals */
function splitArgs(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let inStr = false;
  let strChar = '';
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      current += ch;
      if (ch === strChar) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strChar = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/** Parse key=value pairs from argument list */
function parseNamedArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx > 0) {
      const key = arg.substring(0, eqIdx).trim();
      const val = arg.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = val;
    }
  }
  return result;
}

export function parsePineScript(code: string): PineParseResult {
  let title = 'Custom Indicator';
  let isOverlay = true;

  const indicatorMatch = code.match(/indicator\(\s*(?:title\s*=\s*)?["']([^"']+)["'][^)]*\)/);
  if (indicatorMatch) {
    title = indicatorMatch[1];
    const fullDecl = indicatorMatch[0];
    if (fullDecl.includes('overlay=false') || fullDecl.includes('overlay = false')) {
      isOverlay = false;
    }
  }

  // Also check for strategy()
  const strategyMatch = code.match(/strategy\(\s*(?:title\s*=\s*)?["']([^"']+)["'][^)]*\)/);
  if (strategyMatch) {
    title = strategyMatch[1];
    isOverlay = true;
  }

  const inputs = extractInputDefaults(code);
  const variables = extractVariables(code, inputs);
  const plots = extractPlots(code);
  const unsupportedFeatures = detectUnsupportedFeatures(code);

  return { title, isOverlay, variables, plots, inputs, unsupportedFeatures };
}

/* ─────────────────────────────────────────────────── */
/*  Data Computation Engine                            */
/* ─────────────────────────────────────────────────── */

export interface CandleInput {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function computeEma(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  const mult = 2 / (period + 1);
  r[0] = data[0];
  for (let i = 1; i < data.length; i++) r[i] = (data[i] - r[i - 1]) * mult + r[i - 1];
  return r;
}

function computeSma(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r[i] = data[i]; continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    r[i] = sum / period;
  }
  return r;
}

function computeWma(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r[i] = data[i]; continue; }
    let sum = 0, wSum = 0;
    for (let j = 0; j < period; j++) { const w = period - j; sum += data[i - j] * w; wSum += w; }
    r[i] = sum / wSum;
  }
  return r;
}

function computeRma(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  r[0] = data[0];
  const alpha = 1 / period;
  for (let i = 1; i < data.length; i++) r[i] = alpha * data[i] + (1 - alpha) * r[i - 1];
  return r;
}

function computeRsi(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    r[i] = 100 - 100 / (1 + rs);
  }
  return r;
}

function computeStoch(closes: number[], highs: number[], lows: number[], period: number): number[] {
  const r: number[] = new Array(closes.length).fill(50);
  for (let i = period - 1; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) { if (highs[j] > hh) hh = highs[j]; if (lows[j] < ll) ll = lows[j]; }
    r[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  return r;
}

function computeAtr(candles: CandleInput[], period: number): number[] {
  const r: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const tr = i === 0 ? candles[i].high - candles[i].low
      : Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    if (i < period) r[i] = tr;
    else if (i === period) { let sum = 0; for (let j = 0; j < period; j++) sum += r[j]; r[i] = (sum + tr) / (period + 1); }
    else r[i] = (r[i - 1] * (period - 1) + tr) / period;
  }
  return r;
}

function computeTr(candles: CandleInput[]): number[] {
  return candles.map((c, i) => i === 0 ? c.high - c.low
    : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
}

function computeVwap(candles: CandleInput[]): number[] {
  const r: number[] = [];
  let cumVol = 0, cumPV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume; cumPV += tp * c.volume;
    r.push(cumVol > 0 ? cumPV / cumVol : tp);
  }
  return r;
}

function computeHighest(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let max = -Infinity;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) if (data[j] > max) max = data[j];
    r[i] = max;
  }
  return r;
}

function computeLowest(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let min = Infinity;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) if (data[j] < min) min = data[j];
    r[i] = min;
  }
  return r;
}

function computeCci(data: number[], period: number): number[] {
  const r: number[] = new Array(data.length).fill(0);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    const mean = sum / period;
    let devSum = 0;
    for (let j = i - period + 1; j <= i; j++) devSum += Math.abs(data[j] - mean);
    const meanDev = devSum / period;
    r[i] = meanDev === 0 ? 0 : (data[i] - mean) / (0.015 * meanDev);
  }
  return r;
}

export interface ComputedData {
  [varName: string]: number[];
}

export function computePineData(parsed: PineParseResult, candles: CandleInput[]): ComputedData {
  const len = candles.length;
  const data: ComputedData = {
    close: candles.map(c => c.close),
    open: candles.map(c => c.open),
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    volume: candles.map(c => c.volume),
    hl2: candles.map(c => (c.high + c.low) / 2),
    hlc3: candles.map(c => (c.high + c.low + c.close) / 3),
    ohlc4: candles.map(c => (c.open + c.high + c.low + c.close) / 4),
  };

  const getSource = (name: string): number[] => data[name] || data.close;

  for (const v of parsed.variables) {
    try {
      const source = getSource(v.sourceVar || 'close');
      const lastParam = v.params[v.params.length - 1];
      const period = typeof lastParam === 'number' ? lastParam
        : (typeof lastParam === 'string' ? (parseInt(String(parsed.inputs[lastParam] ?? lastParam)) || 14) : 14);

      switch (v.func) {
        case 'ema': data[v.name] = computeEma(getSource(String(v.params[0])), period); break;
        case 'sma': data[v.name] = computeSma(getSource(String(v.params[0])), period); break;
        case 'wma': data[v.name] = computeWma(getSource(String(v.params[0])), period); break;
        case 'rma': data[v.name] = computeRma(getSource(String(v.params[0])), period); break;
        case 'rsi': data[v.name] = computeRsi(getSource(String(v.params[0])), period); break;
        case 'cci': data[v.name] = computeCci(getSource(String(v.params[0])), period); break;
        case 'stoch': data[v.name] = computeStoch(data.close, data.high, data.low, period); break;
        case 'atr': data[v.name] = computeAtr(candles, period); break;
        case 'tr': data[v.name] = computeTr(candles); break;
        case 'vwap': data[v.name] = computeVwap(candles); break;
        case 'highest': data[v.name] = computeHighest(getSource(String(v.params[0])), period); break;
        case 'lowest': data[v.name] = computeLowest(getSource(String(v.params[0])), period); break;

        case 'macd_line': {
          const src = getSource(String(v.params[0]));
          const fast = typeof v.params[1] === 'number' ? v.params[1] : 12;
          const slow = typeof v.params[2] === 'number' ? v.params[2] : 26;
          const emaFast = computeEma(src, fast);
          const emaSlow = computeEma(src, slow);
          data[v.name] = emaFast.map((val, i) => val - emaSlow[i]);
          break;
        }
        case 'macd_signal': {
          const src = getSource(String(v.params[0]));
          const fast = typeof v.params[1] === 'number' ? v.params[1] : 12;
          const slow = typeof v.params[2] === 'number' ? v.params[2] : 26;
          const sigLen = typeof v.params[3] === 'number' ? v.params[3] : 9;
          const emaFast = computeEma(src, fast);
          const emaSlow = computeEma(src, slow);
          const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
          data[v.name] = computeEma(macdLine, sigLen);
          break;
        }
        case 'macd_hist': {
          const src = getSource(String(v.params[0]));
          const fast = typeof v.params[1] === 'number' ? v.params[1] : 12;
          const slow = typeof v.params[2] === 'number' ? v.params[2] : 26;
          const sigLen = typeof v.params[3] === 'number' ? v.params[3] : 9;
          const emaFast = computeEma(src, fast);
          const emaSlow = computeEma(src, slow);
          const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
          const signal = computeEma(macdLine, sigLen);
          data[v.name] = macdLine.map((val, i) => val - signal[i]);
          break;
        }

        case 'bb_middle': {
          const src = getSource(String(v.params[0]));
          const bbLen = typeof v.params[1] === 'number' ? v.params[1] : 20;
          data[v.name] = computeSma(src, bbLen);
          break;
        }
        case 'bb_upper':
        case 'bb_lower': {
          const src = getSource(String(v.params[0]));
          const bbLen = typeof v.params[1] === 'number' ? v.params[1] : 20;
          const mult = typeof v.params[2] === 'number' ? v.params[2] : 2;
          const middle = computeSma(src, bbLen);
          const stdev: number[] = new Array(len).fill(0);
          for (let i = bbLen - 1; i < len; i++) {
            let sum = 0;
            for (let j = i - bbLen + 1; j <= i; j++) sum += (src[j] - middle[i]) ** 2;
            stdev[i] = Math.sqrt(sum / bbLen);
          }
          data[v.name] = v.func === 'bb_upper'
            ? middle.map((m, i) => m + mult * stdev[i])
            : middle.map((m, i) => m - mult * stdev[i]);
          break;
        }

        case 'crossover': {
          const a = getSource(String(v.params[0]));
          const b = getSource(String(v.params[1]));
          data[v.name] = a.map((val, i) => i > 0 && a[i - 1] <= b[i - 1] && val > b[i] ? 1 : 0);
          break;
        }
        case 'crossunder': {
          const a = getSource(String(v.params[0]));
          const b = getSource(String(v.params[1]));
          data[v.name] = a.map((val, i) => i > 0 && a[i - 1] >= b[i - 1] && val < b[i] ? 1 : 0);
          break;
        }

        case 'change': {
          const src = getSource(String(v.params[0]));
          const lookback = typeof v.params[1] === 'number' ? v.params[1] : 1;
          data[v.name] = src.map((val, i) => i >= lookback ? val - src[i - lookback] : 0);
          break;
        }

        case 'math_sum': {
          const src = getSource(String(v.params[0]));
          const sumLen = typeof v.params[1] === 'number' ? v.params[1] : 14;
          data[v.name] = new Array(len).fill(0);
          for (let i = 0; i < len; i++) {
            let sum = 0;
            for (let j = Math.max(0, i - sumLen + 1); j <= i; j++) sum += src[j];
            data[v.name][i] = sum;
          }
          break;
        }

        case 'math_abs': {
          const refName = String(v.params[0]);
          const src = getSource(refName);
          data[v.name] = src.map(val => Math.abs(val));
          break;
        }

        case 'pivothigh': {
          data[v.name] = new Array(len).fill(NaN);
          const left = typeof v.params[0] === 'number' ? v.params[0] : 5;
          const right = typeof v.params[1] === 'number' ? v.params[1] : (typeof v.params[0] === 'number' ? v.params[0] : 5);
          for (let i = Number(left); i < len - Number(right); i++) {
            let isPivot = true;
            for (let j = i - Number(left); j < i; j++) if (data.high[j] > data.high[i]) isPivot = false;
            for (let j = i + 1; j <= i + Number(right); j++) if (j < len && data.high[j] > data.high[i]) isPivot = false;
            if (isPivot) data[v.name][i] = data.high[i];
          }
          break;
        }
        case 'pivotlow': {
          data[v.name] = new Array(len).fill(NaN);
          const left = typeof v.params[0] === 'number' ? v.params[0] : 5;
          const right = typeof v.params[1] === 'number' ? v.params[1] : (typeof v.params[0] === 'number' ? v.params[0] : 5);
          for (let i = Number(left); i < len - Number(right); i++) {
            let isPivot = true;
            for (let j = i - Number(left); j < i; j++) if (data.low[j] < data.low[i]) isPivot = false;
            for (let j = i + 1; j <= i + Number(right); j++) if (j < len && data.low[j] < data.low[i]) isPivot = false;
            if (isPivot) data[v.name][i] = data.low[i];
          }
          break;
        }

        case 'arithmetic': {
          const expr = v.expression;
          // Try simple binary: a op b
          const binaryMatch = expr.match(/\w+\s*:?=\s*\(?(\w+)\s*([-+*/])\s*(\w+)\)?(?:\s*([-+*/])\s*(\w+))?/);
          if (binaryMatch) {
            const a = getSource(binaryMatch[1]);
            const bSrc = binaryMatch[3];
            const bNum = parseFloat(bSrc);
            const b = isNaN(bNum) ? getSource(bSrc) : new Array(len).fill(bNum);
            const op1 = binaryMatch[2];

            let result = a.map((val, i) => {
              const bv = b[i] || 0;
              switch (op1) { case '+': return val + bv; case '-': return val - bv; case '*': return val * bv; case '/': return bv === 0 ? 0 : val / bv; default: return val; }
            });

            // Handle second operation if present: (a op b) op2 c
            if (binaryMatch[4] && binaryMatch[5]) {
              const cSrc = binaryMatch[5];
              const cNum = parseFloat(cSrc);
              const c = isNaN(cNum) ? getSource(cSrc) : new Array(len).fill(cNum);
              const op2 = binaryMatch[4];
              result = result.map((val, i) => {
                const cv = c[i] || 0;
                switch (op2) { case '+': return val + cv; case '-': return val - cv; case '*': return val * cv; case '/': return cv === 0 ? 0 : val / cv; default: return val; }
              });
            }

            data[v.name] = result;
          }
          // Try array index: varname[N]
          const indexMatch = expr.match(/\w+\s*:?=\s*(\w+)\[(\d+)\]/);
          if (indexMatch && !binaryMatch) {
            const src = getSource(indexMatch[1]);
            const offset = parseInt(indexMatch[2]);
            data[v.name] = src.map((_, i) => i >= offset ? src[i - offset] : src[0]);
          }
          break;
        }
      }
    } catch {
      data[v.name] = new Array(len).fill(0);
    }
  }

  return data;
}
