/**
 * News via TradingView's public news-headlines API.
 *   headlines: https://news-headlines.tradingview.com/v2/headlines
 *   story:     https://news-headlines.tradingview.com/v2/story?id=<id>
 */
import { pageFetch } from './http.js';

const HEADLINES = 'https://news-headlines.tradingview.com/v2/headlines';
const STORY = 'https://news-headlines.tradingview.com/v2/story';

function fmtTime(unix) {
  if (!unix) return null;
  try { return new Date(unix * 1000).toISOString(); } catch { return unix; }
}

/**
 * Latest headlines. Pass a symbol (e.g. "NASDAQ:AAPL") for symbol news, or omit
 * for the general market feed.
 */
export async function getHeadlines({ symbol = null, lang = 'en', limit = 20 } = {}) {
  let url = `${HEADLINES}?client=overview&lang=${encodeURIComponent(lang)}`;
  if (symbol) url += `&symbol=${encodeURIComponent(symbol)}`;
  const res = await pageFetch(url);
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const items = (res.data?.items || []).slice(0, limit).map(it => ({
    id: it.id,
    title: it.title,
    provider: it.source || it.provider,
    published: fmtTime(it.published),
    urgency: it.urgency,
    symbols: (it.relatedSymbols || []).map(s => s.symbol),
    story_path: it.storyPath,
  }));
  return { success: true, symbol: symbol || 'market', count: items.length, headlines: items };
}

/** Recursively flatten TradingView's news AST into plain text. */
function astToText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => astToText(n, out)); return out; }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') out.push(node.text);
    if (node.children) astToText(node.children, out);
    // paragraph / list breaks
    if (node.type === 'p' || node.type === 'list-item') out.push('\n');
  }
  return out;
}

/**
 * Fetch a full news story by id (from getHeadlines), returning its body text.
 */
export async function getArticle({ id, lang = 'en' } = {}) {
  if (!id) return { success: false, error: 'id is required (from news headlines)' };
  const res = await pageFetch(`${STORY}?id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`);
  if (!res.ok) return { success: false, status: res.status, error: res.data };
  const s = res.data || {};
  const body = astToText(s.astDescription).join('').replace(/\n{3,}/g, '\n\n').trim();
  return {
    success: true,
    id: s.id,
    title: s.title,
    provider: s.source || s.provider,
    published: fmtTime(s.published),
    symbols: (s.relatedSymbols || []).map(x => x.symbol),
    summary: s.shortDescription || null,
    body: body || s.shortDescription || null,
  };
}
