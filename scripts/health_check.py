"""
外部依存API(株価取得用Cloudflare Worker・翻訳API)の死活監視。

fetch_news.py と同じワークフロー(GitHub Actions、外部cronから毎分workflow_dispatch)に
相乗りして実行する。GitHub組み込みのschedule(cron)はこのリポジトリでほぼ発火しない
実績があり不採用にしているため(fetch-news.ymlのコメント参照)、既に確実に毎分動いている
このトリガーに乗るのが最も確実。

ただし外部APIを毎分叩くのは負荷・レート制限の観点で望ましくないため、内部で
CHECK_INTERVAL_MINUTES未満の間隔では実際のチェックをスキップする(status.jsonの
checkedAtを見て判断)。

status.json(フロントエンドが読み込み、異常時に警告バナーを出す)と、異常検知時は
GitHub Issueの自動作成/復旧時のクローズを行う。
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
STATUS_JSON_PATH = REPO_ROOT / "status.json"

CHECK_INTERVAL_MINUTES = 20  # この間隔未満なら外部APIへ再チェックしない
REQUEST_TIMEOUT = 15

# watchlist.js の WL_PROXY_BASE_URL と同じ値。テスト用に安定して存在する銘柄(Apple)を使う
STOCK_PROXY_URL = "https://yahoo-finance-proxy.r59538904.workers.dev/quote?symbol=AAPL"
MYMEMORY_URL = "https://api.mymemory.translated.net/get?q=hello&langpair=en|ja"
GOOGLE_TRANSLATE_URL = (
    "https://translate.googleapis.com/translate_a/single"
    "?client=gtx&sl=en&tl=ja&dt=t&q=hello"
)

GITHUB_API = "https://api.github.com"
ISSUE_TITLE = "⚠️ API死活監視: 外部サービスに異常を検知"
ISSUE_LABEL = "health-check"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_previous_status() -> dict:
    if not STATUS_JSON_PATH.exists():
        return {}
    try:
        return json.loads(STATUS_JSON_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def minutes_since(iso_ts: str | None) -> float:
    if not iso_ts:
        return float("inf")
    try:
        then = datetime.fromisoformat(iso_ts)
    except ValueError:
        return float("inf")
    return (datetime.now(timezone.utc) - then).total_seconds() / 60


def check_stock_proxy() -> tuple[bool, str | None]:
    """株価プロキシ(Cloudflare Worker)。フォールバック無しの機能のため単体で死活判定する。"""
    try:
        resp = requests.get(STOCK_PROXY_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        price = data.get("chart", {}).get("result", [{}])[0].get("meta", {}).get("regularMarketPrice")
        if price is None:
            return False, "regularMarketPriceがレスポンスに含まれていない"
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def check_translate() -> tuple[bool, str | None]:
    """翻訳(MyMemory→Google翻訳の2段フォールバック)。両方失敗した時だけ異常とする
    (MyMemory単体の429/クォータ超過はtranslate.js側で正常にフォールバックする既知の挙動のため)。"""
    errors = []
    try:
        resp = requests.get(MYMEMORY_URL, timeout=REQUEST_TIMEOUT)
        data = resp.json()
        status = data.get("responseStatus")
        text = (data.get("responseData") or {}).get("translatedText", "")
        if resp.ok and status == 200 and text and "MYMEMORY WARNING" not in text.upper():
            return True, None
        errors.append(f"mymemory: status={status}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"mymemory: {type(exc).__name__}: {exc}")

    try:
        resp = requests.get(GOOGLE_TRANSLATE_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        translated = "".join(seg[0] for seg in data[0] if seg and seg[0])
        if translated:
            return True, None
        errors.append("google: 空の翻訳結果")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"google: {type(exc).__name__}: {exc}")

    return False, " / ".join(errors)


def find_open_issue(session: requests.Session, repo: str) -> dict | None:
    resp = session.get(
        f"{GITHUB_API}/repos/{repo}/issues",
        params={"state": "open", "labels": ISSUE_LABEL, "per_page": 5},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    issues = resp.json()
    return issues[0] if issues else None


def create_issue(session: requests.Session, repo: str, body: str) -> None:
    session.post(
        f"{GITHUB_API}/repos/{repo}/issues",
        json={"title": ISSUE_TITLE, "body": body, "labels": [ISSUE_LABEL]},
        timeout=REQUEST_TIMEOUT,
    ).raise_for_status()


def close_issue(session: requests.Session, repo: str, issue_number: int, body: str) -> None:
    session.post(
        f"{GITHUB_API}/repos/{repo}/issues/{issue_number}/comments",
        json={"body": body},
        timeout=REQUEST_TIMEOUT,
    ).raise_for_status()
    session.patch(
        f"{GITHUB_API}/repos/{repo}/issues/{issue_number}",
        json={"state": "closed"},
        timeout=REQUEST_TIMEOUT,
    ).raise_for_status()


def sync_github_issue(services: dict) -> None:
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        print("::warning::GITHUB_TOKEN/GITHUB_REPOSITORYが無いためIssue連携をスキップします")
        return

    failed = {name: info for name, info in services.items() if not info["ok"]}
    session = requests.Session()
    session.headers.update(
        {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    )

    try:
        existing = find_open_issue(session, repo)
    except Exception as exc:  # noqa: BLE001
        print(f"::warning::既存Issueの確認に失敗しました: {exc}")
        return

    if failed:
        if existing:
            return  # 既にIssueが開いている間は同じ内容で連投しない
        body_lines = ["以下の外部サービスで異常を検知しました(自動チェック)。\n"]
        for name, info in failed.items():
            body_lines.append(f"- **{name}**: {info['error']}")
        body_lines.append(f"\n検知時刻: {now_iso()}")
        try:
            create_issue(session, repo, "\n".join(body_lines))
        except Exception as exc:  # noqa: BLE001
            print(f"::warning::Issue作成に失敗しました: {exc}")
    else:
        if existing:
            try:
                close_issue(
                    session, repo, existing["number"],
                    f"すべてのサービスが復旧しました({now_iso()})。自動クローズします。",
                )
            except Exception as exc:  # noqa: BLE001
                print(f"::warning::Issueクローズに失敗しました: {exc}")


def main() -> None:
    previous = load_previous_status()
    if minutes_since(previous.get("checkedAt")) < CHECK_INTERVAL_MINUTES:
        print("前回チェックから間もないためスキップします")
        return

    stock_ok, stock_err = check_stock_proxy()
    translate_ok, translate_err = check_translate()

    services = {
        "stockQuote": {"ok": stock_ok, "error": stock_err},
        "translate": {"ok": translate_ok, "error": translate_err},
    }
    status = {
        "checkedAt": now_iso(),
        "ok": stock_ok and translate_ok,
        "services": services,
    }
    STATUS_JSON_PATH.write_text(
        json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(status, ensure_ascii=False, indent=2))

    sync_github_issue(services)


if __name__ == "__main__":
    main()
