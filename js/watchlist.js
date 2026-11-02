'use strict';

const WL_PROXY_BASE_URL = 'https://yahoo-finance-proxy.r59538904.workers.dev';
const WL_SEARCH_DEBOUNCE_MS = 350;
const WL_SEARCH_MIN_LEN = 2;
const WL_REFRESH_MS = 30 * 1000;

const WL_PREF_KEY = 'news-board-wl-pref-v1';
const WL_PINNED_KEY = 'news-board-wl-pinned-v1';
const WL_PINNED_MAX = 10;
let watchlistOpen = true;
let wlSymbol = 'AAPL';
let wlPinned = [];
let wlSearchAbort = null;
let wlQuoteAbort = null;
let wlPinnedAbort = null;

function loadWatchlistPref(){
  const saved = storageGet(WL_PREF_KEY);
  watchlistOpen = saved ? saved !== 'closed' : window.innerWidth > 1100;
}

function loadWlPinned(){
  try{
    const parsed = JSON.parse(storageGet(WL_PINNED_KEY, '[]'));
    wlPinned = Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item.symbol === 'string' && typeof item.name === 'string')
      : [];
  }catch(e){ wlPinned = []; }
}
function saveWlPinned(){
  storageSet(WL_PINNED_KEY, JSON.stringify(wlPinned));
}
function isWlPinned(symbol){
  return wlPinned.some(item => item.symbol === symbol);
}
function toggleWlPin(symbol, name){
  if(isWlPinned(symbol)){
    wlPinned = wlPinned.filter(item => item.symbol !== symbol);
  }else{
    if(wlPinned.length >= WL_PINNED_MAX) wlPinned.shift();
    wlPinned.push({symbol, name});
  }
  saveWlPinned();
  buildWatchlist(true);
  buildWlPinnedList();
}
function updateWlBtn(){
  updateCollapseBtn('wlBtn', watchlistOpen, 'wlWidget');
}
function toggleWatchlist(){
  watchlistOpen = !watchlistOpen;
  storageSet(WL_PREF_KEY, watchlistOpen ? 'open' : 'closed');
  buildWatchlist();
}

function freshAbortController(previous){
  if(previous) previous.abort();
  return new AbortController();
}

async function fetchViaProxy(path, params, signal){
  const query = new URLSearchParams(params);
  const response = await fetch(WL_PROXY_BASE_URL + path + '?' + query.toString(), {signal});
  if(!response.ok) throw new Error('proxy ' + path + ' http ' + response.status);
  return response.json();
}

async function buildWatchlist(silent){
  const container = document.getElementById('wlWidget');
  if(!container) return;
  updateWlBtn();
  if(!watchlistOpen){ container.textContent = ''; return; }
  if(!WL_PROXY_BASE_URL){
    container.textContent = '';
    container.appendChild(el('div', 'wl-result-note', '株価表示にはCloudflare Workerプロキシの設定が必要です(README参照)'));
    return;
  }
  if(!silent){
    container.textContent = '';
    container.appendChild(el('div', 'wl-result-note', '読み込み中…'));
  }

  wlQuoteAbort = freshAbortController(wlQuoteAbort);
  const controller = wlQuoteAbort;
  try{
    const data = await fetchViaProxy('/quote', {symbol: wlSymbol}, controller.signal);
    const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
    if(!meta || meta.regularMarketPrice == null) throw new Error('quote meta missing');
    const quoteSeries = data.chart.result[0].indicators && data.chart.result[0].indicators.quote
      && data.chart.result[0].indicators.quote[0];
    renderWlQuote(meta, lastValidNumber(quoteSeries && quoteSeries.open), previousCloseFromSeries(quoteSeries && quoteSeries.close));
  }catch(e){
    if(e.name === 'AbortError') return;
    console.error('現在値の取得に失敗:', e);
    if(!silent){
      container.textContent = '';
      container.appendChild(el('div', 'wl-result-note', '現在値を取得できませんでした'));
    }
  }
}

function lastValidNumber(series){
  if(!Array.isArray(series)) return null;
  for(let i = series.length - 1; i >= 0; i--){
    if(typeof series[i] === 'number') return series[i];
  }
  return null;
}

function previousCloseFromSeries(series){
  if(!Array.isArray(series)) return null;
  let lastIdx = -1;
  for(let i = series.length - 1; i >= 0; i--){
    if(typeof series[i] === 'number'){ lastIdx = i; break; }
  }
  if(lastIdx <= 0) return null;
  for(let i = lastIdx - 1; i >= 0; i--){
    if(typeof series[i] === 'number') return series[i];
  }
  return null;
}

function formatPrice(value, currency){
  if(value == null || Number.isNaN(value)) return '─';
  return value.toLocaleString('ja-JP', {maximumFractionDigits: 2}) + (currency ? ' ' + currency : '');
}
function formatVolume(value){
  if(value == null || Number.isNaN(value)) return '─';
  if(value >= 1e6) return (value / 1e6).toLocaleString('ja-JP', {maximumFractionDigits: 1}) + 'M';
  if(value >= 1e3) return (value / 1e3).toLocaleString('ja-JP', {maximumFractionDigits: 1}) + 'K';
  return String(value);
}
function renderWlQuote(meta, openPrice, prevCloseOverride){
  const container = document.getElementById('wlWidget');
  if(!container) return;
  container.textContent = '';
  const card = el('div', 'wl-quote');

  const header = el('div', 'wl-quote-header');
  const nameWrap = el('div', 'wl-quote-namewrap');
  const displayName = meta.longName || meta.shortName || wlSymbol;
  nameWrap.appendChild(el('div', 'wl-quote-name', displayName));
  const symLine = wlSymbol + (meta.fullExchangeName ? ' ・ ' + meta.fullExchangeName : '');
  nameWrap.appendChild(el('div', 'wl-quote-sym', symLine));
  header.appendChild(nameWrap);

  const pinBtn = el('button', 'wl-pin-btn' + (isWlPinned(wlSymbol) ? ' on' : ''), isWlPinned(wlSymbol) ? '★' : '☆');
  pinBtn.type = 'button';
  pinBtn.title = isWlPinned(wlSymbol) ? 'ウォッチリストから外す' : 'ウォッチリストに追加';
  pinBtn.setAttribute('aria-pressed', String(isWlPinned(wlSymbol)));
  pinBtn.addEventListener('click', () => toggleWlPin(wlSymbol, displayName));
  header.appendChild(pinBtn);
  card.appendChild(header);

  card.appendChild(el('div', 'wl-quote-price', formatPrice(meta.regularMarketPrice, meta.currency)));

  const prevClose = typeof prevCloseOverride === 'number' ? prevCloseOverride : meta.chartPreviousClose;
  if(typeof prevClose === 'number' && prevClose > 0){
    const diff = meta.regularMarketPrice - prevClose;
    const diffPct = diff / prevClose * 100;
    const isUp = diff >= 0;
    const change = el('div', 'wl-quote-change ' + (isUp ? 'pos' : 'neg'),
      (isUp ? '▲ +' : '▼ ') + Math.abs(diff).toFixed(2) + ' (' + (isUp ? '+' : '−') + Math.abs(diffPct).toFixed(2) + '%)');
    card.appendChild(change);
  }

  const high = meta.regularMarketDayHigh, low = meta.regularMarketDayLow;
  if(typeof high === 'number' && typeof low === 'number' && high > low){
    const range = el('div', 'wl-quote-range');
    range.appendChild(el('span', 'wl-quote-range-label', formatPrice(low, meta.currency)));
    const track = el('div', 'wl-quote-range-track');
    const pct = Math.min(100, Math.max(0, (meta.regularMarketPrice - low) / (high - low) * 100));
    const marker = el('div', 'wl-quote-range-marker');
    marker.style.left = pct + '%';
    track.appendChild(marker);
    range.appendChild(track);
    range.appendChild(el('span', 'wl-quote-range-label', formatPrice(high, meta.currency)));
    card.appendChild(range);
  }

  const grid = el('div', 'wl-quote-grid');
  [
    ['始値', formatPrice(openPrice, meta.currency)],
    ['前日終値', formatPrice(prevClose, meta.currency)],
    ['高値', formatPrice(high, meta.currency)],
    ['安値', formatPrice(low, meta.currency)],
    ['52週高値', formatPrice(meta.fiftyTwoWeekHigh, meta.currency)],
    ['52週安値', formatPrice(meta.fiftyTwoWeekLow, meta.currency)],
    ['出来高', formatVolume(meta.regularMarketVolume)],
  ].forEach(([label, valueText]) => {
    const cell = el('div', 'wl-quote-cell');
    cell.appendChild(el('span', 'wl-quote-cell-label', label));
    cell.appendChild(el('span', 'wl-quote-cell-value', valueText));
    grid.appendChild(cell);
  });
  card.appendChild(grid);

  if(meta.regularMarketTime){
    const updatedText = '更新: ' + new Date(meta.regularMarketTime * 1000).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
    card.appendChild(el('div', 'wl-quote-updated', updatedText));
  }
  container.appendChild(card);
}

async function buildWlPinnedList(silent){
  const container = document.getElementById('wlPinned');
  if(!container) return;
  if(!wlPinned.length){ container.textContent = ''; return; }
  if(!silent) container.textContent = '';

  wlPinnedAbort = freshAbortController(wlPinnedAbort);
  const controller = wlPinnedAbort;

  const results = await Promise.allSettled(
    wlPinned.map(item => fetchViaProxy('/quote', {symbol: item.symbol}, controller.signal))
  );
  if(controller.signal.aborted) return;

  container.textContent = '';
  wlPinned.forEach((item, index) => {
    const result = results[index];
    const chartResult = result.status === 'fulfilled' && result.value && result.value.chart
      && result.value.chart.result && result.value.chart.result[0];
    const meta = chartResult && chartResult.meta;
    const closeSeries = chartResult && chartResult.indicators && chartResult.indicators.quote
      && chartResult.indicators.quote[0] && chartResult.indicators.quote[0].close;

    const row = el('button', 'wl-pinned-row' + (item.symbol === wlSymbol ? ' active' : ''));
    row.type = 'button';
    row.appendChild(el('span', 'wl-pinned-name', item.name));
    if(meta && meta.regularMarketPrice != null){
      row.appendChild(el('span', 'wl-pinned-price', formatPrice(meta.regularMarketPrice, meta.currency)));
      const prevCloseFromSeries = previousCloseFromSeries(closeSeries);
      const prevClose = typeof prevCloseFromSeries === 'number' ? prevCloseFromSeries : meta.chartPreviousClose;
      if(typeof prevClose === 'number' && prevClose > 0){
        const diffPct = (meta.regularMarketPrice - prevClose) / prevClose * 100;
        const isUp = diffPct >= 0;
        row.appendChild(el('span', 'wl-pinned-change ' + (isUp ? 'pos' : 'neg'),
          (isUp ? '+' : '−') + Math.abs(diffPct).toFixed(2) + '%'));
      }
    }else{
      row.appendChild(el('span', 'wl-pinned-price', '─'));
    }
    row.addEventListener('click', () => { wlSymbol = item.symbol; buildWatchlist(); buildWlPinnedList(true); });
    container.appendChild(row);
  });
}

function setWlResultsVisible(visible){
  const listEl = document.getElementById('wlResults');
  const input = document.getElementById('wlSearch');
  if(listEl) listEl.hidden = !visible;
  if(input) input.setAttribute('aria-expanded', String(visible));
}
function hideWlResults(){
  const listEl = document.getElementById('wlResults');
  if(listEl) listEl.textContent = '';
  setWlResultsVisible(false);
}
function renderWlResults(items){
  const listEl = document.getElementById('wlResults');
  if(!listEl) return;
  listEl.textContent = '';
  if(!items.length){
    listEl.appendChild(el('div', 'wl-result-note', '該当する銘柄が見つかりませんでした'));
    setWlResultsVisible(true);
    return;
  }
  items.slice(0, 8).forEach(item => {
    const optionBtn = el('button', 'wl-result');
    optionBtn.type = 'button';
    optionBtn.setAttribute('role', 'option');
    optionBtn.appendChild(el('span', 'wl-result-name', item.longname || item.shortname || item.symbol));
    optionBtn.appendChild(el('span', 'wl-result-sym', item.symbol + (item.exchDisp ? ' ・ ' + item.exchDisp : '')));
    optionBtn.addEventListener('mousedown', e => { e.preventDefault(); selectWlSymbol(item.symbol, item.longname || item.shortname); });
    listEl.appendChild(optionBtn);
  });
  setWlResultsVisible(true);
}
function selectWlSymbol(symbol, description){
  wlSymbol = symbol;
  const input = document.getElementById('wlSearch');
  if(input) input.value = description || symbol;
  hideWlResults();
  if(!watchlistOpen) toggleWatchlist();
  else buildWatchlist();
  buildWlPinnedList(true);
}
async function searchWlSymbol(query){
  if(!WL_PROXY_BASE_URL){
    const listEl = document.getElementById('wlResults');
    if(listEl){
      listEl.textContent = '';
      listEl.appendChild(el('div', 'wl-result-note', '検索機能を使うにはCloudflare Workerプロキシの設定が必要です(README参照)'));
    }
    setWlResultsVisible(true);
    return;
  }
  wlSearchAbort = freshAbortController(wlSearchAbort);
  const controller = wlSearchAbort;
  try{
    let englishQuery = query;
    if(/[^\x00-\x7F]/.test(query)){
      const translated = await translateQueryToEnglish(query);
      if(controller.signal.aborted) return;
      if(!translated){
        const listEl = document.getElementById('wlResults');
        if(listEl){
          listEl.textContent = '';
          listEl.appendChild(el('div', 'wl-result-note', '検索語の翻訳に失敗しました。英語名でもお試しください'));
        }
        setWlResultsVisible(true);
        return;
      }
      englishQuery = translated;
    }
    const data = await fetchViaProxy('/search', {q: englishQuery}, controller.signal);
    const items = (data && Array.isArray(data.quotes) ? data.quotes : [])
      .filter(item => item && item.symbol && (item.longname || item.shortname) && item.quoteType === 'EQUITY');
    renderWlResults(items);
  }catch(e){
    if(e.name !== 'AbortError') console.error('銘柄検索に失敗:', e);
  }
}
const debouncedWlSearch = debounce(searchWlSymbol, WL_SEARCH_DEBOUNCE_MS);
function handleWlSearchInput(value){
  const query = value.trim();
  if(query.length < WL_SEARCH_MIN_LEN){ debouncedWlSearch.cancel(); hideWlResults(); return; }
  debouncedWlSearch(query);
}

setInterval(() => {
  if(document.hidden || !watchlistOpen) return;
  buildWatchlist(true);
  buildWlPinnedList(true);
}, WL_REFRESH_MS);
