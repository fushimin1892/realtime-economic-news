'use strict';
try{
  const t = localStorage.getItem('news-board-theme-v1');
  if(t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
}catch(e){}
