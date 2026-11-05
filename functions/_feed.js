import SOURCES from '../scripts/sources.json';

export const MAX_ITEMS_PER_SOURCE = 100;
const DESC_MAX_LEN = 220;
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const X_SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/';
const X_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const DESC_BLANK_SOURCE_IDS = new Set(['bloomberg-jp']);
const TITLE_SUFFIX_STRIPPERS = {
  toyokeizai: title => title.split(' | ')[0].trim(),
  'bloomberg-jp': title => title.endsWith(' - Bloomberg.com') ? title.slice(0, -' - Bloomberg.com'.length).trim() : title,
};

export function validSources() {
  return SOURCES.filter(s => s && s.id && (s.type === 'x' ? s.xHandle : s.rss));
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', yen: '¥', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»' };

function unescape(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(raw) {
  if (!raw) return '';
  let text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  text = unescape(text.replace(/<[^>]+>/g, ''));
  text = unescape(text.replace(/<[^>]+>/g, ''));
  return text.replace(/\s+/g, ' ').trim();
}

function cdata(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function tag(block, names) {
  for (const name of names) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    if (m && m[1].trim()) return m[1];
  }
  return '';
}

function atomLink(block) {
  let fallback = '';
  for (const m of block.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const attrs = m[1];
    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!href) continue;
    const rel = attrs.match(/rel\s*=\s*["']([^"']+)["']/i);
    if (!rel || rel[1] === 'alternate') return unescape(href[1]);
    if (!fallback) fallback = unescape(href[1]);
  }
  return fallback;
}

function toEpochMs(text) {
  const value = stripHtml(text);
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, MAX_ITEMS_PER_SOURCE);
  const strip = TITLE_SUFFIX_STRIPPERS[source.id];
  return blocks.map(([, , block]) => {
    const rssLink = stripHtml(cdata(tag(block, ['link'])));
    const title = stripHtml(tag(block, ['title']));
    const desc = DESC_BLANK_SOURCE_IDS.has(source.id) ? '' : stripHtml(tag(block, ['description', 'summary', 'content:encoded', 'content'])).slice(0, DESC_MAX_LEN);
    return {
      title: strip ? strip(title) : title,
      link: rssLink || atomLink(block),
      desc,
      pubDate: toEpochMs(tag(block, ['pubDate', 'published', 'dc:date', 'updated'])),
    };
  });
}

function parseX(html, source) {
  const m = html.match(/__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ not found');
  const entries = JSON.parse(m[1]).props.pageProps.timeline.entries;
  const maxAge = source.maxAgeMs || X_MAX_AGE_MS;
  const now = Date.now();
  const items = [];
  for (const entry of entries) {
    if (entry.type !== 'tweet') continue;
    const tweet = entry.content.tweet;
    if (tweet.retweeted_status) continue;
    const pubDate = tweet.created_at ? Date.parse(tweet.created_at) : null;
    if (Number.isFinite(pubDate) && now - pubDate > maxAge) continue;
    items.push({
      title: stripHtml(tweet.full_text || tweet.text || ''),
      link: tweet.permalink ? 'https://x.com' + tweet.permalink : '',
      desc: '',
      pubDate: Number.isFinite(pubDate) ? pubDate : null,
    });
  }
  items.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0));
  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

async function download(url, accept) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function fetchSource(source) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (source.type === 'x') return parseX(await download(X_SYNDICATION_URL + encodeURIComponent(source.xHandle), 'text/html'), source);
      return parseFeed(await download(source.rss, 'application/rss+xml, application/xml, text/xml, */*'), source);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
