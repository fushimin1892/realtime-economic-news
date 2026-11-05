
const ALLOWED_ORIGINS = new Set([
  'https://fushimin1892.github.io',
  'https://realtime-news-board.pages.dev',
]);

const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_SECONDS = 30;

function corsHeaders(request) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
// Cached entries are shared across origins, so CORS headers are applied per request.
function withCors(response, request) {
  const result = new Response(response.body, response);
  result.headers.delete('Access-Control-Allow-Origin');
  Object.entries(corsHeaders(request)).forEach(([key, value]) => result.headers.set(key, value));
  return result;
}
function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function isValidSymbol(value) {
  return typeof value === 'string' && /^[A-Za-z0-9.\-^=]{1,15}$/.test(value);
}
function isValidQuery(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 50;
}

async function proxyToYahoo(upstreamUrl, request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return withCors(cached, request);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' },
  });
  const bodyText = await upstreamResponse.text();
  const response = new Response(bodyText, {
    status: upstreamResponse.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
  if (upstreamResponse.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return withCors(response, request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method not allowed' }, 405, request);
    }

    if (url.pathname === '/quote') {
      const symbol = url.searchParams.get('symbol') || '';
      if (!isValidSymbol(symbol)) return jsonResponse({ error: 'invalid symbol' }, 400, request);
      const upstreamUrl =
        'https://query1.finance.yahoo.com/v8/finance/chart/' +
        encodeURIComponent(symbol) +
        '?interval=1d&range=5d';
      return proxyToYahoo(upstreamUrl, request, ctx);
    }

    if (url.pathname === '/search') {
      const query = url.searchParams.get('q') || '';
      if (!isValidQuery(query)) return jsonResponse({ error: 'invalid query' }, 400, request);
      const upstreamUrl =
        'https://query1.finance.yahoo.com/v1/finance/search?q=' +
        encodeURIComponent(query) +
        '&quotesCount=8&newsCount=0';
      return proxyToYahoo(upstreamUrl, request, ctx);
    }

    return jsonResponse({ error: 'not found' }, 404, request);
  },
};
