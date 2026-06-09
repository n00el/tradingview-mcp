/**
 * Pine Script template library.
 *
 * Each template builds valid Pine v6 source from a small set of parameters.
 * template_apply renders one and applies it to the chart via pine.applyFormula.
 */
import { applyFormula } from './pine.js';

function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function str(v, d) { return (v === undefined || v === null || v === '') ? d : String(v); }

export const TEMPLATES = {
  vwap_bands: {
    description: 'VWAP with standard-deviation bands (overlay).',
    params: { mult: 2.0 },
    build: (p) => {
      const mult = num(p.mult, 2.0);
      return `//@version=6
indicator("VWAP Bands", overlay=true)
mult = ${mult}
v = ta.vwap(hlc3)
dev = ta.stdev(hlc3, 100)
plot(v, "VWAP", color.orange, 2)
plot(v + mult * dev, "Upper", color.new(color.teal, 0))
plot(v - mult * dev, "Lower", color.new(color.teal, 0))`;
    },
  },

  supertrend: {
    description: 'Supertrend trend-following overlay with up/down coloring.',
    params: { atr_length: 10, factor: 3.0 },
    build: (p) => {
      const len = num(p.atr_length, 10);
      const factor = num(p.factor, 3.0);
      return `//@version=6
indicator("Supertrend", overlay=true)
[st, dir] = ta.supertrend(${factor}, ${len})
upTrend = dir < 0
plot(upTrend ? st : na, "Up", color.green, 2, plot.style_linebr)
plot(upTrend ? na : st, "Down", color.red, 2, plot.style_linebr)`;
    },
  },

  ema_ribbon: {
    description: 'Multi-EMA ribbon (overlay). Set count and base length.',
    params: { count: 6, base: 20, step: 10, source: 'close' },
    build: (p) => {
      const count = Math.max(2, Math.min(12, num(p.count, 6)));
      const base = num(p.base, 20);
      const step = num(p.step, 10);
      const src = str(p.source, 'close');
      const plots = Array.from({ length: count }, (_, i) =>
        `plot(ta.ema(${src}, ${base + i * step}), "EMA ${base + i * step}")`).join('\n');
      return `//@version=6
indicator("EMA Ribbon", overlay=true)
${plots}`;
    },
  },

  rsi_bands: {
    description: 'RSI with overbought/oversold bands (separate pane).',
    params: { length: 14, ob: 70, os: 30, source: 'close' },
    build: (p) => {
      const len = num(p.length, 14);
      const ob = num(p.ob, 70);
      const os = num(p.os, 30);
      const src = str(p.source, 'close');
      return `//@version=6
indicator("RSI Bands", overlay=false)
r = ta.rsi(${src}, ${len})
plot(r, "RSI", color.purple, 2)
hline(${ob}, "Overbought", color.red)
hline(${os}, "Oversold", color.green)
hline(50, "Mid", color.gray)
bgcolor(r > ${ob} ? color.new(color.red, 90) : r < ${os} ? color.new(color.green, 90) : na)`;
    },
  },

  atr_trailing_stop: {
    description: 'ATR-based trailing stop (overlay).',
    params: { atr_length: 14, mult: 3.0 },
    build: (p) => {
      const len = num(p.atr_length, 14);
      const mult = num(p.mult, 3.0);
      return `//@version=6
indicator("ATR Trailing Stop", overlay=true)
atr = ta.atr(${len})
loss = ${mult} * atr
var float stop = na
stop := close > nz(stop[1], close) ? math.max(nz(stop[1]), close - loss) : close - loss
plot(stop, "Trailing Stop", color.red, 2)`;
    },
  },

  donchian_breakout: {
    description: 'Donchian channel breakout (overlay) with mid line.',
    params: { length: 20 },
    build: (p) => {
      const len = num(p.length, 20);
      return `//@version=6
indicator("Donchian Breakout", overlay=true)
hi = ta.highest(high, ${len})
lo = ta.lowest(low, ${len})
mid = (hi + lo) / 2
plot(hi, "Upper", color.teal, 2)
plot(lo, "Lower", color.maroon, 2)
plot(mid, "Mid", color.gray)`;
    },
  },

  bollinger_pctb: {
    description: 'Bollinger %B oscillator (separate pane).',
    params: { length: 20, mult: 2.0, source: 'close' },
    build: (p) => {
      const len = num(p.length, 20);
      const mult = num(p.mult, 2.0);
      const src = str(p.source, 'close');
      return `//@version=6
indicator("Bollinger %B", overlay=false)
basis = ta.sma(${src}, ${len})
dev = ${mult} * ta.stdev(${src}, ${len})
upper = basis + dev
lower = basis - dev
pctb = (${src} - lower) / (upper - lower)
plot(pctb, "%B", color.blue, 2)
hline(1, "Upper", color.red)
hline(0, "Lower", color.green)
hline(0.5, "Mid", color.gray)`;
    },
  },
};

export function listTemplates() {
  return {
    success: true,
    count: Object.keys(TEMPLATES).length,
    templates: Object.entries(TEMPLATES).map(([key, t]) => ({
      name: key,
      description: t.description,
      params: t.params,
    })),
  };
}

export async function applyTemplate({ name, params = {}, validate = true }) {
  const t = TEMPLATES[name];
  if (!t) {
    return { success: false, error: `Unknown template "${name}". Available: ${Object.keys(TEMPLATES).join(', ')}` };
  }
  const merged = { ...t.params, ...(params || {}) };
  const source = t.build(merged);
  const result = await applyFormula({ source, validate, fresh: true, type: 'indicator' });
  return { ...result, template: name, params: merged, source };
}
