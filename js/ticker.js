'use strict';

function tickerTape(){
  const container = document.getElementById('tape');
  container.classList.add('tape-loading');
  container.textContent = '';

  const widgetWrap = el('div', 'tradingview-widget-container');
  widgetWrap.appendChild(el('div'));

  const widgetScript = document.createElement('script');
  widgetScript.async = true;
  widgetScript.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
  widgetScript.text = JSON.stringify({
    symbols: [
      {proName: 'FX:USDJPY', title: 'ドル/円'},
      {proName: 'FX:EURJPY', title: 'ユーロ/円'},
      {proName: 'FX:GBPJPY', title: 'ポンド/円'},
      {proName: 'FOREXCOM:CNHJPY', title: '人民元/円'},
      {proName: 'FX:CHFJPY', title: 'スイスフラン/円'},
      {proName: 'FX:AUDJPY', title: '豪ドル/円'},
      {proName: 'FX:CADJPY', title: 'カナダドル/円'},
      {proName: 'OANDA:HKDJPY', title: '香港ドル/円'},
      {proName: 'OSE:DJIA1!', title: 'NYダウ先物'},
      {proName: 'VANTAGE:SP500FT', title: 'S&P500先物'},
      {proName: 'INDEX:NKY', title: '日経平均'},
      {proName: 'TVC:GOLD', title: 'ゴールド'},
      {proName: 'TVC:USOIL', title: 'WTI原油'},
      {proName: 'BINANCE:BTCUSDT', title: 'BTC'},
    ],
    showSymbolLogo: true,
    isTransparent: false,
    displayMode: 'adaptive',
    colorTheme: currentTheme() === 'light' ? 'light' : 'dark',
    locale: 'ja',
  });
  widgetWrap.appendChild(widgetScript);
  container.appendChild(widgetWrap);
  setTimeout(() => container.classList.remove('tape-loading'), 500);
}
