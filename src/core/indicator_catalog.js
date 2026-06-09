/**
 * Curated catalog of common TradingView built-in indicators.
 *
 * Maps friendly/short names (RSI, EMA, BB...) to the exact study name that
 * chart.createStudy() expects. TradingView does not reliably expose its full
 * built-in catalog to the page until the Indicators dialog is opened, so this
 * curated list is the dependable path for name resolution + search. The `add`
 * flow still verifies a study was actually created, so a wrong/unknown name
 * fails loudly rather than silently.
 */

export const CATALOG = [
  // Moving averages / overlays
  { name: 'Moving Average Simple', aliases: ['sma', 'ma', 'simple moving average', 'moving average'], overlay: true },
  { name: 'Moving Average Exponential', aliases: ['ema', 'exponential moving average'], overlay: true },
  { name: 'Moving Average Weighted', aliases: ['wma', 'weighted moving average'], overlay: true },
  { name: 'Moving Average Hull', aliases: ['hma', 'hull'], overlay: true },
  { name: 'Bollinger Bands', aliases: ['bb', 'bbands', 'bollinger'], overlay: true },
  { name: 'Keltner Channels', aliases: ['kc', 'keltner'], overlay: true },
  { name: 'Donchian Channels', aliases: ['dc', 'donchian'], overlay: true },
  { name: 'Parabolic SAR', aliases: ['psar', 'sar', 'parabolic'], overlay: true },
  { name: 'Ichimoku Cloud', aliases: ['ichimoku', 'cloud'], overlay: true },
  { name: 'Volume Weighted Average Price', aliases: ['vwap'], overlay: true },
  { name: 'Pivot Points Standard', aliases: ['pivot', 'pivots', 'pivot points'], overlay: true },
  { name: 'Supertrend', aliases: ['supertrend', 'st'], overlay: true },
  { name: 'Zig Zag', aliases: ['zigzag', 'zig zag'], overlay: true },

  // Oscillators / separate pane
  { name: 'Relative Strength Index', aliases: ['rsi'], overlay: false },
  { name: 'MACD', aliases: ['macd', 'moving average convergence divergence'], overlay: false },
  { name: 'Stochastic', aliases: ['stoch', 'stochastic oscillator'], overlay: false },
  { name: 'Stochastic RSI', aliases: ['stoch rsi', 'stochrsi', 'srsi'], overlay: false },
  { name: 'Average Directional Index', aliases: ['adx', 'dmi', 'directional'], overlay: false },
  { name: 'Average True Range', aliases: ['atr'], overlay: false },
  { name: 'Commodity Channel Index', aliases: ['cci'], overlay: false },
  { name: 'Money Flow Index', aliases: ['mfi'], overlay: false },
  { name: 'On Balance Volume', aliases: ['obv'], overlay: false },
  { name: 'Williams %R', aliases: ['williams', 'willr', 'wpr', '%r'], overlay: false },
  { name: 'Rate Of Change', aliases: ['roc'], overlay: false },
  { name: 'Momentum', aliases: ['mom', 'momentum'], overlay: false },
  { name: 'Awesome Oscillator', aliases: ['ao', 'awesome'], overlay: false },
  { name: 'Chaikin Money Flow', aliases: ['cmf', 'chaikin'], overlay: false },
  { name: 'Volume', aliases: ['vol', 'volume'], overlay: false },
  { name: 'Volume Profile Visible Range', aliases: ['vpvr', 'volume profile'], overlay: true },
  { name: 'Accumulation/Distribution', aliases: ['ad', 'accumulation', 'accumulation/distribution'], overlay: false },
  { name: 'Aroon', aliases: ['aroon'], overlay: false },
  { name: 'TRIX', aliases: ['trix'], overlay: false },
  { name: 'Ultimate Oscillator', aliases: ['uo', 'ultimate'], overlay: false },
  { name: 'Connors RSI', aliases: ['crsi', 'connors'], overlay: false },
];

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Resolve a query to an exact TradingView study name.
 * Returns { name, matched: 'exact'|'alias'|'fuzzy', overlay } or null.
 */
export function resolve(query) {
  const q = norm(query);
  if (!q) return null;
  // exact name
  let hit = CATALOG.find(c => norm(c.name) === q);
  if (hit) return { name: hit.name, matched: 'exact', overlay: hit.overlay };
  // alias
  hit = CATALOG.find(c => c.aliases.some(a => norm(a) === q));
  if (hit) return { name: hit.name, matched: 'alias', overlay: hit.overlay };
  // fuzzy contains (name or alias contains query, or query contains alias)
  hit = CATALOG.find(c =>
    norm(c.name).includes(q) || c.aliases.some(a => norm(a).includes(q) || q.includes(norm(a))),
  );
  if (hit) return { name: hit.name, matched: 'fuzzy', overlay: hit.overlay };
  return null;
}

/**
 * Search the catalog, returning ranked matches.
 */
export function search(query, limit = 12) {
  const q = norm(query);
  if (!q) return CATALOG.map(c => ({ name: c.name, aliases: c.aliases, overlay: c.overlay })).slice(0, limit);
  const scored = [];
  for (const c of CATALOG) {
    const name = norm(c.name);
    let score = 0;
    if (name === q || c.aliases.some(a => norm(a) === q)) score = 100;
    else if (name.startsWith(q) || c.aliases.some(a => norm(a).startsWith(q))) score = 60;
    else if (name.includes(q) || c.aliases.some(a => norm(a).includes(q))) score = 40;
    if (score > 0) scored.push({ name: c.name, aliases: c.aliases, overlay: c.overlay, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score, ...r }) => r);
}
