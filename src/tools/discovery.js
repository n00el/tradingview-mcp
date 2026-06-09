import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as screener from '../core/screener.js';
import * as news from '../core/news.js';
import * as calendar from '../core/calendar.js';
import * as markets from '../core/markets.js';

const wrap = (fn) => async (args) => {
  try { return jsonResult(await fn(args || {})); }
  catch (err) { return jsonResult({ success: false, error: err.message }, true); }
};

export function registerDiscoveryTools(server) {
  // ── Screener ──
  server.tool(
    'screener_scan',
    'Screen the market via TradingView\'s scanner. Use a preset (top_gainers, top_losers, most_active, oversold, overbought, large_cap, high_rel_volume, near_52w_high, momentum, high_dividend) and/or raw filters. Friendly column names supported (price, change, volume, market_cap, rsi, pe, sector, perf_month, ...).',
    {
      preset: z.string().optional().describe('Preset name (see list in description)'),
      market: z.string().optional().describe('Market: america (default), crypto, forex, ...'),
      filters: z.string().optional().describe('JSON array of raw scanner filters, e.g. \'[{"left":"RSI","operation":"less","right":30}]\''),
      columns: z.string().optional().describe('JSON array of columns (friendly or raw), e.g. \'["price","change","rsi","sector"]\''),
      sort_by: z.string().optional().describe('Column to sort by (friendly or raw)'),
      sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default desc)'),
      limit: z.coerce.number().optional().describe('Max rows (default 25, max 200)'),
    },
    wrap(({ preset, market, filters, columns, sort_by, sort_order, limit }) => screener.scan({
      preset, market,
      filters: filters ? JSON.parse(filters) : undefined,
      columns: columns ? JSON.parse(columns) : undefined,
      sort: sort_by ? { sortBy: sort_by, sortOrder: sort_order || 'desc' } : undefined,
      limit,
    })),
  );

  server.tool(
    'movers_get',
    'Top market movers / heatmap data: gainers, losers, most active, or per-sector average performance.',
    {
      type: z.enum(['gainers', 'losers', 'active', 'sectors']).describe('What to fetch'),
      market: z.string().optional().describe('Market (default america)'),
      limit: z.coerce.number().optional().describe('Max rows (default 15)'),
    },
    wrap(screener.movers),
  );

  // ── News ──
  server.tool(
    'news_get',
    'Latest news headlines for a symbol (e.g. "NASDAQ:AAPL") or the general market feed if no symbol is given. Returns ids usable with news_article.',
    {
      symbol: z.string().optional().describe('Exchange-qualified symbol, or omit for market news'),
      limit: z.coerce.number().optional().describe('Max headlines (default 20)'),
    },
    wrap(news.getHeadlines),
  );

  server.tool(
    'news_article',
    'Fetch the full body of a news story by its id (from news_get).',
    { id: z.string().describe('Story id from news_get') },
    wrap(news.getArticle),
  );

  // ── Calendars ──
  server.tool(
    'calendar_economic',
    'Economic calendar events (releases with actual/forecast/previous). Defaults to the next 7 days for the US.',
    {
      from: z.string().optional().describe('ISO datetime start (default today)'),
      to: z.string().optional().describe('ISO datetime end (default +7 days)'),
      countries: z.string().optional().describe('Comma-separated country codes, e.g. "US,EU" (default US)'),
      min_importance: z.enum(['low', 'medium', 'high']).optional().describe('Filter out events below this importance'),
    },
    wrap(calendar.economicCalendar),
  );

  server.tool(
    'calendar_earnings',
    'Upcoming earnings releases (symbols reporting in a date range, default next 7 days), sorted by market cap.',
    {
      from: z.string().optional().describe('ISO date start (default today)'),
      to: z.string().optional().describe('ISO date end (default +7 days)'),
      market: z.string().optional().describe('Market (default america)'),
      limit: z.coerce.number().optional().describe('Max rows (default 50)'),
    },
    wrap(calendar.earningsCalendar),
  );

  // ── Markets / fundamentals ──
  server.tool(
    'quotes_get',
    'Quote snapshot for any exchange-qualified symbols (stocks, indices, futures, forex, crypto, bonds), e.g. ["SP:SPX","NYMEX:CL1!","FX:EURUSD","BINANCE:BTCUSDT"]. Returns price, change %, change abs, volume.',
    {
      symbols: z.string().describe('JSON array of symbols, e.g. \'["SP:SPX","NASDAQ:AAPL"]\''),
      columns: z.string().optional().describe('Optional JSON array of raw scanner columns'),
    },
    wrap(({ symbols, columns }) => markets.quotes({ symbols: JSON.parse(symbols), columns: columns ? JSON.parse(columns) : undefined })),
  );

  server.tool(
    'fundamentals_get',
    'Per-symbol fundamentals snapshot for a US stock: valuation (P/E, P/B), profitability (margins, ROE/ROA), balance sheet (debt, FCF), revenue, EPS, dividend yield.',
    { symbol: z.string().describe('Exchange-qualified US stock, e.g. "NASDAQ:AAPL"') },
    wrap(markets.fundamentals),
  );

  server.tool(
    'market_overview',
    'Market dashboard: snapshot of a basket — us_indices, global_indices, futures, forex, crypto, or "all".',
    { basket: z.enum(['us_indices', 'global_indices', 'futures', 'forex', 'crypto', 'all']).optional().describe('Basket to show (default all)') },
    wrap(markets.overview),
  );

  server.tool(
    'yield_curve',
    'US Treasury yield curve: yields by maturity (1M…30Y), the 10Y-2Y spread, and whether the curve is inverted.',
    {},
    wrap(markets.yieldCurve),
  );
}
