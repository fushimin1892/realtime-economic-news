#!/usr/bin/env python3
"""RSSフィードをサーバー側(GitHub Actions)で直接取得し、
フロントエンドが読み込む静的な news.json / sources.js を生成する。

このスクリプトは .github/workflows/fetch-news.yml から定期実行される。
配信元を追加/削除/変更したいときは sources.json を編集してこのスクリプトを再実行すること
(sources.js は自動生成物なので直接編集しない)。
"""
from __future__ import annotations

import calendar
import html
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import requests

# X(旧Twitter)の投稿取得は、ログイン不要でXの公式埋め込みウィジェットが内部で使っている
# syndication.twitter.com のエンドポイントを利用する(ユーザー自身のログインCookieは一切不要)。
# 非公開・無保証のエンドポイントのため仕様変更で壊れる可能性はあるが、個人のログイン情報を
# 使う方式(規約違反・アカウント凍結リスクあり)より安全なため、この方式のみ採用する。
X_SYNDICATION_URL = "https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}"
_NEXT_DATA_RE = re.compile(r'__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)
X_MAX_AGE_MS = 48 * 60 * 60 * 1000  # 蓄積(merge_x_items)の保持上限。単発の取得ではこの時間分を
                                     # 得ることはできない(下記の注意参照)ため、1分おきの定期実行を
                                     # 積み重ねて徐々にこの上限まで埋めていく前提の値
# 注意: このエンドポイントは期間に関係なく常に「最新約20件+固定ポスト」しか返さない(実測確認済み。
# レスポンスにカーソル類は一切なく、count等のパラメータも無視され、widgets.js自体にもページング
# 処理がなく、旧cdn.syndication.twimg.comの後継エンドポイントも空応答で廃止済み — Fable5による
# 網羅調査で確認済みで、これ以上の抜け道はない)。つまり1回の取得で得られる範囲はエンドポイント側の
# 固定件数で決まり、X_MAX_AGE_MSを直接大きくしても1回の取得結果は増えない。そのため「毎回の取得を
# 前回分と統合して蓄積する」(merge_x_items)方式を、直接取得できない場合の代替手段として採用している。

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCES_JSON_PATH = REPO_ROOT / "sources.json"
SOURCES_JS_PATH = REPO_ROOT / "js" / "sources.js"
NEWS_JSON_PATH = REPO_ROOT / "news.json"

MAX_ITEMS_PER_SOURCE = 100   # 1ソースあたりの保存件数上限(旧allorigins経由の実測値に合わせる)
DESC_MAX_LEN = 220           # 要約の切り詰め文字数(フロントエンドの旧仕様を踏襲)
FETCH_TIMEOUT_SEC = 15
FETCH_MAX_ATTEMPTS = 2       # 一時的な失敗を1回だけリトライしてから前回データへフォールバック
MAX_WORKERS = 5              # 並列取得数(相手サイトのレート制限対策。旧FETCH_CONCURRENCYを踏襲)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def strip_html(raw: str) -> str:
    """HTMLタグを除去してプレーンテキスト化する。
    フロントエンド側(utils.js の stripHtml)でも再度処理されるため簡易実装で十分
    (二重に通しても実害はなく、XSS対策の最終防衛ラインはクライアント側に置いてある)。
    """
    if not raw:
        return ""
    text = _TAG_RE.sub("", raw)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def to_epoch_ms(struct_time) -> int | None:
    """feedparserのtime.struct_time(UTCに正規化済みだがtzinfoは持たない)をepochミリ秒に変換する。
    time.mktime()はローカルタイムゾーンで解釈するため、JST環境で実行すると9時間ズレる
    (GitHub Actionsランナー上はUTCなので気づきにくい) — 必ずcalendar.timegm()を使うこと。
    """
    if struct_time is None:
        return None
    return calendar.timegm(struct_time) * 1000


def extract_desc(entry) -> str:
    """RSSの<description>/Atomの<summary>/<content>のどれに入っていても取り出す。"""
    summary = entry.get("summary")
    if summary:
        return summary
    content_list = entry.get("content")
    if content_list:
        return content_list[0].get("value", "")
    return ""


# Google Newsのsite:検索RSS(bloomberg-jp)はdescriptionが「見出しへのリンク+配信元名」の
# HTMLスニペットにすぎず、見出しの実質的な重複でしかないため要約として表示する意味がない。
# 空にしておく(X系のitemがdescを持たないのと同じ考え方)。
_DESC_BLANK_SOURCE_IDS = {"bloomberg-jp"}


def normalize_entry(entry, source: dict) -> dict:
    pub_struct = entry.get("published_parsed") or entry.get("updated_parsed")
    desc = "" if source["id"] in _DESC_BLANK_SOURCE_IDS else strip_html(extract_desc(entry))[:DESC_MAX_LEN]
    return {
        "title": strip_html(entry.get("title", "")),
        "link": entry.get("link", ""),
        "desc": desc,
        "pubDate": to_epoch_ms(pub_struct),
    }


def load_sources() -> list[dict]:
    with SOURCES_JSON_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_sources(sources: list[dict]) -> list[dict]:
    """sources.jsonの各エントリに必須フィールドが揃っているか事前検証する。
    検証なしだと、1件でも"id"等の必須キーが欠けているとmain()側の辞書内包表記
    (source["id"]をキーにする箇所)でKeyErrorが発生し、他の全ソースの取得も含めて
    パイプライン全体がクラッシュしnews.jsonが更新されなくなる。ここで不正なエントリだけを
    除外しておけば、残りのソースは通常通り取得できる。
    """
    valid = []
    for i, source in enumerate(sources):
        if not isinstance(source, dict) or not source.get("id"):
            print(f"::warning::sources.json[{i}]は'id'が無いため除外します")
            continue
        if source.get("type") == "x":
            if not source.get("xHandle"):
                print(f"::warning::{source['id']}: type=xですが'xHandle'が無いため除外します")
                continue
        elif not source.get("rss"):
            print(f"::warning::{source['id']}: 'rss'が無いため除外します")
            continue
        valid.append(source)
    return valid


def generate_sources_js(sources: list[dict]) -> None:
    """sources.json から sources.js(フロントエンドが<script src>で読み込むJS)を再生成する。"""
    body = json.dumps(sources, ensure_ascii=False, indent=2)
    js = (
        "'use strict';\n"
        "\n\n\n"
        "const SOURCES = " + body + ";\n"
    )
    SOURCES_JS_PATH.write_text(js, encoding="utf-8")


def load_previous_items() -> dict[str, list[dict]]:
    """前回の news.json を読み込む(取得失敗ソースのフォールバック用)。初回実行時は空。"""
    if not NEWS_JSON_PATH.exists():
        return {}
    try:
        with NEWS_JSON_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("items", {})
    except (json.JSONDecodeError, OSError):
        return {}


# 一部サイトはRSSのtitleに見出し以外の文字列(サイト名・カテゴリ名)をliteralに付与している。
# 東洋経済オンラインは "見出し | カテゴリ | 東洋経済オンライン" の形式で、「東洋経済オンライン」
# 自体に「経済」が、カテゴリラベルにも「政治・経済・投資」等がそのまま含まれるため、記事の実際の
# 内容に関わらずトピック絞込のキーワードに誤爆し続けていた(全記事が絞込を素通りしてしまう
# バグとして発覚)。Bloomberg(Google Newsのsite:検索RSS経由)は "見出し - Bloomberg.com" の形式で
# 末尾にサイト名が付く。いずれも見出しの可読性を下げるだけでなく前者は実害のあるバグの原因だったため、
# ソースごとに末尾の除去ルールを定義しておく。
_TITLE_SUFFIX_STRIPPERS = {
    "toyokeizai": lambda title: title.split(" | ")[0].strip(),
    "bloomberg-jp": lambda title: (
        title[: -len(" - Bloomberg.com")].strip() if title.endswith(" - Bloomberg.com") else title
    ),
}


def strip_title_suffix(title: str, source: dict) -> str:
    stripper = _TITLE_SUFFIX_STRIPPERS.get(source["id"])
    return stripper(title) if stripper else title


def fetch_rss_items(source: dict) -> list[dict]:
    response = requests.get(
        source["rss"],
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        timeout=FETCH_TIMEOUT_SEC,
    )
    response.raise_for_status()
    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"parse error: {parsed.bozo_exception}")
    items = [normalize_entry(entry, source) for entry in parsed.entries[:MAX_ITEMS_PER_SOURCE]]
    for item in items:
        item["title"] = strip_title_suffix(item["title"], source)
    return items


def normalize_tweet(tweet: dict) -> dict:
    """syndication.twitter.comのtweetオブジェクトを既存のitem形式に正規化する。
    投稿は短文で見出し/本文の区別がないため、titleに全文、descは空にする。
    """
    pub_date = None
    created_at = tweet.get("created_at")  # 例: "Thu Apr 30 12:50:01 +0000 2026"
    if created_at:
        try:
            pub_date = int(datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y").timestamp() * 1000)
        except ValueError:
            pub_date = None
    permalink = tweet.get("permalink", "")
    return {
        "title": strip_html(tweet.get("full_text") or tweet.get("text") or ""),
        "link": ("https://x.com" + permalink) if permalink else "",
        "desc": "",
        "pubDate": pub_date,
    }


def fetch_x_items(source: dict) -> list[dict]:
    """X(旧Twitter)の公式埋め込みウィジェットが使う公開エンドポイントから投稿を取得する。
    ログイン不要・Cookie不要(ユーザー自身のXアカウント情報は一切使わない)。
    非公開・無保証のエンドポイントのため、レスポンス構造が変わった場合はValueErrorとして
    失敗扱いにし、呼び出し側の前回データ引き継ぎに委ねる。
    """
    response = requests.get(
        X_SYNDICATION_URL.format(handle=source["xHandle"]),
        headers={"User-Agent": USER_AGENT},
        timeout=FETCH_TIMEOUT_SEC,
    )
    response.raise_for_status()
    match = _NEXT_DATA_RE.search(response.text)
    if not match:
        raise ValueError("__NEXT_DATA__ not found (syndication endpoint may have changed)")
    data = json.loads(match.group(1))
    entries = data["props"]["pageProps"]["timeline"]["entries"]
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    max_age = source.get("maxAgeMs", X_MAX_AGE_MS)  # merge_x_items側と同じ基準を使う(食い違うと
                                                      # source側の設定を大きくしても後段のmerge_x_items
                                                      # に届く前にここで削られ、蓄積が48時間で頭打ちになる)
    items = []
    for entry in entries:
        if entry.get("type") != "tweet":
            continue
        tweet = entry["content"]["tweet"]
        if tweet.get("retweeted_status") is not None:
            continue  # リツイートは表示しない(本人の発信ではないため)
        item = normalize_tweet(tweet)
        if item["pubDate"] is not None and (now_ms - item["pubDate"]) > max_age:
            continue  # maxAgeMsより古い投稿は保存しない(通常は無意味 -- 単発の取得は
                      # 常に直近3〜4時間分しか返らないため -- だが保険として残している)
        items.append(item)
    items.sort(key=lambda it: it["pubDate"] or 0, reverse=True)  # ピン留め投稿が先頭に来るのを正規の時系列順に戻す
    return items[:MAX_ITEMS_PER_SOURCE]


def merge_x_items(fresh: list[dict], previous: list[dict], source: dict) -> list[dict]:
    """X系ソースはsyndicationエンドポイントの仕様上、1回の取得では常に最新約20件程度しか
    得られない(ページング手段が存在しないことを実測で確認済み。X_MAX_AGE_MS付近のコメント参照)。
    そのため成功時も前回分を破棄せず統合し、1分おきの定期実行を重ねることで実質的なカバレッジを
    maxAgeMs(sources.jsonで指定、既定はX_MAX_AGE_MS)いっぱいまで徐々に広げていく。
    リンクで重複排除し(新しい方の内容を優先)、鮮度上限を超えたものは捨てる。
    """
    max_age = source.get("maxAgeMs", X_MAX_AGE_MS)
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    by_link: dict[str, dict] = {}
    for item in previous + fresh:  # freshを後に処理し、同一linkならfresh側の内容で上書きする
        link = item.get("link")
        if not link:
            continue
        if item.get("pubDate") is not None and (now_ms - item["pubDate"]) > max_age:
            continue
        by_link[link] = item
    merged = sorted(by_link.values(), key=lambda it: it["pubDate"] or 0, reverse=True)
    return merged[:MAX_ITEMS_PER_SOURCE]


def fetch_source(source: dict) -> tuple[str, list[dict] | None, str | None]:
    """1ソースを取得・パースする。
    戻り値: (source_id, items, error)
      - 成功時: items は記事リスト(0件も正常。フィードが単に何も新着を出していないだけの場合がある)、error は None
      - 失敗時: items は None、error は原因の文字列(呼び出し側で前回データへのフォールバックに使う)
    """
    source_id = source["id"]
    last_error = None
    for attempt in range(1, FETCH_MAX_ATTEMPTS + 1):
        try:
            if source.get("type") == "x":
                items = fetch_x_items(source)
            else:
                items = fetch_rss_items(source)
            return source_id, items, None
        except Exception as exc:  # noqa: BLE001 -- どんな例外でも他ソースの取得は止めない
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < FETCH_MAX_ATTEMPTS:
                time.sleep(2)
    return source_id, None, last_error


def main() -> None:
    sources = validate_sources(load_sources())
    generate_sources_js(sources)
    source_by_id = {source["id"]: source for source in sources}

    previous_items = load_previous_items()
    result_items: dict[str, list[dict]] = {}
    failed_ids: list[str] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_source, source): source["id"] for source in sources}
        for future in as_completed(futures):
            source_id, items, error = future.result()
            if items is not None:
                source = source_by_id[source_id]
                if source.get("type") == "x":
                    # X系は成功時も前回分と統合する(理由はmerge_x_itemsのdocstring参照)
                    items = merge_x_items(items, previous_items.get(source_id, []), source)
                result_items[source_id] = items
                print(f"OK   {source_id}: {len(items)} items")
            else:
                # 取得/パース失敗 -- 前回分をそのまま引き継ぐ(pubDateは書き換えない。
                # これによりフロントエンドの鮮度フィルタ(feed.jsのMAX_AGE_MS)が自然なTTLとして働き、
                # 恒久的に死んだフィードの記事は手動で消さなくても期限が切れれば自動的に表示から消える)
                carried = previous_items.get(source_id, [])
                result_items[source_id] = carried
                failed_ids.append(source_id)
                print(f"FAIL {source_id}: {error} (前回分{len(carried)}件を引き継ぎ)")

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "items": result_items,
    }
    with NEWS_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    ok_count = len(sources) - len(failed_ids)
    print(f"\n合計 {len(sources)} ソース中 {ok_count} 件成功、{len(failed_ids)} 件失敗")
    if failed_ids:
        print("失敗ソース: " + ", ".join(failed_ids))


if __name__ == "__main__":
    main()
