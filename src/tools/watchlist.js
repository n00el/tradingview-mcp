import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/watchlist.js';

const wrap = (fn) => async (args) => {
  try { return jsonResult(await fn(args || {})); }
  catch (err) { return jsonResult({ success: false, error: err.message }, true); }
};

export function registerWatchlistTools(server) {
  // --- Reads ---
  server.tool(
    'watchlist_get',
    'Get all symbols from the active TradingView watchlist with last price/change (via REST API)',
    {},
    wrap(core.get),
  );

  server.tool(
    'watchlist_list_all',
    'List every watchlist (custom + colored/flagged), with id, name, color, type, active flag and symbol count. Call this first to discover list IDs.',
    {},
    wrap(core.listAll),
  );

  server.tool(
    'watchlist_get_active',
    'Get the currently active watchlist with its full symbol list',
    {},
    wrap(core.getActive),
  );

  server.tool(
    'watchlist_get_by_id',
    'Get a single watchlist by id, including all its symbols',
    { id: z.union([z.string(), z.number()]).describe('Watchlist id (from watchlist_list_all)') },
    wrap(core.getById),
  );

  // --- Symbol management ---
  server.tool(
    'watchlist_add',
    'Add a symbol to a watchlist (defaults to the active list). Use exchange-qualified symbols like "NASDAQ:AAPL", "NYSE:WSM", "NYMEX:CL1!".',
    {
      symbol: z.string().describe('Symbol to add, e.g. "NASDAQ:AAPL"'),
      id: z.union([z.string(), z.number()]).optional().describe('Target watchlist id (omit = active list)'),
    },
    wrap(({ symbol, id }) => core.addSymbols({ id: id ?? null, symbols: [symbol] })),
  );

  server.tool(
    'watchlist_add_symbols',
    'Add multiple symbols to a watchlist (defaults to the active list)',
    {
      symbols: z.array(z.string()).describe('Symbols to add, e.g. ["NASDAQ:AAPL","NYSE:WSM"]'),
      id: z.union([z.string(), z.number()]).optional().describe('Target watchlist id (omit = active list)'),
    },
    wrap(({ symbols, id }) => core.addSymbols({ id: id ?? null, symbols })),
  );

  server.tool(
    'watchlist_remove_symbols',
    'Remove one or more symbols from a watchlist (defaults to the active list)',
    {
      symbols: z.array(z.string()).describe('Symbols to remove, e.g. ["NASDAQ:AAPL"]'),
      id: z.union([z.string(), z.number()]).optional().describe('Target watchlist id (omit = active list)'),
    },
    wrap(({ symbols, id }) => core.removeSymbols({ id: id ?? null, symbols })),
  );

  // --- List management (paid plan: Essential/Plus/Premium) ---
  server.tool(
    'watchlist_create',
    'Create a new watchlist. Pass a color to create a colored/flagged list. REQUIRES a paid TradingView plan — returns a plan-limit message otherwise.',
    {
      name: z.string().describe('Watchlist name'),
      symbols: z.array(z.string()).optional().describe('Initial symbols, e.g. ["NASDAQ:AAPL"]'),
      color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']).optional().describe('Color for a flagged list (omit for a normal custom list)'),
    },
    wrap(({ name, symbols, color }) => core.create({ name, symbols: symbols || [], color: color || null })),
  );

  server.tool(
    'watchlist_rename',
    'Rename a watchlist (optionally replace all its symbols). REQUIRES a paid TradingView plan.',
    {
      id: z.union([z.string(), z.number()]).describe('Watchlist id'),
      name: z.string().describe('New name'),
      symbols: z.array(z.string()).optional().describe('Optional: replace the full symbol list'),
    },
    wrap(({ id, name, symbols }) => core.rename({ id, name, symbols: symbols ?? null })),
  );

  server.tool(
    'watchlist_delete',
    'Delete a watchlist by id. REQUIRES a paid TradingView plan.',
    { id: z.union([z.string(), z.number()]).describe('Watchlist id') },
    wrap(core.remove),
  );

  server.tool(
    'watchlist_set_active',
    'Set the active watchlist by id. REQUIRES a paid TradingView plan for multi-list accounts.',
    { id: z.union([z.string(), z.number()]).describe('Watchlist id') },
    wrap(core.setActive),
  );
}
