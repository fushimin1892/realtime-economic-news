'use strict';

let activeFilters = new Set(SOURCES.map(source => source.id));
let searchTerm = '';
const animatedKeys = new Set();

function relTime(ts){
  if(!ts) return '時刻不明';
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if(diffMin < 1) return 'たった今';
  if(diffMin < 60) return `${diffMin}分前`;
  const diffH = Math.round(diffMin / 60);
  if(diffH < 24) return `${diffH}時間前`;
  return `${Math.round(diffH / 24)}日前`;
}

const NEW_WINDOW_MS = 60 * 60 * 1000;
function isNewItem(item){
  return !!item.pubDate && (Date.now() - item.pubDate) <= NEW_WINDOW_MS;
}

function visibleItems(){
  const merged = [];
  const seen = new Set();
  SOURCES.forEach(source => {
    if(!activeFilters.has(source.id)) return;
    (itemsBySource[source.id] || []).forEach(item => {
      const key = item.link || item.title;
      if(!key || seen.has(key)) return;
      seen.add(key);
      merged.push({...item, source});
    });
  });
  let filtered = merged.filter(item => !item.pubDate || (Date.now() - item.pubDate) <= (item.source.maxAgeMs || MAX_AGE_MS));
  if(topicFilterOn) filtered = filtered.filter(matchesTopic);
  if(selectedGenre) filtered = filtered.filter(matchesGenre);
  if(searchTerm){
    const query = searchTerm.toLowerCase();
    filtered = filtered.filter(item => {
      const jaTitle = trGet(item.title) || '', jaDesc = trGet(item.desc) || '';
      return item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query)
          || jaTitle.toLowerCase().includes(query) || jaDesc.toLowerCase().includes(query);
    });
  }
  return filtered.sort((itemA, itemB) => (itemB.pubDate || 0) - (itemA.pubDate || 0));
}

function buildCard(item, jaTitle, jaDesc){
  const isNew = isNewItem(item);
  const key = item.link || item.title;
  const shouldAnimate = isNew && key && !animatedKeys.has(key);
  if(shouldAnimate) animatedKeys.add(key);
  const card = el('a', 'card' + (shouldAnimate ? ' is-new' : ''));
  card.href = item.link || '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  if(isSafeColor(item.source.color)) card.style.setProperty('--src', item.source.color);

  const metaLeft = el('div', 'meta-left');
  const badge = el('span', 'src-badge', item.source.short);
  if(item.source.sub) badge.appendChild(el('span', 'genre', item.source.sub));
  metaLeft.appendChild(badge);
  if(isNew) metaLeft.appendChild(el('span', 'new-badge', 'NEW'));

  const metaRight = el('div', 'meta-right');
  const sentiment = getSentiment(item);
  if(sentiment){
    const sentimentEl = el('span', 'sentiment ' + sentiment, sentiment === 'pos' ? '▲' : '▼');
    sentimentEl.setAttribute('aria-label', sentiment === 'pos' ? 'ポジティブ判定' : 'ネガティブ判定');
    metaRight.appendChild(sentimentEl);
  }
  metaRight.appendChild(el('time', null, relTime(item.pubDate)));

  const meta = el('div', 'meta');
  meta.append(metaLeft, metaRight);

  card.appendChild(meta);
  card.appendChild(el('h3', null, jaTitle || item.title));
  if(jaTitle) card.appendChild(el('div', 'orig', item.title));
  card.appendChild(el('p', null, jaDesc || item.desc));
  card.appendChild(el('span', 'lang', item.source.lang === 'EN' ? (jaTitle ? 'EN → JA 自動翻訳' : 'EN') : 'JA'));
  return card;
}

function render(){
  const grid = document.getElementById('grid');
  const scrollYBeforeRebuild = window.scrollY;
  const restoreScroll = () => {
    if(window.scrollY !== scrollYBeforeRebuild) window.scrollTo({top: scrollYBeforeRebuild, left: 0, behavior: 'instant'});
  };

  const items = visibleItems();
  grid.textContent = '';
  if(!items.length){
    grid.appendChild(el('div', 'empty', '該当するニュースがありません'));
    restoreScroll();
    return;
  }

  const fragment = document.createDocumentFragment();
  const wantTitle = [], wantDesc = [];
  let enCount = 0;
  items.slice(0, MAX_DISPLAY).forEach(item => {
    const isEN = item.source.lang === 'EN';
    const jaTitle = (isEN && translateOn) ? trGet(item.title) : null;
    const jaDesc  = (isEN && translateOn) ? trGet(item.desc)  : null;
    if(isEN && translateOn){
      if(!jaTitle) wantTitle.push(item.title);
      if(!jaDesc && item.desc && enCount < TR_DESC_LIMIT) wantDesc.push(item.desc);
      enCount++;
    }
    try{ fragment.appendChild(buildCard(item, jaTitle, jaDesc)); }
    catch(e){ console.error('カード描画に失敗:', item && item.link, e); }
  });
  grid.appendChild(fragment);
  restoreScroll();
  wantTitle.forEach(trEnqueue);
  wantDesc.forEach(trEnqueue);
}

function sourceGroups(){
  const order = [];
  const byGroup = {};
  SOURCES.forEach(source => {
    if(!byGroup[source.group]){
      byGroup[source.group] = {label: source.short, ids: []};
      order.push(byGroup[source.group]);
    }
    byGroup[source.group].ids.push(source.id);
  });
  return order;
}
function buildChips(){
  const chipsEl = document.getElementById('chips');
  chipsEl.textContent = '';

  sourceGroups().forEach(group => {
    const isOn = group.ids.every(id => activeFilters.has(id));
    const chip = el('button', 'chip' + (isOn ? ' on' : ''), group.label);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(isOn));
    chip.onclick = () => {
      if(group.ids.every(id => activeFilters.has(id))) group.ids.forEach(id => activeFilters.delete(id));
      else group.ids.forEach(id => activeFilters.add(id));
      buildChips();
      render();
    };
    chipsEl.appendChild(chip);
  });

  const allOn = activeFilters.size === SOURCES.length;
  const allChip = el('button', 'chip' + (allOn ? ' on' : ''), 'すべて');
  allChip.type = 'button';
  allChip.setAttribute('aria-pressed', String(allOn));
  allChip.onclick = () => { activeFilters = new Set(SOURCES.map(source => source.id)); buildChips(); render(); };
  chipsEl.appendChild(allChip);

  const noneOn = activeFilters.size === 0;
  const noneChip = el('button', 'chip' + (noneOn ? ' on' : ''), 'すべて解除');
  noneChip.type = 'button';
  noneChip.setAttribute('aria-pressed', String(noneOn));
  noneChip.onclick = () => { activeFilters = new Set(); buildChips(); render(); };
  chipsEl.appendChild(noneChip);
}

let userTouching = false;
let userScrolling = false;
let scrollSettleTimer = null;
let touchSafetyTimer = null;
let renderPending = false;
function flushPendingRender(){
  if(renderPending){ renderPending = false; render(); }
}
function updateTouchState(e){
  userTouching = e.touches.length > 0;
  clearTimeout(touchSafetyTimer);
  if(userTouching){
    touchSafetyTimer = setTimeout(() => { userTouching = false; if(!userScrolling) flushPendingRender(); }, 15000);
  } else if(!userScrolling){
    flushPendingRender();
  }
}
document.addEventListener('touchstart', updateTouchState, {passive: true});
document.addEventListener('touchend', updateTouchState, {passive: true});
document.addEventListener('touchcancel', updateTouchState, {passive: true});
window.addEventListener('scroll', () => {
  userScrolling = true;
  clearTimeout(scrollSettleTimer);
  scrollSettleTimer = setTimeout(() => {
    userScrolling = false;
    if(!userTouching) flushPendingRender();
  }, 150);
}, {passive: true});
function requestRender(){
  if(userTouching || userScrolling){ renderPending = true; return; }
  render();
}

function buildFootLinks(){
  const footLinksEl = document.getElementById('footLinks');
  const seen = new Set();
  SOURCES.forEach(source => {
    if(seen.has(source.home) || !isSafeUrl(source.home)) return;
    seen.add(source.home);
    const linkEl = el('a', null, source.short);
    linkEl.href = source.home;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    footLinksEl.appendChild(linkEl);
  });
}
