'use strict';

const CAL_PREF_KEY = 'news-board-cal-pref-v1';
const CAL_IMP_KEY = 'news-board-cal-imp-v1';
let calendarOpen = true;
let calHighOnly = false;

function loadCalendarPref(){
  const saved = storageGet(CAL_PREF_KEY);
  calendarOpen = saved ? saved !== 'closed' : window.innerWidth > 1100;
  calHighOnly = storageGet(CAL_IMP_KEY) === 'high';
}
function updateCalBtn(){
  updateCollapseBtn('calBtn', calendarOpen, 'calWidget');
  const impBtn = document.getElementById('calImpBtn');
  if(impBtn){
    impBtn.textContent = calHighOnly ? '重要度: ★★★のみ' : '重要度: ★★以上';
    impBtn.classList.toggle('on', calHighOnly);
    impBtn.setAttribute('aria-pressed', String(calHighOnly));
  }
}
function buildEconCalendar(){
  const container = document.getElementById('calWidget');
  if(!container) return;
  container.textContent = '';
  updateCalBtn();
  if(!calendarOpen) return;

  const widgetWrap = el('div', 'tradingview-widget-container');
  widgetWrap.appendChild(el('div'));
  const widgetScript = document.createElement('script');
  widgetScript.async = true;
  widgetScript.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
  widgetScript.text = JSON.stringify({
    colorTheme: currentTheme() === 'light' ? 'light' : 'dark',
    isTransparent: false,
    width: '100%',
    height: '100%',
    locale: 'ja',
    importanceFilter: calHighOnly ? '1' : '0,1',
    countryFilter: 'us,jp,eu,cn,gb,de',
  });
  widgetWrap.appendChild(widgetScript);
  container.appendChild(widgetWrap);
}
function initEconCalendarLazy(){
  if(!calendarOpen){ buildEconCalendar(); return; }
  const container = document.querySelector('.calendar');
  if(!container || typeof IntersectionObserver !== 'function'){
    buildEconCalendar();
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if(entries.some(entry => entry.isIntersecting)){
      observer.disconnect();
      buildEconCalendar();
    }
  }, {rootMargin: '400px 0px'});
  observer.observe(container);
}

function toggleCalendar(){
  calendarOpen = !calendarOpen;
  storageSet(CAL_PREF_KEY, calendarOpen ? 'open' : 'closed');
  buildEconCalendar();
}
function toggleCalImportance(){
  calHighOnly = !calHighOnly;
  storageSet(CAL_IMP_KEY, calHighOnly ? 'high' : 'medium');
  buildEconCalendar();
}
