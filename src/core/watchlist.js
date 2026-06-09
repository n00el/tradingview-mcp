/**
 * Core watchlist logic — REST-based.
 *
 * Talks to TradingView's authenticated symbols_list REST API from inside the
 * page context (in-page fetch with credentials: 'include'). The desktop app's
 * session/CSRF cookies are HttpOnly but sent automatically on same-origin
 * requests, so no token handling is needed here.
 *
 * Endpoints (host = window.location.origin, normally https://www.tradingview.com):
 *   GET    /api/v1/symbols_list/active/              → the active list
 *   GET    /api/v1/symbols_list/custom/              → array of custom lists
 *   GET    /api/v1/symbols_list/colored/             → array of colored (flagged) lists
 *   POST   /api/v1/symbols_list/custom/              → create  {name, symbols, color?}   [paid plan]
 *   PUT    /api/v1/symbols_list/<type>/<id>/         → rename / replace {name, symbols}  [paid plan]
 *   DELETE /api/v1/symbols_list/<type>/<id>/         → delete                            [paid plan]
 *   POST   /api/v1/symbols_list/<type>/<id>/append/  → add symbols   (JSON array body)
 *   POST   /api/v1/symbols_list/<type>/<id>/remove/  → remove symbols (JSON array body)
 *
 * Free/Basic plans are limited to the single default watchlist — multi-watchlist
 * operations return HTTP 403 with code "permission_denied"; we surface that
 * message verbatim so the caller knows it's a plan limit, not a bug.
 */
import { evaluate, safeString } from '../connection.js';

/**
 * Perform an authenticated fetch against the TradingView API from page context.
 * Returns { status, ok, data } where data is parsed JSON (or raw text on failure).
 */
async function tvFetch(path, { method = 'GET', body = null } = {}) {
  const expr = `
    (async function() {
      var origin = window.location.origin || 'https://www.tradingview.com';
      var opts = {
        method: ${safeString(method)},
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      };
      ${body !== null
        ? `opts.headers['Content-Type'] = 'application/json'; opts.body = ${safeString(JSON.stringify(body))};`
        : ''}
      var resp = await fetch(origin + ${safeString(path)}, opts);
      var text = await resp.text();
      var data; try { data = JSON.parse(text); } catch (e) { data = text; }
      return { status: resp.status, ok: resp.ok, data: data };
    })()
  `;
  return evaluate(expr, { awaitPromise: true });
}

/** Map a 403 permission_denied into a friendly plan-limit error message. */
function planError(res, action) {
  const detail = res?.data?.detail || res?.data?.error || '';
  return {
    success: false,
    plan_limited: true,
    action,
    status: res.status,
    error: detail || 'This operation requires a paid TradingView plan (Essential, Plus, or Premium).',
  };
}

/**
 * Note for colored/flagged-list symbol edits. The colored append/remove
 * endpoints expect a color-code format that differs from the named colors
 * returned by GET (TODO: resolve once a paid account is available to test).
 * Use custom watchlists for reliable symbol add/remove.
 */
function coloredNote(res, action) {
  return {
    success: false,
    colored_unsupported: true,
    action,
    status: res.status,
    error: 'Adding/removing symbols on colored (flagged) lists is not yet supported — use a custom watchlist instead. ' +
      `(API said: ${res?.data?.detail || res?.data?.code || res.status})`,
  };
}

/** Shape a raw list object from the API into a compact summary. */
function shapeList(l) {
  return {
    id: l.id,
    name: l.name || (l.type === 'colored' ? `(${l.color || 'colored'} list)` : '(unnamed)'),
    type: l.type,
    color: l.color || null,
    active: !!l.active,
    symbol_count: Array.isArray(l.symbols) ? l.symbols.length : 0,
    symbols: l.symbols || [],
  };
}

/**
 * List every watchlist (custom + colored), marking the active one.
 */
export async function listAll() {
  const [custom, colored] = await Promise.all([
    tvFetch('/api/v1/symbols_list/custom/'),
    tvFetch('/api/v1/symbols_list/colored/'),
  ]);
  if (!custom.ok && custom.status === 403) return planError(custom, 'list_all');

  const lists = [];
  if (Array.isArray(custom.data)) lists.push(...custom.data.map(shapeList));
  if (Array.isArray(colored.data)) lists.push(...colored.data.map(shapeList));

  return {
    success: true,
    count: lists.length,
    active_id: lists.find(l => l.active)?.id ?? null,
    lists: lists.map(({ symbols, ...rest }) => rest), // omit symbols in the index for brevity
  };
}

/**
 * Get the active watchlist with full symbol list.
 */
export async function getActive() {
  const res = await tvFetch('/api/v1/symbols_list/active/');
  if (!res.ok) return res.status === 403 ? planError(res, 'get_active') : { success: false, status: res.status, error: res.data };
  return { success: true, ...shapeList(res.data) };
}

/**
 * Get a single list by id (searches custom + colored). Returns full symbols.
 */
export async function getById({ id }) {
  const numId = Number(id);
  const [custom, colored] = await Promise.all([
    tvFetch('/api/v1/symbols_list/custom/'),
    tvFetch('/api/v1/symbols_list/colored/'),
  ]);
  const all = [
    ...(Array.isArray(custom.data) ? custom.data : []),
    ...(Array.isArray(colored.data) ? colored.data : []),
  ];
  const found = all.find(l => l.id === numId);
  if (!found) return { success: false, error: `Watchlist ${id} not found` };
  return { success: true, ...shapeList(found) };
}

/** Resolve a list's type ("custom" | "colored") by id; defaults to "custom". */
async function resolveType(id) {
  const numId = Number(id);
  const colored = await tvFetch('/api/v1/symbols_list/colored/');
  if (Array.isArray(colored.data) && colored.data.some(l => l.id === numId)) return 'colored';
  return 'custom';
}

/**
 * Create a new watchlist. [paid plan]
 */
export async function create({ name, symbols = [], color = null }) {
  const type = color ? 'colored' : 'custom';
  const body = { name, symbols };
  if (color) body.color = color;
  const res = await tvFetch(`/api/v1/symbols_list/${type}/`, { method: 'POST', body });
  if (!res.ok) return res.status === 403 ? planError(res, 'create') : { success: false, status: res.status, error: res.data };
  return { success: true, action: 'created', ...shapeList(res.data) };
}

/**
 * Rename a watchlist (and optionally replace its symbols). [paid plan]
 */
export async function rename({ id, name, symbols = null }) {
  const type = await resolveType(id);
  const body = { name };
  if (Array.isArray(symbols)) body.symbols = symbols;
  const res = await tvFetch(`/api/v1/symbols_list/${type}/${Number(id)}/`, { method: 'PUT', body });
  if (!res.ok) return res.status === 403 ? planError(res, 'rename') : { success: false, status: res.status, error: res.data };
  return { success: true, action: 'renamed', id: Number(id), name };
}

/**
 * Delete a watchlist. [paid plan]
 */
export async function remove({ id }) {
  const type = await resolveType(id);
  const res = await tvFetch(`/api/v1/symbols_list/${type}/${Number(id)}/`, { method: 'DELETE' });
  if (!res.ok) return res.status === 403 ? planError(res, 'delete') : { success: false, status: res.status, error: res.data };
  return { success: true, action: 'deleted', id: Number(id) };
}

/**
 * Add symbols to a watchlist. Targets the active list when id is omitted.
 * Symbols should be exchange-qualified (e.g. "NASDAQ:AAPL").
 */
export async function addSymbols({ id = null, symbols }) {
  const list = id != null ? { id: Number(id), type: await resolveType(id) } : await activeRef();
  if (!list) return { success: false, error: 'No active watchlist found' };
  const arr = Array.isArray(symbols) ? symbols : [symbols];
  const res = await tvFetch(`/api/v1/symbols_list/${list.type}/${list.id}/append/`, { method: 'POST', body: arr });
  if (!res.ok) {
    if (res.status === 403) return planError(res, 'add_symbols');
    if (list.type === 'colored') return coloredNote(res, 'add_symbols');
    return { success: false, status: res.status, error: res.data };
  }
  // The append endpoint returns the updated symbol array directly.
  const updated = Array.isArray(res.data) ? res.data : (res.data?.symbols || undefined);
  return { success: true, action: 'added', id: list.id, added: arr, symbol_count: updated?.length, symbols: updated };
}

/**
 * Remove symbols from a watchlist. Targets the active list when id is omitted.
 */
export async function removeSymbols({ id = null, symbols }) {
  const list = id != null ? { id: Number(id), type: await resolveType(id) } : await activeRef();
  if (!list) return { success: false, error: 'No active watchlist found' };
  const arr = Array.isArray(symbols) ? symbols : [symbols];
  const res = await tvFetch(`/api/v1/symbols_list/${list.type}/${list.id}/remove/`, { method: 'POST', body: arr });
  if (!res.ok) {
    if (res.status === 403) return planError(res, 'remove_symbols');
    if (list.type === 'colored') return coloredNote(res, 'remove_symbols');
    return { success: false, status: res.status, error: res.data };
  }
  const updated = Array.isArray(res.data) ? res.data : (res.data?.symbols || undefined);
  return { success: true, action: 'removed', id: list.id, removed: arr, symbol_count: updated?.length, symbols: updated };
}

/**
 * Set the active watchlist. [paid plan for multi-list accounts]
 */
export async function setActive({ id }) {
  const type = await resolveType(id);
  const res = await tvFetch(`/api/v1/symbols_list/${type}/${Number(id)}/`, { method: 'PUT', body: { active: true } });
  if (!res.ok) return res.status === 403 ? planError(res, 'set_active') : { success: false, status: res.status, error: res.data };
  return { success: true, action: 'set_active', id: Number(id) };
}

/** Internal: get {id, type} of the active list. */
async function activeRef() {
  const res = await tvFetch('/api/v1/symbols_list/active/');
  if (!res.ok || !res.data?.id) return null;
  return { id: res.data.id, type: res.data.type || 'custom' };
}

// --- Backwards-compatible aliases for the original tool surface ---

/** Legacy: get the active watchlist symbols (kept for the watchlist_get tool). */
export async function get() {
  const active = await getActive();
  if (!active.success) return { success: false, count: 0, symbols: [], error: active.error };
  return {
    success: true,
    count: active.symbol_count,
    source: 'rest_api',
    id: active.id,
    name: active.name,
    symbols: (active.symbols || []).map(s => ({ symbol: s })),
  };
}

/** Legacy: add a single symbol to the active watchlist (kept for watchlist_add). */
export async function add({ symbol }) {
  const res = await addSymbols({ symbols: [symbol] });
  if (!res.success) throw new Error(res.error || 'Failed to add symbol');
  return { success: true, symbol, action: 'added' };
}
