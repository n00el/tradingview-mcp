/**
 * Stock/crypto/forex screener via TradingView's public scanner API
 * (scanner.tradingview.com/<market>/scan). Supports friendly column aliases,
 * named presets, and full raw filter passthrough.
 */
import { pageFetch } from './http.js';

const SCANNER = (market) => `https://scanner.tradingview.com/${market}/scan`;

// Friendly name → TradingView scanner field.
export const COLUMN_ALIASES = {
  symbol: 'name', ticker: 'name', name: 'name', description: 'description',
  price: 'close', close: 'close', open: 'open', high: 'high', low: 'low',
  change: 'change', change_pct: 'change', change_abs: 'change_abs',
  volume: 'volume', rel_volume: 'relative_volume_10d_calc',
  market_cap: 'market_cap_basic', mcap: 'market_cap_basic',
  rsi: 'RSI', atr: 'ATR', adx: 'ADX', macd: 'MACD.macd',
  pe: 'price_earnings_ttm', eps: 'earnings_per_share_basic_ttm',
  dividend_yield: 'dividend_yield_recent', sector: 'sector', industry: 'industry',
  exchange: 'exchange', country: 'country', type: 'type',
  perf_week: 'Perf.W', perf_month: 'Perf.1M', perf_3m: 'Perf.3M',
  perf_6m: 'Perf.6M', perf_ytd: 'Perf.YTD', perf_year: 'Perf.Y',
  gap: 'gap', vwap: 'VWAP', sma50: 'SMA50', sma200: 'SMA200',
  high_52w: 'price_52_week_high', low_52w: 'price_52_week_low',
  earnings_date: 'earnings_release_next_date',
};

const DEFAULT_COLUMNS = ['name', 'close', 'change', 'volume', 'market_cap_basic', 'sector'];

// Keep results to ordinary common stocks unless the caller overrides.
const COMMON_STOCK_FILTER = [
  { left: 'typespecs', operation: 'has', right: ['common'] },
  { left: 'type', operation: 'equal', right: 'stock' },
  { left: 'is_primary', operation: 'equal', right: true },
];

export const PRESETS = {
  // Liquidity floors (price ≥ $2, mcap ≥ $100M, real volume) keep OTC penny junk out.
  top_gainers: { sort: { sortBy: 'change', sortOrder: 'desc' }, filter: [{ left: 'close', operation: 'egreater', right: 2 }, { left: 'market_cap_basic', operation: 'greater', right: 1e8 }, { left: 'volume', operation: 'greater', right: 200000 }] },
  top_losers: { sort: { sortBy: 'change', sortOrder: 'asc' }, filter: [{ left: 'close', operation: 'egreater', right: 2 }, { left: 'market_cap_basic', operation: 'greater', right: 1e8 }, { left: 'volume', operation: 'greater', right: 200000 }] },
  most_active: { sort: { sortBy: 'volume', sortOrder: 'desc' }, filter: [{ left: 'close', operation: 'egreater', right: 2 }, { left: 'market_cap_basic', operation: 'greater', right: 1e8 }] },
  oversold: { filter: [{ left: 'RSI', operation: 'less', right: 30 }], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } },
  overbought: { filter: [{ left: 'RSI', operation: 'greater', right: 70 }], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } },
  large_cap: { filter: [{ left: 'market_cap_basic', operation: 'greater', right: 1e10 }], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } },
  high_rel_volume: { filter: [{ left: 'relative_volume_10d_calc', operation: 'greater', right: 2 }], sort: { sortBy: 'relative_volume_10d_calc', sortOrder: 'desc' } },
  near_52w_high: { filter: [{ left: 'close', operation: 'egreater', right: 'price_52_week_high' }], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } },
  momentum: { filter: [{ left: 'Perf.1M', operation: 'greater', right: 10 }, { left: 'market_cap_basic', operation: 'greater', right: 1e9 }], sort: { sortBy: 'Perf.1M', sortOrder: 'desc' } },
  high_dividend: { filter: [{ left: 'dividend_yield_recent', operation: 'greater', right: 4 }], sort: { sortBy: 'dividend_yield_recent', sortOrder: 'desc' } },
};

function resolveColumns(cols) {
  return (cols && cols.length ? cols : DEFAULT_COLUMNS).map(c => COLUMN_ALIASES[c] || c);
}

/**
 * Run a market scan.
 * @param {object} o
 * @param {string} [o.market='america'] america | crypto | forex | ...
 * @param {string} [o.preset] one of PRESETS
 * @param {Array}  [o.filters] raw scanner filters [{left,operation,right}]
 * @param {string[]} [o.columns] friendly or raw column names
 * @param {object} [o.sort] {sortBy, sortOrder}
 * @param {number} [o.limit=25]
 * @param {boolean} [o.common_only=true] restrict to common primary stocks (america only)
 */
export async function scan({ market = 'america', preset, filters, columns, sort, limit = 25, common_only = true } = {}) {
  const presetDef = preset ? PRESETS[preset] : null;
  if (preset && !presetDef) {
    return { success: false, error: `Unknown preset "${preset}". Available: ${Object.keys(PRESETS).join(', ')}` };
  }

  const rawCols = resolveColumns(columns);
  const filterArr = [];
  if (common_only && market === 'america') filterArr.push(...COMMON_STOCK_FILTER);
  if (presetDef?.filter) filterArr.push(...presetDef.filter);
  if (Array.isArray(filters)) filterArr.push(...filters);

  const sortDef = sort || presetDef?.sort || { sortBy: 'market_cap_basic', sortOrder: 'desc' };
  // map a friendly sortBy alias too
  if (sortDef.sortBy && COLUMN_ALIASES[sortDef.sortBy]) sortDef.sortBy = COLUMN_ALIASES[sortDef.sortBy];

  const body = {
    columns: rawCols,
    filter: filterArr,
    sort: sortDef,
    range: [0, Math.min(Math.max(1, limit), 200)],
  };

  const res = await pageFetch(SCANNER(market), { method: 'POST', body, contentType: 'text/plain' });
  if (!res.ok) return { success: false, status: res.status, error: res.data };

  const rows = (res.data?.data || []).map(row => {
    const obj = { symbol: row.s };
    rawCols.forEach((col, i) => { obj[col] = row.d[i]; });
    return obj;
  });

  return {
    success: true,
    market,
    preset: preset || null,
    total_matches: res.data?.totalCount ?? rows.length,
    returned: rows.length,
    columns: rawCols,
    results: rows,
  };
}

/**
 * Movers / heatmap convenience: gainers, losers, active, or sector performance.
 */
export async function movers({ type = 'gainers', market = 'america', limit = 15 } = {}) {
  if (type === 'sectors') {
    // Aggregate by sector using the scanner's sector grouping columns.
    const res = await scan({
      market, columns: ['name', 'sector', 'change', 'market_cap_basic'],
      sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' }, limit: 200,
    });
    if (!res.success) return res;
    const bySector = {};
    for (const r of res.results) {
      const s = r.sector || 'Unknown';
      (bySector[s] ||= { sector: s, count: 0, avg_change: 0, _sum: 0 });
      bySector[s].count++; bySector[s]._sum += Number(r.change) || 0;
    }
    const sectors = Object.values(bySector)
      .map(x => ({ sector: x.sector, count: x.count, avg_change: +(x._sum / x.count).toFixed(2) }))
      .sort((a, b) => b.avg_change - a.avg_change);
    return { success: true, market, type: 'sectors', sectors };
  }
  const presetMap = { gainers: 'top_gainers', losers: 'top_losers', active: 'most_active' };
  const preset = presetMap[type];
  if (!preset) return { success: false, error: `type must be gainers|losers|active|sectors` };
  return scan({ market, preset, columns: ['name', 'close', 'change', 'volume', 'market_cap_basic'], limit });
}
