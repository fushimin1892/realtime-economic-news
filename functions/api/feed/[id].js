import { fetchSource, validSources } from '../../_feed.js';

const FRESH_SECONDS = 60;
const LAST_GOOD_SECONDS = 4 * 24 * 60 * 60;

function cacheKey(kind, id) {
  return new Request(`https://news-cache.internal/${kind}/${encodeURIComponent(id)}`);
}

function json(body, seconds, extra = {}) {
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${seconds}`, ...extra },
  });
}

export async function onRequestGet({ params, waitUntil }) {
  const source = validSources().find(s => s.id === params.id);
  if (!source) return new Response('unknown source', { status: 404 });
  const cache = caches.default;
  const fresh = await cache.match(cacheKey('fresh', source.id));
  if (fresh) return fresh;
  try {
    const body = JSON.stringify(await fetchSource(source));
    waitUntil(Promise.all([
      cache.put(cacheKey('fresh', source.id), json(body, FRESH_SECONDS)),
      cache.put(cacheKey('good', source.id), json(body, LAST_GOOD_SECONDS)),
    ]));
    return json(body, FRESH_SECONDS, { 'X-Feed': 'live' });
  } catch (error) {
    const lastGood = await cache.match(cacheKey('good', source.id));
    if (lastGood) return json(await lastGood.text(), FRESH_SECONDS, { 'X-Feed': 'stale' });
    return new Response(JSON.stringify({ error: String(error && error.message || error) }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
}
