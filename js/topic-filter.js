'use strict';

const TOPIC_PREF_KEY = 'news-board-topic-pref-v1';
const TOPIC_RE = buildKeywordRe(TOPIC_KEYWORDS_CJK, TOPIC_KEYWORDS_LATIN, 'i');
let topicFilterOn = true;

function loadTopicPref(){
  topicFilterOn = storageGet(TOPIC_PREF_KEY) !== 'off';
}
function updateTopicBtn(){
  const btn = document.getElementById('topicBtn');
  btn.textContent = topicFilterOn ? 'トピック絞込 ON' : 'トピック絞込 OFF';
  btn.classList.toggle('off', !topicFilterOn);
  btn.setAttribute('aria-pressed', String(topicFilterOn));
}
function matchesTopic(item){
  if(!topicFilterOn) return true;
  return TOPIC_RE.test(keywordSearchText(item));
}
