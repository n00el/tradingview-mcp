/**
 * Calendars:
 *  - Economic events via economic-calendar.tradingview.com/events
 *  - Earnings via the scanner (earnings_release_next_date)
 */
import { pageFetch } from './http.js';
import { scan } from './screener.js';

const ECON = 'https://economic-calendar.tradingview.com/events';

function isoDay(d) { return d.toISOString().slice(0, 10) + 'T00:00:00.000Z'; }
function defaultRange(days = 7) {
  const from = new Date();
  const to = new Date(from.getTime() + days * 86400000);
  return { from: isoDay(from), to: isoDay(to) };
}

const IMPORTANCE = { '-1': 'low', '0': 'medium', '1': 'high' };

/**
 * Economic calendar events.
 * @param {object} o
 * @param {string} [o.from] ISO datetime (default today)
 * @param {string} [o.to] ISO datetime (default +7d)
 * @param {string} [o.countries='US'] comma list of country codes
 * @param {('low'|'medium'|'high')} [o.min_importance]
 */
export async function economicCalendar({ from, to, countries = 'US', min_importance } = {}) {
  const range = (from && to) ? { from, to } : defaultRange(7);
  const url = `${ECON}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&countries=${encodeURIComponent(countries)}`;
  // Public endpoint uses wildcard CORS — credentials:'include' would be rejected.
  const res = await pageFetch(url, { credentials: 'omit' });
  if (!res.ok) return { success: false, status: res.status, error: res.data };

  const minLvl = { low: -1, medium: 0, high: 1 }[min_importance];
  let events = (res.data?.result || []).map(e => ({
    date: e.date,
    country: e.country,
    title: e.title,
    importance: IMPORTANCE[String(e.importance)] || 'low',
    importance_raw: e.importance,
    period: e.period || null,
    actual: e.actual, forecast: e.forecast, previous: e.previous,
    currency: e.currency || null,
  }));
  if (minLvl !== undefined) events = events.filter(e => e.importance_raw >= minLvl);

  return { success: true, range, countries, count: events.length, events };
}

/**
 * Upcoming earnings releases (via scanner). Returns symbols reporting between
 * `from` and `to` (default next 7 days), sorted by market cap.
 */
export async function earningsCalendar({ from, to, market = 'america', limit = 50 } = {}) {
  const fromMs = from ? new Date(from).getTime() : Date.now();
  const toMs = to ? new Date(to).getTime() : Date.now() + 7 * 86400000;
  const fromUnix = Math.floor(fromMs / 1000);
  const toUnix = Math.floor(toMs / 1000);

  const res = await scan({
    market,
    columns: ['name', 'description', 'earnings_release_next_date', 'earnings_per_share_forecast_next_fq', 'market_cap_basic'],
    filters: [{ left: 'earnings_release_next_date', operation: 'in_range', right: [fromUnix, toUnix] }],
    sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
    limit,
    common_only: true,
  });
  if (!res.success) return res;

  const events = res.results.map(r => ({
    symbol: r.symbol,
    name: r.description,
    earnings_date: r.earnings_release_next_date ? new Date(r.earnings_release_next_date * 1000).toISOString() : null,
    eps_forecast: r.earnings_per_share_forecast_next_fq ?? null,
    market_cap: r.market_cap_basic ?? null,
  }));
  return { success: true, range: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }, count: events.length, earnings: events };
}
