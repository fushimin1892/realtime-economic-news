'use strict';

const GENRES = [
  {
    id: 'market', label: '📈 株価・マーケット',
    cjk: ['株','株式','株価','日経平均','東証','NYダウ','S&P500','決算','業績','時価総額','上場','IPO','空売り','年初来高値','年初来安値','暴落','急騰','急落'],
    latin: ['stock','shares','equity','equities','nasdaq','dow jones','s&p','nikkei','topix','ipo','earnings','market cap','short selling','bull market','bear market'],
  },
  {
    id: 'fx', label: '💱 為替・金融政策',
    cjk: ['為替','円安','円高','金利','利上げ','利下げ','日銀','FRB','ECB','インフレ','デフレ','政策金利','中央銀行','量的緩和','ドル円','ユーロ円'],
    latin: ['forex','fx','usd/jpy','rate hike','rate cut','fed','frb','ecb','boj','inflation','deflation','central bank','interest rate','quantitative easing'],
  },
  {
    id: 'tech', label: '💻 AI・半導体・テック',
    cjk: ['AI','人工知能','生成AI','半導体','データセンター','クラウド','テック','スタートアップ','量子コンピュータ','ロボティクス','サイバーセキュリティ'],
    latin: ['ai','llm','semiconductor','chip','gpu','data center','cloud computing','startup','robotics','quantum computing','cybersecurity','tech'],
  },
  {
    id: 'war', label: '⚔️ 戦争・安全保障',
    cjk: ['戦争','軍事','侵攻','停戦','ミサイル','核兵器','テロ','紛争','ウクライナ','ロシア','イスラエル','ガザ','北朝鮮','イラン','中東','台湾有事','防衛'],
    latin: ['war','military','invasion','ceasefire','missile','nuclear weapons','terrorism','conflict','ukraine','russia','israel','gaza','north korea','iran','taiwan strait','defense'],
  },
  {
    id: 'politics', label: '🏛️ 政治',
    cjk: ['大統領','首相','政権','選挙','議会','国会','内閣','与党','野党','外交','国連','関税'],
    latin: ['president','prime minister','parliament','election','diplomacy','white house','cabinet','tariff'],
  },
  {
    id: 'energy', label: '🛢️ エネルギー・資源',
    cjk: ['原油','天然ガス','金価格','OPEC','再生可能エネルギー','電力','レアアース'],
    latin: ['crude oil','natural gas','gold price','opec','renewable energy','lng','rare earths'],
  },
  {
    id: 'crypto', label: '🪙 暗号資産',
    cjk: ['ビットコイン','イーサリアム','仮想通貨','暗号資産','ブロックチェーン'],
    latin: ['bitcoin','ethereum','crypto','stablecoin','blockchain'],
  },
];
