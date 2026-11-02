'use strict';

const TR_CACHE_KEY = 'news-board-tr-cache-v1';
const TR_PREF_KEY = 'news-board-tr-pref-v1';
const TR_INTERVAL_MS = 350;
const TR_TIMEOUT_MS = 10000;
const TR_MAX_LEN = 480;
const TR_DESC_LIMIT = 15;
const TR_MAX_CACHE = 600;
const TR_KEEP_CACHE = 400;
const TR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let translateOn = true;
let trCache = {};
let trQueue = [];
let trQueued = new Set();
let trRunning = false;
let trQuotaHitUntil = 0;

function loadTranslate(){
  translateOn = storageGet(TR_PREF_KEY) !== 'off';
  try{
    const cachedJson = localStorage.getItem(TR_CACHE_KEY);
    if(!cachedJson) return;
    const parsed = JSON.parse(cachedJson);
    if(!parsed || !parsed.map) return;
    const now = Date.now();
    for(const [text, entry] of Object.entries(parsed.map)){
      if(entry && typeof entry.ja === 'string' && (now - (entry.savedAt || 0)) <= TR_TTL_MS){
        trCache[text] = {ja: stripHtml(entry.ja), savedAt: entry.savedAt};
      }
    }
  }catch(e){ trCache = {}; }
}
function saveTrCache(){
  try{
    let entries = Object.entries(trCache);
    if(entries.length > TR_MAX_CACHE){
      entries.sort((entryA, entryB) => (entryB[1].savedAt || 0) - (entryA[1].savedAt || 0));
      trCache = Object.fromEntries(entries.slice(0, TR_KEEP_CACHE));
    }
    localStorage.setItem(TR_CACHE_KEY, JSON.stringify({v: 1, map: trCache}));
  }catch(e){}
}
const saveTrCacheDebounced = coalesce(saveTrCache, 1500);
function trGet(text){
  const cached = text && trCache[text];
  return cached ? cached.ja : null;
}

function makeTimeoutSignal(ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {signal: controller.signal, done: () => clearTimeout(timer)};
}
async function trViaMyMemory(text, langpair){
  const timeout = makeTimeoutSignal(TR_TIMEOUT_MS);
  try{
    const response = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + langpair, {signal: timeout.signal});
    const json = await response.json();
    const status = Number(json && json.responseStatus);
    const translated = stripHtml(json && json.responseData && json.responseData.translatedText || '');
    if(/MYMEMORY WARNING/i.test(translated) || status === 403 || status === 429){
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      trQuotaHitUntil = tomorrow.getTime();
      throw new Error('mymemory quota');
    }
    if(status !== 200 || !translated) throw new Error('mymemory failed');
    return translated;
  } finally { timeout.done(); }
}
async function trViaGoogle(text, sourceLang, targetLang){
  const timeout = makeTimeoutSignal(TR_TIMEOUT_MS);
  try{
    const response = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sourceLang + '&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text), {signal: timeout.signal});
    if(!response.ok) throw new Error('google http ' + response.status);
    const data = await response.json();
    const translated = Array.isArray(data) && Array.isArray(data[0])
      ? data[0].map(seg => seg && seg[0] || '').join('')
      : '';
    if(!translated) throw new Error('google empty');
    return stripHtml(translated);
  } finally { timeout.done(); }
}
const TR_PROVIDERS = [
  {name: 'mymemory', skip: () => Date.now() < trQuotaHitUntil, run: text => trViaMyMemory(text, 'en|ja')},
  {name: 'google',   skip: () => false,                        run: text => trViaGoogle(text, 'en', 'ja')},
];

async function translateQueryToEnglish(text){
  const providers = [
    {skip: () => Date.now() < trQuotaHitUntil, run: () => trViaMyMemory(text, 'ja|en')},
    {skip: () => false,                        run: () => trViaGoogle(text, 'ja', 'en')},
  ];
  for(const provider of providers){
    if(provider.skip()) continue;
    try{ const translated = await provider.run(); if(translated) return translated; }
    catch(e){}
  }
  return null;
}

const scheduleRender = coalesce(() => requestRender(), 1200);
async function trPump(){
  if(trRunning) return;
  trRunning = true;
  while(trQueue.length){
    if(!translateOn){ trQueue = []; trQueued.clear(); break; }
    const text = trQueue.shift();
    let ja = null;
    for(const provider of TR_PROVIDERS){
      if(provider.skip()) continue;
      try{ ja = await provider.run(text); if(ja) break; }
      catch(e){}
    }
    if(ja){
      trCache[text] = {ja, savedAt: Date.now()};
      saveTrCacheDebounced();
      scheduleRender();
    }
    trQueued.delete(text);
    await new Promise(resolve => setTimeout(resolve, TR_INTERVAL_MS));
  }
  trRunning = false;
}
function trEnqueue(text){
  if(!translateOn || !text || trCache[text] || trQueued.has(text)) return;
  if(text.length > TR_MAX_LEN) return;
  trQueued.add(text);
  trQueue.push(text);
  trPump();
}

function updateTrBtn(){
  const btn = document.getElementById('trBtn');
  btn.textContent = translateOn ? '翻訳 ON' : '翻訳 OFF';
  btn.classList.toggle('off', !translateOn);
  btn.setAttribute('aria-pressed', String(translateOn));
}
