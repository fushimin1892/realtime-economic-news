'use strict';

const GENRE_PREF_KEY = 'news-board-genre-pref-v1';
let selectedGenre = null;

GENRES.forEach(genre => { genre.re = buildKeywordRe(genre.cjk, genre.latin, 'i'); });

function loadGenrePref(){
  const saved = storageGet(GENRE_PREF_KEY);
  selectedGenre = GENRES.some(genre => genre.id === saved) ? saved : null;
}

function buildGenreSelect(){
  const selectEl = document.getElementById('genreSelect');
  selectEl.textContent = '';

  const allOption = el('option', null, 'すべてのジャンル');
  allOption.value = '';
  selectEl.appendChild(allOption);

  GENRES.forEach(genre => {
    const option = el('option', null, genre.label);
    option.value = genre.id;
    selectEl.appendChild(option);
  });

  selectEl.value = selectedGenre || '';
}

function matchesGenre(item){
  if(!selectedGenre) return true;
  const genre = GENRES.find(g => g.id === selectedGenre);
  return !!genre && genre.re.test(keywordSearchText(item));
}
