'use strict';

document.getElementById('refreshBtn').addEventListener('click', () => fetchAll());
document.getElementById('trBtn').addEventListener('click', () => {
  translateOn = !translateOn;
  storageSet(TR_PREF_KEY, translateOn ? 'on' : 'off');
  updateTrBtn();
  render();
});
document.getElementById('topicBtn').addEventListener('click', () => {
  topicFilterOn = !topicFilterOn;
  storageSet(TOPIC_PREF_KEY, topicFilterOn ? 'on' : 'off');
  updateTopicBtn();
  render();
});
const debouncedSearch = debounce(value => { searchTerm = value; render(); }, 150);
document.getElementById('search').addEventListener('input', e => debouncedSearch(e.target.value.trim()));
document.getElementById('genreSelect').addEventListener('change', e => {
  selectedGenre = e.target.value || null;
  storageSet(GENRE_PREF_KEY, selectedGenre || '');
  render();
});
document.getElementById('themeBtn').addEventListener('click', toggleTheme);
document.getElementById('calBtn').addEventListener('click', toggleCalendar);
document.getElementById('calImpBtn').addEventListener('click', toggleCalImportance);
document.getElementById('wlBtn').addEventListener('click', toggleWatchlist);
document.getElementById('wlSearch').addEventListener('input', e => handleWlSearchInput(e.target.value));
document.getElementById('wlSearch').addEventListener('blur', () => setTimeout(hideWlResults, 150));

setInterval(() => {
  if(document.hidden) return;
  if(Date.now() >= nextRefreshAt) fetchAll();
}, 5000);
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && Date.now() >= nextRefreshAt) fetchAll();
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(e => {});
}

loadTheme();
loadCache();
loadTranslate();
updateTrBtn();
loadTopicPref();
updateTopicBtn();
loadGenrePref();
buildGenreSelect();
buildChips();
buildFootLinks();
tickerTape();
buildSessions();
loadCalendarPref();
initEconCalendarLazy();
loadWatchlistPref();
loadWlPinned();
buildWatchlist();
buildWlPinnedList();
render();
fetchAll();
