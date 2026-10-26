#!/usr/bin/env python3
"""새로 수집한 뉴스를 data/news.json, data/paraguay.json에 합친다.

- URL·날짜·제목이 같은 기사는 하나만 남긴다(새 내용으로 덮어씀).
- 사건 날짜가 최근 7일(한국 시간 기준 오늘 포함)을 벗어난 뉴스는 지운다.
- 형식이 틀린 항목은 버리고 이유를 출력한다.

사용법:
  python3 scripts/merge_news.py --news new1.json [new2.json ...] [--paraguay py.json]
  python3 scripts/merge_news.py --check   # 현재 데이터만 검사·정리
"""
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEWS = ROOT / "data" / "news.json"
PARAGUAY = ROOT / "data" / "paraguay.json"

KST = timezone(timedelta(hours=9))
COUNTRIES = "MX GT BZ HN SV NI CR PA AR BO BR CL CO EC GY PY PE SR UY VE".split()
CATEGORIES = {"정세", "정치·사회", "보건의료"}
IMPORTANCE = {"high", "medium", "low"}
NEWS_DAYS = 7      # 지도·파라과이 뉴스 보존 기간
REG_DAYS = 30      # 보건·규제 동향 보존 기간 (고시는 드물어서 더 길게 둔다)


def load(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def valid_date(s):
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (TypeError, ValueError):
        return False


def check_news(n):
    if n.get("country") not in COUNTRIES:
        return "country"
    if n.get("category") not in CATEGORIES:
        return "category"
    if n.get("importance") not in IMPORTANCE:
        return "importance"
    if not valid_date(n.get("date")):
        return "date"
    if not str(n.get("url", "")).startswith(("http://", "https://")):
        return "url"
    if not n.get("title_ko"):
        return "title_ko"
    return None


def check_reg(n):
    if n.get("importance") not in IMPORTANCE:
        return "importance"
    if not valid_date(n.get("date")):
        return "date"
    if not str(n.get("url", "")).startswith(("http://", "https://")):
        return "url"
    if not n.get("title_ko"):
        return "title_ko"
    return None


def key(n):
    # 목록 페이지 URL을 여러 기사가 함께 쓰는 경우가 있어 날짜·제목까지 묶어 구분한다
    return (n["url"], n["date"], n.get("title_ko", "")[:20])


def merge(old, new, checker, cutoff, label):
    by_url = {key(n): n for n in old}
    for n in new:
        why = checker(n)
        if why:
            print(f"  [버림] {label} {why}: {n.get('title_ko') or n.get('url')}", file=sys.stderr)
            continue
        by_url[key(n)] = n
    kept = [n for n in by_url.values() if n["date"] >= cutoff]
    kept.sort(key=lambda n: (n["date"], n.get("country", "")), reverse=True)
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--news", nargs="*", default=[], help="새 뉴스 JSON 배열 파일들")
    ap.add_argument("--paraguay", help="파라과이 JSON 객체 파일 {news, regulatory, indicators}")
    ap.add_argument("--check", action="store_true", help="현재 데이터만 정리")
    args = ap.parse_args()

    today = datetime.now(KST).date()
    news_cutoff = (today - timedelta(days=NEWS_DAYS - 1)).isoformat()
    reg_cutoff = (today - timedelta(days=REG_DAYS - 1)).isoformat()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    store = load(NEWS, {"updated_at": None, "items": []})
    py = load(PARAGUAY, {"updated_at": None, "regulatory": [], "indicators": []})

    incoming = []
    for f in args.news:
        incoming += json.loads(Path(f).read_text(encoding="utf-8"))
    py_new = {}
    if args.paraguay:
        py_new = json.loads(Path(args.paraguay).read_text(encoding="utf-8"))
        incoming += py_new.get("news", [])

    store["items"] = merge(store["items"], incoming, check_news, news_cutoff, "뉴스")
    py["regulatory"] = merge(py.get("regulatory", []), py_new.get("regulatory", []), check_reg, reg_cutoff, "규제")
    if py_new.get("indicators"):
        py["indicators"] = py_new["indicators"]

    if incoming or py_new or not store.get("updated_at"):
        store["updated_at"] = now
        py["updated_at"] = now
    save(NEWS, store)
    save(PARAGUAY, py)

    counts = {c: 0 for c in COUNTRIES}
    for n in store["items"]:
        counts[n["country"]] += 1
    print(f"기간 {news_cutoff} ~ {today} · 뉴스 {len(store['items'])}건 · 규제 {len(py['regulatory'])}건")
    print(" ".join(f"{c}:{counts[c]}" for c in COUNTRIES))
    empty = [c for c in COUNTRIES if counts[c] == 0]
    if empty:
        print("뉴스 없는 나라: " + ", ".join(empty))


if __name__ == "__main__":
    main()
