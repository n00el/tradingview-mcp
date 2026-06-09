/**
 * In-page HTTP helper. Runs fetch() inside the authenticated TradingView page
 * context via CDP, so session cookies and CORS/origin are handled by the app
 * itself. Used by the screener/news/calendar tools that talk to TradingView's
 * public REST endpoints.
 */
import { evaluate, safeString } from '../connection.js';

/**
 * @param {string} url absolute URL
 * @param {object} [opts]
 * @param {string} [opts.method] HTTP method (default GET)
 * @param {any}    [opts.body] request body; objects are JSON-stringified
 * @param {string} [opts.contentType] override Content-Type
 * @returns {Promise<{status:number, ok:boolean, data:any}>}
 */
export async function pageFetch(url, { method = 'GET', body = null, contentType = 'application/json', credentials = 'include' } = {}) {
  const bodyStr = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  const expr = `
    (async function() {
      var opts = { method: ${safeString(method)}, credentials: ${safeString(credentials)}, headers: { 'Accept': 'application/json' } };
      ${bodyStr !== null ? `opts.headers['Content-Type'] = ${safeString(contentType)}; opts.body = ${safeString(bodyStr)};` : ''}
      var resp = await fetch(${safeString(url)}, opts);
      var text = await resp.text();
      var data; try { data = JSON.parse(text); } catch (e) { data = text; }
      return { status: resp.status, ok: resp.ok, data: data };
    })()
  `;
  return evaluate(expr, { awaitPromise: true });
}
