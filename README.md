# 世界ニュース速報 — リアルタイム経済ニュースボード

Financial Times、CNBC、NHK、Bloomberg、Investing.com、FXStreet など約34の投資/金融専門ソースを集約する経済ニュースボードです。RSS取得はGitHub Actions上のPythonが定期的に行い、結果を静的JSONとしてGitHub Pagesへ直接デプロイする方式のため、ブラウザ側(`index.html`)はビルド不要のまま動作します。

## アーキテクチャ

1. `.github/workflows/fetch-news.yml`(GitHub Actions)が `scripts/fetch_news.py` を実行
2. `fetch_news.py` が `sources.json` の各ソースを直接fetchし(CORSプロキシを使わないサーバー側取得)、`news.json` と `sources.js` を生成してGitHub Pagesへデプロイ(生成物はコミットしない。前回分は公開中のサイトから受け取る)
3. ブラウザ側(`feed.js`)は `news.json` を1分おきにfetchして画面に反映するだけ(ブラウザから個別RSSやプロキシへは一切アクセスしない)

### 自動実行について

`fetch-news.yml`はGitHub内蔵の`schedule`(cron)トリガーを持ちません。このリポジトリでは`schedule`予約実行がGitHub側でほぼ発火しない実績(観測期間中1回のみ、しかもキャンセル)だったため撤去済みです。代わりに、外部の無料cronサービス(例: cron-job.org)からGitHub REST APIの`workflow_dispatch`エンドポイントを1分おきに叩く運用にしています(このリポジトリのActions実行権限のみを持つトークンを発行して利用)。外部cronサービスが停止すると更新も止まるため、更新が滞った場合はまずそちらの稼働状況を確認してください。なお、フロントエンド側にもサーバー更新停止を検知する仕組みがあり、`news.json`の生成時刻が15分以上更新されていない場合はステータス表示が金色に変わり「サーバー側の更新が止まっている」ことを画面上で確認できます。

#### 外部cronの設定手順

1. GitHubの [Fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) を発行する。Repository accessは `Only select repositories` で `realtime-economic-news` のみを選び、Permissionsは `Actions: Read and write` のみを付与する。トークンはこのリポジトリにコミットせず、cronサービス側にだけ保存する。有効期限が切れると更新が止まるため、期限前に再発行する。
2. cronサービス(例: cron-job.org)に次のHTTPリクエストを登録する。成功時の応答は `204 No Content`。

   ```
   POST https://api.github.com/repos/fushimin1892/realtime-economic-news/actions/workflows/fetch-news.yml/dispatches
   Authorization: Bearer <発行したトークン>
   Accept: application/vnd.github+json
   X-GitHub-Api-Version: 2022-11-28
   Content-Type: application/json

   {"ref":"main"}
   ```

手動で実行する場合は、Actionsタブの「Fetch News」→「Run workflow」、または `gh workflow run fetch-news.yml` を使います。

### 外部API死活監視について

`fetch-news.yml`の中で`scripts/health_check.py`も毎回(実質1分おき)実行されますが、株価プロキシ(Cloudflare Worker)・翻訳API(MyMemory/Google翻訳)への実際のリクエストは20分に1回しか行いません(`status.json`の`checkedAt`を見て間引く)。無料枠のAPIを不必要に叩かないための間引きで、GitHub組み込みの`schedule`が信頼できない対策として既に確実に毎分動いている`fetch-news.yml`のトリガーに相乗りする形にしています。

異常を検知すると`status.json`を更新してフロントエンド(`health.js`)がヘッダー下に警告バナーを出すほか、GitHubリポジトリに`health-check`ラベル付きのIssueを自動作成します(既に開いていれば連投しない)。復旧を検知すると自動でコメントを付けてIssueをクローズします。翻訳はMyMemory→Google翻訳の2段フォールバックがあるため、両方失敗した時だけ異常扱いにします(MyMemory単体のクォータ超過は正常フォールバックの範囲内のため対象外)。

## ファイル構成

デザイン(`css/style.css`)・データ・機能ロジックをそれぞれ役割ごとに分離しています。修正したい機能に対応するファイルだけを開けば済みます。

```
index.html / privacy.html          ページ本体(index.htmlの<head>にCSP設定)
manifest.webmanifest / sw.js       PWA対応(ホーム画面追加・オフライン表示)
robots.txt                         検索エンジン向け設定
sources.json                       配信元定義の正本(手編集する)
news.json / status.json            デプロイ時に生成する静的JSON(リポジトリには含めない)
css/                                画面デザイン
  style.css / privacy.css
js/                                 フロントエンドのロジック・データ(sw.jsのみ例外でルート直下。
                                     理由: Service Workerの制御範囲はスクリプト自身のディレクトリ
                                     以下に限られ、GitHub Pagesではこれをレスポンスヘッダーで
                                     拡張できないため、サイト全体をオフライン対応させるにはルートに
                                     置く必要がある)
  main.js                           イベント登録・自動更新・Service Worker登録・起動処理
  theme-init.js                    <head>内で同期実行するFOUC防止スニペット
  scale.js                          #scaleWrapをウィンドウ幅に応じて拡大縮小する
  sources.js                        sources.jsonから自動生成(手編集しない。fetch_news.pyが再生成)
  topic-keywords.js / sentiment-keywords.js / genre-keywords.js / market-sessions.js
                                     データ: 各絞り込み・判定用の単語リストと市場の開場時間
  utils.js                          共通ヘルパー関数(stripHtml・isSafeUrl・buildKeywordRe等)
  theme.js                          ダーク/ライトモード切り替え
  feed.js                           静的news.jsonの取得・キャッシュ・更新ステータス表示
  translate.js                      英語記事の自動日本語翻訳
  topic-filter.js / genre-filter.js / sentiment.js
                                     トピック絞り込み・ジャンル絞込・簡易センチメント判定ロジック
  render.js                         記事一覧・フィルターチップ・フッターリンクの描画
  ticker.js / sessions.js / calendar.js
                                     TradingView相場ティッカー・世界の取引セッション・経済指標カレンダー
  watchlist.js                      Yahoo Finance銘柄検索・株価現在値カード・ピン留めミニウォッチ
                                     リスト(利用には自前デプロイのCloudflare Workerプロキシ設定が
                                     必要、下記参照)
  health.js                         status.jsonを読み、異常時にヘッダー下へ警告バナーを表示する
icons/                              PWAアイコン各種
cloudflare-worker/yahoo-finance-proxy.js
                                     watchlist.js用CORSプロキシ。GitHub Pagesにはデプロイされない、
                                     Cloudflare Workersへ別途デプロイするソース
scripts/fetch_news.py               RSS取得本体(Python)。sources.json→js/sources.jsの再生成、
                                     全ソースの並列fetch、news.jsonの書き出しを行う
scripts/health_check.py             株価プロキシ・翻訳APIの死活監視(Python)。status.jsonの書き出しと、
                                     異常検知時のGitHub Issue自動作成/復旧時クローズを行う
scripts/requirements.txt            上記スクリプトの依存パッケージ(requests, feedparser)
.github/workflows/fetch-news.yml    上記2スクリプトを実行するGitHub Actions定義
                                     (トリガーは外部cronからのworkflow_dispatchのみ)
```

## 対応ニュースソース(約34)

為替・政策金利・商品・国際情勢に強いソースを重視して横断収集しています。

- **総合経済/ビジネス**: Financial Times、CNBC(Top News・US News)、Forbes、MarketWatch、TechCrunch、The Guardian(Business)、東洋経済オンライン、ダイヤモンド・オンライン、ZUU online
- **日本経済新聞グループ**: 日経ビジネス電子版、日経クロステック、日本経済新聞(X公式アカウント)— この3ソースはフィルターチップを1つ(「日経ビジネス」)に統合しています。X投稿はX公式埋め込みウィジェットが使う公開エンドポイント(`syndication.twitter.com`)から取得しており、ログイン・Cookieは不要です。ただし非公開の内部エンドポイントのため、期間に関係なく常に最新約20件しか返さない制約があり、`fetch_news.py`側で毎回の取得結果を前回分と統合して蓄積する方式(最大48時間分)を採用しています
- **NHK**: 経済・主要・政治・国際の4フィードを「NHK」チップに統合
- **BBC**: Business・Worldの2フィードを「BBC」チップに統合
- **為替/商品/経済指標**: Investing.com(株式・為替・経済指標・商品の4フィード、1チップに統合)、FXStreet、OilPrice.com、CoinDesk
- **市況/市場データ配信**: WSJ Markets(MarketWatchと同じDow Jones配信基盤経由で取得)、Seeking Alpha
- **政治/戦争・地政学**: Politico、Foreign Policy、Defense News
- **Bloomberg**: `bloomberg.com`本体はボット検知(PerimeterX等)により自動取得を一律拒否するため、Googleニュースの公式サイト内検索RSS(`site:`検索)経由でBloomberg Japan関連記事を取得しています。記事へのリンクはGoogle Newsのリダイレクト経由になります(詳細は`sources.json`の`bloomberg-jp`エントリの`note`を参照)
- **IT/テクノロジー**: ITmedia(ビジネス・AI+)

投資/金融特化の方針のもと、一般ニュース/ライフスタイル系(Newsweek、Business Insider、Digiday、VentureBeat、GeekWire、Japan Times、ITmedia NEWS、CNET Japan、Tech in Asia等)は収載を見送っています。WSJ公式RSS・CNNは配信が長期間停止/廃止済みで代替経由でも安定取得できなかったため、Nikkei Asiaは公開RSSが日時情報を含まないため、Bank of England(BOE)公式発表は更新頻度が低く表示対象期間(4日以内)に記事が無い期間が長かったため、それぞれ収載していません。The Economist・Federal Reserve(FRB)・European Central Bank(ECB)・日本銀行(日銀)の4ソースも、更新頻度が低く表示対象期間(4日以内)に記事が無い状態が続いていたため撤去しました。

## 主な機能

- **横断収集**: 上記ソースを1分おきにGitHub Actionsが再取得し、ブラウザ側も1分おきにその結果(`news.json`)を再取得。過去4日以内に公開された記事を自動表示(ソースによっては`sources.json`の`maxAgeMs`で個別に上限を短縮)
- **英語記事の日本語表示**: MyMemory(利用不可時はGoogle翻訳)による自動翻訳。原文見出しもあわせて確認可能
- **関心トピックで絞り込み**: 投資・金融・政治・戦争/地政学関連のキーワードをワンクリックでON/OFF切替(既定はON)
- **簡易センチメント表示**: 見出し・要約内の頻出語から上向き/下向きの傾向を▲/▼で表示
- **記事管理**: NEWバッジ、配信元フィルターチップ、キーワード検索、ジャンル絞込プルダウン(株価・為替・AI/半導体・戦争など、キーワード検索欄の隣に配置。他の絞り込みと併用可能なAND条件)
- **マーケット情報の併記**: TradingViewティッカーで為替・主要株価指数を、記事一覧左の株価現在値カードで企業名検索(Yahoo Finance、自前デプロイのCloudflare Worker経由。日本語企業名にも対応、初期表示はApple、30秒ごとに自動更新)から現在値・前日比・当日値幅・52週高値安値・出来高を、記事一覧右の経済指標カレンダーで雇用統計・CPI・政策金利など重要指標の発表予定(重要度フィルター付き)を同一画面に表示。株価現在値カードは気になる銘柄を☆ボタンでピン留めでき、最大10件までミニウォッチリストとしてコンパクトな一覧表示・ワンクリック切替が可能(ピン留め内容はlocalStorageに保存)。株価現在値カード・カレンダーともに折りたたみ対応。ページ全体を`scale.js`で拡大縮小表示しているため、画面幅に関わらず「株価パネル左・記事一覧中央・カレンダー右」の3カラム配置が常に維持される
- **サーバー死活監視**: `news.json`の生成時刻が15分以上更新されなければステータス表示が金色に変わり、外部cron停止を画面上で検知できる
- **PWA対応**: ホーム画面への追加、Service Workerによるオフライン時のキャッシュ表示に対応
- **セキュリティ**: 厳格なContent-Security-Policyを設定(インラインscript不許可)。表示データはRSS由来・翻訳結果を含めすべて`textContent`経由で描画しHTML解釈させないことでXSSを防止

## 品質監査(2026-07-21)

パフォーマンス・UI/UX・デザイン・セキュリティ・SEO・アクセシビリティ・コード品質の観点で既存実装を監査し、
既存の機能・デザインコンセプト(ダーク基調+ゴールドアクセントの「金融端末」風UI)は維持したまま、
実際に検証できた問題点だけを修正した。判断の理由も含めて記録する。

### 実施した修正

- **WCAGコントラスト比の是正**: `--ink-3`(ステータス表示・フッター・時刻等の淡色テキスト)と
  `--gold-dim`(フッターリンク等)がダーク/ライト両テーマともWCAG AA(通常文字4.5:1)を満たしていなかった
  (実測: ダークテーマのink-3はカード背景に対し3.05:1、ライトテーマのgold-dimは背景bg0に対し2.22:1)。
  両テーマとも4.5:1以上になるよう調整(調整後: ダークink-3が4.71:1、ライトgold-dimが4.79:1)。
  あわせて配信元バッジ色のうち`wsj-markets`(旧`#2c2c2c`)がダークモードのカード背景でコントラスト比1.24:1
  とほぼ判読不能だったため`#9aa4b8`(6.9:1)へ変更(`sources.json`・`sources.js`両方)。
  新着バッジ・スキップリンクの文字色(gold-ink)もライトテーマのgold背景では3.7:1しか出ないため、
  この2箇所の背景だけ`color-mix()`で暗め補正(全体の`--gold`トークンは変更していない)。
- **見出し階層の是正**: 「WORLD TRADING SESSIONS」「ECONOMIC CALENDAR」がただの`<span>`で
  文書構造・スクリーンリーダーの見出しジャンプ機能から見えなかったため`<h2>`化(見た目はCSSで維持)。
- **モバイルのタップ領域拡大**: ヘッダー4ボタンを44px(iOS/Android推奨サイズ)以上に、
  チップ・検索欄・カレンダー操作ボタンも段階的に拡大(従来は実測25〜32px程度だった)。
- **パフォーマンス**: 経済指標カレンダー(TradingViewウィジェット)の初回構築を`IntersectionObserver`で
  画面近傍まで遅延し、初回表示時のネットワーク/CPUを記事一覧側へ優先。バックグラウンドタブでは
  Page Visibility APIで自動更新ポーリングを止め、復帰時に即時再取得することで通信量とバッテリーを節約。
- **入場アニメーション**: 公開60分以内(NEWバッジ対象)の記事カードにのみ、transform/opacityだけを使う
  GPU合成の入場アニメーションを追加(全カードに付けると60秒毎の自動更新で一覧全体が点滅して見えるため
  対象を絞った)。`prefers-reduced-motion`は既存の全体ルールでそのまま無効化される。
- **セキュリティヘッダー**: `Referrer-Policy: strict-origin-when-cross-origin`を追加(index.html/privacy.html両方)。
  CSPに`upgrade-insecure-requests`を追加。
- **SEO**: `WebSite`構造化データ(JSON-LD)を追加(既存の厳格なCSPを維持するため、'unsafe-inline'ではなく
  当該scriptタグ1個だけをsha256ハッシュで許可)。OGP(og:site_name/locale/image:width,height,type,alt等)と
  Twitter Cardの不足項目を補完。`theme-color`をライト/ダーク双方の実テーマに追従させる(手動切替にも対応)。

### 意図的に見送った項目とその理由

ブリーフに含まれる項目のうち、以下は「現状で問題がない」「このサイトの性質上むしろ悪化させる」
「GitHub Pages(サーバー側処理なし)という構成上実現不可能」のいずれかに該当するため見送った。

- **GSAP/Lenisの導入**: このサイトは60秒おきに記事一覧全体が自動更新される情報密度の高いダッシュボードで、
  スクロール位置維持やタッチ中の再描画抑制など、スムーズなモバイルスクロールのための仕組みは
  すでに`render.js`側でこのサイト専用にチューニング済み。ここへ汎用スクロールライブラリ(Lenis)や
  アニメーションライブラリ(GSAP、本体だけで約70KB)を追加すると、既存の自前実装と競合するリスクと
  読み込み量増加という代償に対して得られる体感差が小さいと判断した。ブリーフ内の「不要なライブラリの削除」
  「軽量化」とも整合させ、GPUアクセラレーション(transform/opacity)自体はCSSネイティブ機能で
  既に実現されている(`.card:hover`等)。導入自体は可能なので、特定のセクションに大きめの
  演出アニメーションが欲しい場合は個別に相談してほしい。
- **CSS/JSの圧縮(minify)・ビルドパイプライン導入**: 本リポジトリは意図的に「ビルド不要」を
  アーキテクチャ上の方針にしている(README冒頭参照)。GitHub Pagesはgzip/brotli圧縮を自動で行うため、
  素のテキストに対してもかなりの部分が圧縮済みで配信される。minify単体の追加効果は小さい一方、
  minifyされたコードは差分レビューもデバッグもできなくなり「可読性・保守性の向上」という
  ブリーフの別項目と正面から矛盾するため、今回は見送った。必要であれば、ソースは今のまま保ち
  デプロイ時だけ圧縮する専用のビルドステップ(GitHub Actions等)を別途追加できる。
- **アイコンのWebP/AVIF化**: PWAアイコン4種(合計約25KB、初回のみ取得)が対象だが、
  Apple Touch IconはiOS SafariがWebP/AVIFを認識せずPNG必須のため、変換するとむしろ
  iOSでの表示崩れという後退になる。記事カード自体は元々テキストのみで画像を持たないため、
  「画像のLazy Loading/次世代フォーマット化」で対象になる画像がほぼ存在しない。
- **X-Frame-Options・X-Content-Type-Options・Permissions-Policy・HSTSの明示設定**:
  いずれもHTTPレスポンスヘッダーでのみ有効な仕様で、`<meta http-equiv>`では機能しない
  (ブラウザが無視する)。GitHub Pagesはカスタムレスポンスヘッダーを設定する手段を提供していないため、
  静的ホスティングのままでは実装不可能。HSTSについては`*.github.io`ドメイン自体がブラウザの
  HSTSプリロードリストに含まれるため実質的にはHTTPS強制が効いている。上記ヘッダーをどうしても
  必要とする場合は、Cloudflare等をリバースプロキシとして前段に置く運用変更が必要になる。
- **Trusted Types(CSP)の有効化**: 自前コードは`innerHTML`等の危険なDOM書き込みを一切使っておらず
  (`grep`で確認済み)導入自体は理論上安全だが、TradingViewの外部ウィジェットスクリプトが内部で
  innerHTML相当の処理を使っている可能性を実機検証なしに否定できず、有効化するとウィジェットが
  無言で壊れるリスクがあるため見送った。
- **TypeScript化**: 「ビルド不要」方針および現在の規模(状態を持つファイルが1000行未満)に対して
  型システム導入の恩恵よりビルドステップ追加のコストが大きいと判断し見送った。

## 使い方

GitHub Pagesなどのhttp(s)ホスティングに配置して公開してください。インストールやビルドは不要です(GitHub Actions側にPython実行環境が必要ですが、GitHub Actionsが自動的に用意するため利用者側の準備は不要です)。

手元で試すときは、先に `python scripts/fetch_news.py` を実行して `news.json` を作ってください。

注意: `index.html` を `file://` で直接開いた場合、`news.json` のfetchがブラウザのローカルファイル制限で失敗するため、ライブ更新は動作しません(キャッシュが無い初回訪問では記事0件表示になります)。動作確認・開発時はローカルHTTPサーバー経由で開いてください。

### 株価現在値カード(Cloudflare Workerプロキシ)のセットアップ

記事一覧左のパネル(銘柄検索・現在値表示)はYahoo Financeのデータを使っています。TradingViewには
依存していません。

**なぜCloudflare Workerという中継サーバーが必要なのか**: Yahoo Finance
(`query1.finance.yahoo.com`)はブラウザから直接fetch()できません(`Access-Control-Allow-Origin`
ヘッダーを返さないため、CORSでブロックされる。実機確認済み)。このサイトはビルド不要の静的サイトで
サーバー側コードを持たないため、CORSを解決する軽量な中継サーバーを別途デプロイして間に挟む必要が
あります。Cloudflare Workersは無料枠(1日10万リクエストまで)があり、このためだけに使うには
十分すぎるほどです。

なお、この構成に至るまでに他の無料手段(Finnhub・Twelve Data・Stooq)も実機検証しましたが、
Finnhub・Twelve Dataはいずれも無料プランが米国上場銘柄限定(東証・LSE等の海外取引所は
「有料プラン限定」と明示的に拒否される)、Stooqは無料APIのエンドポイント自体が停止しており、
日本株を含めて動かすには今回の方式(Yahoo Finance + 自前中継サーバー)が最も確実でした。

#### デプロイ手順(無料・クレジットカード不要・所要時間5分程度)

1. **Cloudflareのアカウントを作成する**
   [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) を開き、
   メールアドレスとパスワードだけで登録します(クレジットカードの入力は不要です)。
   届いた確認メールのリンクをクリックしてメールアドレスを認証してください。

2. **Workersのダッシュボードを開く**
   ログイン後の画面(Cloudflareダッシュボード)左側のメニューから
   「**Workers & Pages**」をクリックします。

3. **新しいWorkerを作成する**
   「Create」(または「Create application」)ボタン→「**Create Worker**」を選びます。
   名前の入力欄が出るので、好きな名前を付けます(例: `yahoo-finance-proxy`)。
   ここで付けた名前がそのまま公開URLの一部になります
   (`https://yahoo-finance-proxy.あなたのサブドメイン.workers.dev` のような形)。
   名前を決めたら「Deploy」をクリックします(この時点では中身が空の雛形がデプロイされます)。

4. **コードを書き換える**
   デプロイ完了後の画面で「**Edit code**」ボタン(または「Continue to project」→
   コードエディタを開く導線)をクリックすると、ブラウザ上のコードエディタが開きます。
   エディタ内にデフォルトで入っているサンプルコードを全選択して削除し、代わりに
   このリポジトリの [`cloudflare-worker/yahoo-finance-proxy.js`](cloudflare-worker/yahoo-finance-proxy.js)
   の中身を全部コピーして貼り付けてください。

5. **保存してデプロイする**
   エディタ右上の「**Save and deploy**」(または「Deploy」)ボタンを押します。
   数秒でデプロイが完了します。

6. **公開URLを確認する**
   デプロイ後、画面上部またはWorkerの概要ページに
   `https://<付けた名前>.<あなたのサブドメイン>.workers.dev`
   という形式のURLが表示されます。これが中継サーバーのURLです。

7. **このURLを2箇所に設定する**
   - `watchlist.js` 冒頭の `const WL_PROXY_BASE_URL = '';` の `''` の中に、
     6.で確認したURL(末尾に `/` は付けない)を入力する
   - （すでにCSPは `https://*.workers.dev` を許可済みのため、CSP側の追加設定は不要です)

未設定のままでも壊れません。カードが「株価表示にはCloudflare Workerプロキシの設定が必要です」と
案内を出すだけで、他の機能には一切影響しません。

Worker側にはセキュリティのため、`cloudflare-worker/yahoo-finance-proxy.js` 内の
`ALLOWED_ORIGINS`(既定値: このリポジトリのGitHub Pages URLとCloudflare Pages URL)からのアクセスだけを許可する設定と、
銘柄コード・検索キーワードの入力検証(任意のURLを中継させられる「オープンプロキシ」化の防止)を
入れています。フォークして別ドメインで公開する場合は `ALLOWED_ORIGINS` を自分のURLに書き換えてください。

## 免責事項

本ボードは情報提供を目的としており、投資勧誘または投資助言を目的とするものではありません。記事の見出し・要約は各配信元の公開RSSフィード(Bloombergのみ例外的にGoogleニュース検索RSS)から取得し、原文へのリンクを掲載しています。機械翻訳およびセンチメント判定は簡易的な自動処理であるため、内容の正確性は必ず原文でご確認ください。取引および投資に関する最終的な判断は、ご自身の責任で行ってください。
