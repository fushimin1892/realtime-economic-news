'use strict';

const SENTIMENT_POS_RE = buildKeywordRe(SENTIMENT_POS_CJK, SENTIMENT_POS_LATIN, 'gi');
const SENTIMENT_NEG_RE = buildKeywordRe(SENTIMENT_NEG_CJK, SENTIMENT_NEG_LATIN, 'gi');

const SENTIMENT_NEGATION_MARKERS = [
  'ない','なかった','せず','ならなかった','とはならず','見送り','否定','困難',
  'not ',"n't",'no longer','fails to','failed to','unable to','without',
];
function isNegatedMatch(text, index, length){
  const start = Math.max(0, index - 12);
  const end = Math.min(text.length, index + length + 12);
  const window = text.slice(start, end);
  return SENTIMENT_NEGATION_MARKERS.some(marker => window.includes(marker));
}
function countSentimentMatches(text, re){
  let valid = 0, negated = 0;
  for(const match of text.matchAll(re)){
    if(isNegatedMatch(text, match.index, match[0].length)) negated++;
    else valid++;
  }
  return {valid, negated};
}

function getSentiment(item){
  const text = keywordSearchText(item);
  const pos = countSentimentMatches(text, SENTIMENT_POS_RE);
  const neg = countSentimentMatches(text, SENTIMENT_NEG_RE);
  const posScore = pos.valid + neg.negated;
  const negScore = neg.valid + pos.negated;
  if(posScore > negScore) return 'pos';
  if(negScore > posScore) return 'neg';
  return null;
}
