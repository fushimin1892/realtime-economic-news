'use strict';

function escapeRe(text){
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(html){
  if(!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function isSafeUrl(url){
  try{ return ['http:', 'https:'].includes(new URL(url).protocol); }
  catch(e){ return false; }
}

function isSafeColor(color){
  return typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color);
}

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}

function updateCollapseBtn(btnId, isOpen, controlsId){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  btn.textContent = isOpen ? '折りたたむ ▲' : '表示する ▼';
  btn.setAttribute('aria-expanded', String(isOpen));
  btn.setAttribute('aria-controls', controlsId);
}

function debounce(fn, delayMs){
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

function coalesce(fn, delayMs){
  let timer = null;
  return () => {
    if(timer) return;
    timer = setTimeout(() => { timer = null; fn(); }, delayMs);
  };
}

function buildKeywordRe(cjkWords, latinWords, flags){
  return new RegExp(
    '(?:' + cjkWords.map(escapeRe).join('|') + ')' +
    '|\\b(?:' + latinWords.map(escapeRe).join('|') + ')\\b',
    flags
  );
}

function stripHashtagsForMatch(text){
  return (text || '').replace(/[#＃]\S+/g, ' ');
}
function keywordSearchText(item){
  return stripHashtagsForMatch(item.title) + ' ' + stripHashtagsForMatch(item.desc) + ' '
    + stripHashtagsForMatch(trGet(item.title)) + ' ' + stripHashtagsForMatch(trGet(item.desc));
}

function storageGet(key, fallback = null){
  try{ const value = localStorage.getItem(key); return value === null ? fallback : value; }
  catch(e){ return fallback; }
}
function storageSet(key, value){
  try{ localStorage.setItem(key, value); return true; }
  catch(e){ return false; }
}
function storageRemove(key){
  try{ localStorage.removeItem(key); return true; }
  catch(e){ return false; }
}
