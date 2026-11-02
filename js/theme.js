'use strict';

const THEME_KEY = 'news-board-theme-v1';

function systemPrefersLight(){
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
}
function currentTheme(){
  const forced = document.documentElement.getAttribute('data-theme');
  if(forced === 'light' || forced === 'dark') return forced;
  return systemPrefersLight() ? 'light' : 'dark';
}
function updateThemeBtn(){
  const isLight = currentTheme() === 'light';
  document.getElementById('themeBtn').textContent = isLight ? 'ダーク表示' : 'ライト表示';
  const themeColorMeta = document.getElementById('themeColorMeta');
  if(themeColorMeta) themeColorMeta.setAttribute('content', isLight ? '#f6f3ec' : '#0a0d18');
}
function applyTheme(theme, persist){
  if(theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  if(persist !== false){
    if(theme === 'light' || theme === 'dark') storageSet(THEME_KEY, theme);
    else storageRemove(THEME_KEY);
  }
  updateThemeBtn();
}
function loadTheme(){
  const saved = storageGet(THEME_KEY);
  applyTheme(saved === 'light' || saved === 'dark' ? saved : null, false);
}
function toggleTheme(){
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  tickerTape();
  buildEconCalendar();
}
