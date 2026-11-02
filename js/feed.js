'use strict';

const REFRESH_MS = 60 * 1000;
const MAX_DISPLAY = 500;
const MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
const NEWS_CACHE_KEY = 'news-board-cache-v1';
const NEWS_JSON_PATH = 'news.json';
const CACHE_MAX_PER_SOURCE = 100;
const CACHE_MIN_PER_SOURCE = 30;
const STALE_AFTER_MS = 15 * 60 * 1000;

let itemsBySource = {};
let lastFetchFailed = false;
let lastGeneratedAt = null;
let nextRefreshAt = Date.now() + REFRESH_MS;
let fetchInProgress = false;

function sanitizeItems(rawItems){
  if(!Array.isArray(rawItems)) return [];
  return rawItems.map(item => ({
    title: stripHtml(item && item.title),
    desc: stripHtml(item && item.desc),
    link: isSafeUrl(item && item.link) ? item.link : '',
    pubDate: Number(item && item.pubDate) || null,
  }));
}

function sourceMaxAge(sourceId){
  const source = SOURCES.find(s => s.id === sourceId);
  return (source && source.maxAgeMs) || MAX_AGE_MS;
}
function trimForCache(maxPerSource){
  const trimmed = {};
  for(const sourceId of Object.keys(itemsBySource)){
    const maxAge = sourceMaxAge(sourceId);
    trimmed[sourceId] = itemsBySource[sourceId]
      .filter(item => !item.pubDate || (Date.now() - item.pubDate) <= maxAge)
      .slice(0, maxPerSource);
  }
  return trimmed;
}
function saveCache(){
  try{
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(trimForCache(CACHE_MAX_PER_SOURCE)));
  }catch(e){
    try{ localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(trimForCache(CACHE_MIN_PER_SOURCE))); }catch(e2){}
  }
}
function loadCache(){
  try{
    const cachedJson = localStorage.getItem(NEWS_CACHE_KEY);
    if(!cachedJson) return;
    const parsed = JSON.parse(cachedJson);
    for(const sourceId of Object.keys(parsed || {})){
      itemsBySource[sourceId] = sanitizeItems(parsed[sourceId]);
    }
  }catch(e){ itemsBySource = {}; }
}

let statusKind = 'loading';
let statusTimer = null;
function isServerStale(){
  return !!lastGeneratedAt && (Date.now() - lastGeneratedAt) > STALE_AFTER_MS;
}
function renderStatusText(){
  const nowText = new Date().toLocaleTimeString('ja-JP', {hour12: false});
  let staleText = '';
  if(statusKind === 'stale'){
    const staleMin = Math.round((Date.now() - lastGeneratedAt) / 60000);
    const genText = new Date(lastGeneratedAt).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
    staleText = `サーバー側の更新が約${staleMin}分止まっています(最終生成 ${genText})`;
  }
  const messages = {
    loading: `更新中… ${nowText}`,
    live: `最終更新 ${nowText} ・ リアルタイム更新中`,
    err: `最終更新 ${nowText} ・ 前回取得分を表示中`,
    stale: staleText,
    offline: `オフライン ・ 保存済みのニュースを表示中`,
  };
  document.getElementById('statusText').textContent = messages[statusKind] || messages.live;
}
function setStatus(kind){
  statusKind = kind;
  document.getElementById('statusbar').className = 'statusbar ' + kind;
  clearInterval(statusTimer);
  renderStatusText();
  if(kind === 'loading') statusTimer = setInterval(renderStatusText, 1000);
}

async function fetchAll(){
  if(fetchInProgress) return;
  fetchInProgress = true;
  setStatus('loading');
  document.getElementById('refreshBtn').disabled = true;
  try{
    const response = await fetch(NEWS_JSON_PATH + '?t=' + Date.now());
    if(!response.ok) throw new Error('news.json http ' + response.status);
    const data = await response.json();
    const nextItemsBySource = {};
    for(const sourceId of Object.keys(data.items || {})){
      nextItemsBySource[sourceId] = sanitizeItems(data.items[sourceId]);
    }
    itemsBySource = nextItemsBySource;
    lastGeneratedAt = Date.parse(data.generatedAt) || null;
    lastFetchFailed = false;
    saveCache();
  }catch(e){
    lastFetchFailed = true;
  }
  nextRefreshAt = Date.now() + REFRESH_MS;
  document.getElementById('refreshBtn').disabled = false;
  fetchInProgress = false;
  setStatus(
    lastFetchFailed ? 'err'
    : navigator.onLine === false ? 'offline'
    : isServerStale() ? 'stale'
    : 'live'
  );
  requestRender();
}
