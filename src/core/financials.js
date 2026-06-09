/**
 * Historical financials, earnings, and dividends via the scanner.
 * Historical series use the `_h` suffix (e.g. total_revenue_fy_h) which returns
 * an array, most-recent-first.
 */
import { pageFetch } from './http.js';

const SCAN = (market) => `https://scanner.tradingview.com/${market}/scan`;

async function scanRow(market, symbol, columns) {
  const res = await pageFetch(SCAN(market), { method: 'POST', contentType: 'text/plain', body: { symbols: { tickers: [symbol] }, columns } });
  if (!res.ok) return { ok: false, status: res.status, error: res.data };
  const d = res.data?.data?.[0]?.d;
  if (!d) return { ok: false, error: `No data for ${symbol}` };
  return { ok: true, d };
}

// label → scanner base field (suffix _fy_h / _fq_h added per period)
const HISTORY_FIELDS = {
  revenue: 'total_revenue', gross_profit: 'gross_profit', net_income: 'net_income',
  ebitda: 'ebitda', free_cash_flow: 'free_cash_flow', total_assets: 'total_assets',
  total_debt: 'total_debt', eps_diluted: 'earnings_per_share_diluted',
};

/**
 * Historical financials (annual or quarterly), most-recent-first.
 * @param {object} o
 * @param {string} o.symbol
 * @param {('annual'|'quarterly')} [o.period='annual']
 * @param {number} [o.periods=8] how many periods to return
 */
export async function history({ symbol, period = 'annual', periods = 8, market = 'america' } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const suffix = period === 'quarterly' ? '_fq_h' : '_fy_h';
  const labels = Object.keys(HISTORY_FIELDS);
  const cols = labels.map(l => HISTORY_FIELDS[l] + suffix);
  const r = await scanRow(market, symbol, cols);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const n = Math.min(Math.max(1, periods), 20);
  const series = {};
  labels.forEach((label, i) => {
    if (Array.isArray(r.d[i])) series[label] = r.d[i].slice(0, n);
  });
  return { success: true, symbol, period, periods: n, order: 'most_recent_first', series };
}

/** Earnings snapshot: latest reported EPS vs forecast, dates, YoY growth, surprise %. */
export async function earnings({ symbol, market = 'america' } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const cols = ['earnings_per_share_fq', 'earnings_per_share_forecast_fq', 'earnings_release_date', 'earnings_release_next_date', 'earnings_per_share_diluted_yoy_growth_fq', 'earnings_per_share_forecast_next_fq'];
  const r = await scanRow(market, symbol, cols);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const [eps, fc, last, next, yoy, nextFc] = r.d;
  const surprise = (eps != null && fc) ? +(((eps - fc) / Math.abs(fc)) * 100).toFixed(2) : null;
  return {
    success: true, symbol,
    last_eps: eps, last_eps_forecast: fc, surprise_pct: surprise,
    last_report: last ? new Date(last * 1000).toISOString() : null,
    next_report: next ? new Date(next * 1000).toISOString() : null,
    next_eps_forecast: nextFc, eps_yoy_growth_pct: yoy,
  };
}

// consensus mark: 1=Strong Buy ... 5=Strong Sell
function consensusLabel(m) {
  if (m == null) return 'n/a';
  if (m <= 1.5) return 'Strong Buy';
  if (m <= 2.5) return 'Buy';
  if (m <= 3.5) return 'Hold';
  if (m <= 4.5) return 'Sell';
  return 'Strong Sell';
}

/** Analyst price targets + ratings consensus. */
export async function analysts({ symbol, market = 'america' } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const cols = ['close', 'price_target_average', 'price_target_high', 'price_target_low', 'price_target_median', 'recommendation_mark', 'recommendation_total', 'recommendation_buy', 'recommendation_hold', 'recommendation_sell'];
  const r = await scanRow(market, symbol, cols);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const [close, avg, high, low, median, mark, total, buy, hold, sell] = r.d;
  const upside = (avg != null && close) ? +(((avg - close) / close) * 100).toFixed(2) : null;
  return {
    success: true, symbol, price: close,
    price_target: { average: avg, high, low, median, upside_pct: upside },
    consensus: consensusLabel(mark),
    ratings: { total, buy, hold, sell },
  };
}

/** Dividend snapshot: yield, per-share, payout ratio, last annual dividend. */
export async function dividends({ symbol, market = 'america' } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const cols = ['dividends_yield', 'dividends_per_share_fq', 'dividend_payout_ratio_ttm', 'last_annual_dividend', 'dps_common_stock_prim_issue_fy', 'continuous_dividend_payout'];
  const r = await scanRow(market, symbol, cols);
  if (!r.ok) return { success: false, status: r.status, error: r.error };
  const [yld, dpsq, payout, lastAnnual, dpsFy, years] = r.d;
  return {
    success: true, symbol,
    dividend_yield_pct: yld, dividend_per_share_q: dpsq, dividend_per_share_annual: dpsFy,
    payout_ratio_pct: payout, last_annual_dividend: lastAnnual, years_continuous_payout: years,
  };
}
