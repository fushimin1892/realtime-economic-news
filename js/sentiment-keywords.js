'use strict';

const SENTIMENT_POS_CJK = [
  '上方修正','増益','最高値','急伸','急騰','好調','黒字転換','増収増益','強気','最高益','買い推奨','拡大','反発','上昇',
  '好感','押し目買い','上振れ','増配','最高値更新','値上がり','買い増し','上値追い','業績上振れ','V字回復',
  '予想比上振れ','大幅増益','過去最高','増収','好業績','株価上昇','買い優勢',
];
const SENTIMENT_POS_LATIN = [
  'rally','surge','soar','jump','gain','beat','record high','outperform','bullish','rebound','upgrade',
  'beat expectations','all-time high','record profit','strong demand','buy rating','raise guidance',
  'exceeds forecast','turnaround','breakout','beats estimates','tops estimates','strong earnings',
];
const SENTIMENT_NEG_CJK = [
  '下方修正','減益','安値','急落','暴落','不振','赤字転落','減収減益','弱気','最安値','売り推奨','縮小','低迷','下落',
  '売られ過ぎ','値下がり','業績下振れ','下振れ','減配','最安値更新','売り増し','下値模索','独歩安',
  '予想比下振れ','見通し引き下げ','大幅減益','業績悪化','株価下落','売り優勢',
];
const SENTIMENT_NEG_LATIN = [
  'slump','plunge','crash','warning','miss','record low','underperform','bearish','tumble','slide',
  'recession','layoff','layoffs','downgrade',
  'miss expectations','all-time low','profit warning','weak demand','sell rating','cut guidance',
  'falls short','sell-off','breakdown','misses estimates','weak earnings','profit slump',
];
