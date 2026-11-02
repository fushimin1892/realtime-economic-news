import { validSources } from './_feed.js';

const FRESH_SECONDS = 60;
const CACHE_KEY = new Request('https://news-cache.internal/news.json');

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const cached = await cache.match(CACHE_KEY);
  if (cached) return cached;
  const origin = new URL(request.url).origin;
  const parts = await Promise.all(validSources().map(async source => {
    try {
      const response = await fetch(`${origin}/api/feed/${encodeURIComponent(source.id)}`);
      if (!response.ok) return null;
      return `${JSON.stringify(source.id)}:${await response.text()}`;
    } catch {
      return null;
    }
  }));
  const body = `{"generatedAt":${JSON.stringify(new Date().toISOString())},"items":{${parts.filter(Boolean).join(',')}}}`;
  const response = new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${FRESH_SECONDS}` },
  });
  waitUntil(cache.put(CACHE_KEY, response.clone()));
  return response;
}
