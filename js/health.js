'use strict';

const HEALTH_JSON_PATH = 'status.json';
const HEALTH_RECHECK_MS = 5 * 60 * 1000;

const HEALTH_SERVICE_LABELS = {
  stockQuote: '株価現在値カード',
  translate: '自動翻訳',
};

function buildHealthMessage(failedNames){
  return '⚠ ' + failedNames.join('・') + 'が一時的に利用できない可能性があります(自動復旧を待っています)';
}

function renderHealthBanner(data){
  const existing = document.getElementById('healthBanner');
  const failedNames = Object.keys(data.services || {})
    .filter(key => data.services[key] && data.services[key].ok === false)
    .map(key => HEALTH_SERVICE_LABELS[key] || key);

  if(data.ok === false && failedNames.length){
    if(existing){ existing.textContent = buildHealthMessage(failedNames); return; }
    const banner = el('div', 'health-banner', buildHealthMessage(failedNames));
    banner.id = 'healthBanner';
    banner.setAttribute('role', 'status');
    const header = document.querySelector('header');
    if(header) header.insertAdjacentElement('afterend', banner);
  } else if(existing){
    existing.remove();
  }
}

async function checkSiteHealth(){
  try{
    const response = await fetch(HEALTH_JSON_PATH + '?t=' + Date.now());
    if(!response.ok) return;
    const data = await response.json();
    renderHealthBanner(data);
  }catch(e){
  }
}

checkSiteHealth();
setInterval(checkSiteHealth, HEALTH_RECHECK_MS);
