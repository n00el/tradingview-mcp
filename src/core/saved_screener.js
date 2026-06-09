/**
 * Native saved screener presets — the ones that appear in the Screener tab's
 * dropdown. Backed by TradingView's screener-storage REST service:
 *   GET    /api/v2/screens/?screener_key=stock&version=57   list
 *   POST   /api/v2/screens/                                 create
 *   DELETE /api/v2/screens/<id>/                            delete
 *
 * Filters use the screener "storage" format (column ids like Price/MarketCap,
 * operations like above/between) — distinct from the scanner scan() filters.
 */
import { pageFetch } from './http.js';

const BASE = 'https://screener-storage.tradingview.com/screener-storage/api/v2/screens/';
const VERSION = 57;

// friendly column → storage column id
const COLUMN_IDS = {
  price: 'Price', close: 'Price', change: 'Change', volume: 'Volume',
  market_cap: 'MarketCap', mcap: 'MarketCap', beta: 'Beta',
  pe: 'PriceToEarnings', peg: 'PriceToEarningsToGrowth', dividend_yield: 'DividendsYield',
  index: 'Index', sector: 'Sector',
  float: 'SharesFloat', float_shares: 'SharesFloat', shares_float: 'SharesFloat',
  relative_volume: 'RelativeVolume', rel_volume: 'RelativeVolume', rel_vol: 'RelativeVolume',
  roe: 'ReturnOnEquity', revenue_growth: 'RevenueGrowth', eps_growth: 'EpsDilutedGrowth',
  performance: 'Performance', analyst_rating: 'AnalystRating',
};

// storage column id → required params
const COLUMN_PARAMS = {
  Change: { resolution: 'TimeResolution1D' },
  RelativeVolume: { resolution: 'TimeResolution1D' },
  DividendsYield: { fiscalPeriod: 'ttm' },
  EpsDilutedGrowth: { period: 'YoYTTM' },
};

// friendly op → storage operation type
const OPS = {
  above: 'above', greater: 'above', below: 'below', less: 'below',
  above_or_equal: 'aboveOrEqual', egreater: 'aboveOrEqual',
  below_or_equal: 'belowOrEqual', eless: 'belowOrEqual',
  equal: 'equal', between: 'between', in_range: 'between',
};

function buildColumn(name) {
  const id = COLUMN_IDS[name] || name; // allow raw storage id passthrough
  return { id, params: COLUMN_PARAMS[id] || {} };
}

/** Translate one friendly filter spec into a storage-format filter. */
function buildFilter(f) {
  const column = buildColumn(f.column);
  if (f.op === 'in' || Array.isArray(f.values)) {
    return { left: { column }, right: { values: f.values || [] }, type: 'CheckboxGroup' };
  }
  const op = OPS[f.op] || f.op;
  if (op === 'between') {
    return { left: { column }, right: { left: f.min ?? null, right: f.max ?? null }, operation: { type: 'between' }, target: 'value', type: 'Condition' };
  }
  return { left: { column }, right: { value: f.value ?? null }, operation: { type: op }, target: 'value', type: 'Condition' };
}

/** List saved screens for a screener key (default stock). */
export async function listSaved({ screener_key = 'stock' } = {}) {
  const res = await pageFetch(`${BASE}?screener_key=${encodeURIComponent(screener_key)}&version=${VERSION}`);
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const screens = (Array.isArray(res.data) ? res.data : []).map(s => ({
    id: s.id, title: s.title, markets: s.market_settings?.markets, filter_count: (s.filters || []).length,
    sort_column: s.sort_column?.id,
  }));
  return { success: true, count: screens.length, screens };
}

/**
 * Save (create) a native screener preset that shows up in the Screener dropdown.
 * @param {object} o
 * @param {string} o.title
 * @param {Array}  [o.filters] friendly filters: {column, op, value} | {column,op:'between',min,max} | {column,op:'in',values:[]}
 * @param {Array}  [o.raw_filters] full storage-format filters (overrides `filters` if given)
 * @param {string} [o.market='america']
 * @param {string} [o.sort_by='MarketCap']
 * @param {('asc'|'desc')} [o.sort_order='desc']
 * @param {string} [o.screener_key='stock']
 */
export async function save({ title, filters = [], raw_filters, market = 'america', sort_by = 'MarketCap', sort_order = 'desc', screener_key = 'stock', primary_only = false } = {}) {
  if (!title) return { success: false, error: 'title is required' };
  const builtFilters = Array.isArray(raw_filters) ? raw_filters : filters.map(buildFilter);
  const payload = {
    id: '0', title, screener_key, version: VERSION,
    market_settings: { markets: [market], is_primary_listing: !!primary_only },
    active_column_set: 'overview',
    sort_column: { id: COLUMN_IDS[sort_by] || sort_by, params: {} },
    sort_direction: sort_order,
    filters: builtFilters,
  };
  const res = await pageFetch(BASE, { method: 'POST', body: payload });
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  return { success: true, action: 'saved', id: res.data?.id, title, filters: builtFilters.length };
}

/** Delete a saved screen by id. */
export async function deleteSaved({ id }) {
  if (!id) return { success: false, error: 'id is required (from screener_list_saved)' };
  const res = await pageFetch(`${BASE}${encodeURIComponent(id)}/`, { method: 'DELETE' });
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  return { success: true, action: 'deleted', id };
}
