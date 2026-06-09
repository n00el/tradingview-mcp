/**
 * Markets data via TradingView's scanner:
 *  - universal quotes (any symbol, via the `global` scan)
 *  - per-symbol fundamentals snapshot
 *  - market overview dashboard (indices / futures / fx / crypto)
 *  - US treasury yield curve
 */
import { pageFetch } from './http.js';

const GLOBAL = 'https://scanner.tradingview.com/global/scan';
const AMERICA = 'https://scanner.tradingview.com/america/scan';

async function scanTickers(url, tickers, columns) {
  const res = await pageFetch(url, { method: 'POST', contentType: 'text/plain', body: { symbols: { tickers }, columns } });
  if (!res.ok) return { ok: false, status: res.status, error: res.data };
  const rows = (res.data?.data || []).map(r => ({ symbol: r.s, d: r.d }));
  return { ok: true, rows };
}

/**
 * Universal quote snapshot for any list of exchange-qualified symbols
 * (stocks, indices, futures, forex, crypto, bonds).
 */
export async function quotes({ symbols, columns }) {
  const tickers = Array.isArray(symbols) ? symbols : [symbols];
  const cols = columns && columns.length ? columns : ['name', 'close', 'change', 'change_abs', 'volume'];
  const r = await scanTickers(GLOBAL, tickers, cols);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const results = r.rows.map(row => {
    const o = { symbol: row.symbol };
    cols.forEach((c, i) => { o[c] = row.d[i]; });
    return o;
  });
  return { success: true, count: results.length, quotes: results };
}

// Fundamental field → friendly label.
const FUNDAMENTAL_FIELDS = [
  ['description', 'name'], ['sector', 'sector'], ['industry', 'industry'],
  ['close', 'price'], ['market_cap_basic', 'market_cap'],
  ['price_earnings_ttm', 'pe_ttm'], ['price_book_fq', 'price_to_book'],
  ['earnings_per_share_basic_ttm', 'eps_ttm'],
  ['total_revenue', 'revenue_ttm'], ['net_income', 'net_income_ttm'],
  ['gross_margin', 'gross_margin_pct'], ['operating_margin', 'operating_margin_pct'],
  ['after_tax_margin', 'net_margin_pct'],
  ['free_cash_flow', 'free_cash_flow'], ['total_debt', 'total_debt'],
  ['debt_to_equity', 'debt_to_equity'], ['return_on_equity', 'roe_pct'],
  ['return_on_assets', 'roa_pct'], ['dividends_yield', 'dividend_yield_pct'],
  ['current_ratio', 'current_ratio'],
];

/**
 * Per-symbol fundamentals snapshot (valuation, profitability, balance sheet).
 */
export async function fundamentals({ symbol }) {
  if (!symbol) return { success: false, error: 'symbol is required, e.g. "NASDAQ:AAPL"' };
  const fields = FUNDAMENTAL_FIELDS.map(f => f[0]);
  const r = await scanTickers(AMERICA, [symbol], fields);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  if (!r.rows.length) return { success: false, error: `No fundamentals for ${symbol} (US stocks only).` };
  const d = r.rows[0].d;
  const data = {};
  FUNDAMENTAL_FIELDS.forEach(([, label], i) => { data[label] = d[i]; });
  return { success: true, symbol: r.rows[0].symbol, fundamentals: data };
}

// Market overview baskets.
const BASKETS = {
  us_indices: ['SP:SPX', 'NASDAQ:IXIC', 'DJ:DJI', 'TVC:RUT', 'TVC:VIX'],
  global_indices: ['TVC:DXY', 'XETR:DAX', 'TVC:UKX', 'TVC:NI225', 'HSI:HSI'],
  futures: ['NYMEX:CL1!', 'COMEX:GC1!', 'COMEX:SI1!', 'CBOT:ZN1!', 'CME:ES1!'],
  forex: ['FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 'FX:USDCHF', 'TVC:DXY'],
  crypto: ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT', 'CRYPTOCAP:TOTAL'],
};

/**
 * Market overview dashboard. Pass a basket name (us_indices, global_indices,
 * futures, forex, crypto) or "all" for a combined snapshot.
 */
export async function overview({ basket = 'all' } = {}) {
  const names = basket === 'all' ? Object.keys(BASKETS) : [basket];
  if (names.some(n => !BASKETS[n])) {
    return { success: false, error: `Unknown basket. Available: ${Object.keys(BASKETS).join(', ')}, all` };
  }
  const tickers = [...new Set(names.flatMap(n => BASKETS[n]))];
  const r = await scanTickers(GLOBAL, tickers, ['name', 'close', 'change', 'change_abs']);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const bySym = {};
  r.rows.forEach(row => { bySym[row.symbol] = { symbol: row.symbol, name: row.d[0], price: row.d[1], change_pct: row.d[2], change_abs: row.d[3] }; });
  const groups = {};
  for (const n of names) groups[n] = BASKETS[n].map(s => bySym[s]).filter(Boolean);
  return { success: true, basket, groups };
}

// US treasury maturities (TVC symbols) ordered short → long.
const TREASURY = [
  ['TVC:US01MY', '1M'], ['TVC:US03MY', '3M'], ['TVC:US06MY', '6M'], ['TVC:US01Y', '1Y'],
  ['TVC:US02Y', '2Y'], ['TVC:US03Y', '3Y'], ['TVC:US05Y', '5Y'], ['TVC:US07Y', '7Y'],
  ['TVC:US10Y', '10Y'], ['TVC:US20Y', '20Y'], ['TVC:US30Y', '30Y'],
];

/**
 * US Treasury yield curve. Returns yields by maturity, the 10Y-2Y spread, and
 * an inversion flag.
 */
export async function yieldCurve() {
  const r = await scanTickers(GLOBAL, TREASURY.map(t => t[0]), ['name', 'close', 'change']);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const bySym = {};
  r.rows.forEach(row => { bySym[row.symbol] = { yield: row.d[1], change: row.d[2] }; });
  const points = TREASURY.map(([sym, mat]) => bySym[sym] ? { maturity: mat, yield: bySym[sym].yield, change: bySym[sym].change } : null).filter(Boolean);
  const y2 = points.find(p => p.maturity === '2Y')?.yield;
  const y10 = points.find(p => p.maturity === '10Y')?.yield;
  const spread = (y2 != null && y10 != null) ? +(y10 - y2).toFixed(3) : null;
  return { success: true, country: 'US', curve: points, spread_10y_2y: spread, inverted: spread != null ? spread < 0 : null };
}
