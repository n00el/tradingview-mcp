/**
 * Symbol insight tools via TradingView REST:
 *  - technicals: the buy/sell/neutral rating gauge (Recommend.* columns)
 *  - profile: company description / sector / employees / etc.
 *  - search: rich symbol search (ISIN/CUSIP/exchange/type)
 *  - ideas: community trade ideas for a symbol
 *  - minds: community social posts (sentiment)
 */
import { pageFetch } from './http.js';

const SCAN = (market) => `https://scanner.tradingview.com/${market}/scan`;

// Recommend.* values are in [-1,1]; map to TradingView's 5-band rating.
function rating(v) {
  if (v == null) return 'n/a';
  if (v >= 0.5) return 'Strong Buy';
  if (v >= 0.1) return 'Buy';
  if (v > -0.1) return 'Neutral';
  if (v > -0.5) return 'Sell';
  return 'Strong Sell';
}

// timeframe → scanner column suffix
const TF_SUFFIX = { '1m': '|1', '5m': '|5', '15m': '|15', '30m': '|30', '1h': '|60', '2h': '|120', '4h': '|240', '1d': '', '1w': '|1W', '1M': '|1M' };

/**
 * Technical rating gauge for a symbol at a given timeframe (default 1d).
 * Returns the overall / moving-averages / oscillators ratings plus key values.
 */
export async function technicals({ symbol, market = 'america', timeframe = '1d' } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required, e.g. "NASDAQ:AAPL"' };
  const sfx = TF_SUFFIX[timeframe] ?? '';
  const cols = [`Recommend.All${sfx}`, `Recommend.MA${sfx}`, `Recommend.Other${sfx}`, `RSI${sfx}`, `Mom${sfx}`, `ADX${sfx}`, `Stoch.K${sfx}`, `MACD.macd${sfx}`];
  const res = await pageFetch(SCAN(market), { method: 'POST', contentType: 'text/plain', body: { symbols: { tickers: [symbol] }, columns: cols } });
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const d = res.data?.data?.[0]?.d;
  if (!d) return { success: false, error: `No technicals for ${symbol}` };
  return {
    success: true, symbol, timeframe,
    overall: rating(d[0]), moving_averages: rating(d[1]), oscillators: rating(d[2]),
    values: { recommend_all: d[0], rsi: d[3], momentum: d[4], adx: d[5], stoch_k: d[6], macd: d[7] },
  };
}

const PROFILE_FIELDS = [
  ['description', 'name'], ['country', 'country'], ['sector', 'sector'], ['industry', 'industry'],
  ['number_of_employees', 'employees'], ['number_of_shareholders', 'shareholders'],
  ['float_shares_outstanding', 'float_shares'], ['total_shares_outstanding_current', 'shares_outstanding'],
  ['market_cap_basic', 'market_cap'], ['web_site_url', 'website'],
];

/** Company profile / about. */
export async function profile({ symbol, market = 'america' } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const res = await pageFetch(SCAN(market), { method: 'POST', contentType: 'text/plain', body: { symbols: { tickers: [symbol] }, columns: PROFILE_FIELDS.map(f => f[0]) } });
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const d = res.data?.data?.[0]?.d;
  if (!d) return { success: false, error: `No profile for ${symbol}` };
  const out = { success: true, symbol };
  PROFILE_FIELDS.forEach(([, label], i) => { out[label] = d[i]; });
  return out;
}

/** Rich symbol search (ISIN/CUSIP/exchange/type). */
export async function search({ query, type = '', exchange = '' } = {}) {
  if (!query) return { success: false, error: 'query is required' };
  const url = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(query)}&hl=0&lang=en&type=${encodeURIComponent(type)}&exchange=${encodeURIComponent(exchange)}&domain=production`;
  const res = await pageFetch(url, { credentials: 'omit' });
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const list = Array.isArray(res.data) ? res.data : (res.data?.symbols || []);
  const results = list.slice(0, 20).map(s => ({
    symbol: (s.exchange ? s.exchange + ':' : '') + (s.symbol || '').replace(/<\/?em>/g, ''),
    description: (s.description || '').replace(/<\/?em>/g, ''),
    type: s.type, exchange: s.exchange, currency: s.currency_code,
    isin: s.isin || null, cusip: s.cusip || null,
  }));
  return { success: true, query, count: results.length, results };
}

/** Flatten a TradingView text AST (used by minds/ideas) to plain text. */
function astText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => astText(n, out)); return out; }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') out.push(node.text);
    if (node.params?.text) out.push(node.params.text);
    if (node.children) astText(node.children, out);
  }
  return out;
}

/** Community trade ideas for a symbol. */
export async function ideas({ symbol, limit = 10 } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const res = await pageFetch(`https://www.tradingview.com/api/v1/ideas/?symbol=${encodeURIComponent(symbol)}&sort=recent`);
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const items = (res.data?.results || []).slice(0, limit).map(it => ({
    title: it.name,
    author: it.user?.username || it.author?.username || null,
    likes: it.likes_count ?? it.likesCount ?? null,
    comments: it.comments_count ?? null,
    direction: it.is_long === true ? 'long' : it.is_long === false ? 'short' : null,
    published: it.date_timestamp ? new Date(it.date_timestamp * 1000).toISOString() : null,
    summary: (it.description || '').slice(0, 280),
    url: it.published_url ? `https://www.tradingview.com${it.published_url}` : null,
  }));
  return { success: true, symbol, total: res.data?.count ?? items.length, count: items.length, ideas: items };
}

/** Community "Minds" social posts for a symbol (sentiment). */
export async function minds({ symbol, limit = 10 } = {}) {
  if (!symbol) return { success: false, error: 'symbol is required' };
  const res = await pageFetch(`https://www.tradingview.com/api/v1/minds/?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const items = (res.data?.results || []).slice(0, limit).map(it => ({
    author: it.user?.username || null,
    text: astText(it.text_ast).join('').trim().slice(0, 400),
    likes: it.likes_count ?? null,
    published: it.created_at || (it.timestamp ? new Date(it.timestamp * 1000).toISOString() : null),
    url: it.url || null,
  }));
  return { success: true, symbol, count: items.length, posts: items };
}
