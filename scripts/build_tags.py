"""Build the tag data used by the UI from a Danbooru tag CSV + Danbooru "tag group" wiki pages.

  public/data/tags.json        [[tag, posts, "aliases"?], ...]  general tags, for search / autocomplete
  public/data/tag_groups.json  {sections: [{id, label, group, subsections: [{title, tags: [{t, n}]}]}]}

CSV format (one row per tag):  tag,category,post_count,"alias1,alias2"
Wiki pages are cached in scripts/wiki_cache/ (use --refresh to re-download).

Usage:  python3 scripts/build_tags.py path/to/danbooru.csv [--min-count 50] [--group-min-count 100] [--refresh]
"""
import argparse
import csv
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CACHE = Path(__file__).resolve().parent / "wiki_cache"
UA = "prompt-builder/0.1 (local tag list builder)"

# (danbooru tag group slug, label, browser group). Order here = order in the tag browser.
SECTIONS = [
    ("hair_color", "Hair color", "Appearance"),
    ("hair_styles", "Hair style", "Appearance"),
    ("eyes_tags", "Eyes", "Appearance"),
    ("ears_tags", "Ears", "Appearance"),
    ("skin_color", "Skin", "Appearance"),
    ("breasts_tags", "Breasts", "Appearance"),
    ("body_parts", "Body", "Appearance"),
    ("wings", "Wings", "Appearance"),
    ("makeup", "Makeup", "Appearance"),
    ("face_tags", "Face & emotions", "Expression"),
    ("posture", "Posture", "Pose"),
    ("gestures", "Gestures", "Pose"),
    ("hands", "Hands", "Pose"),
    ("attire", "Clothing", "Clothing"),
    ("headwear", "Headwear", "Clothing"),
    ("neck_and_neckwear", "Neckwear", "Clothing"),
    ("sleeves", "Sleeves", "Clothing"),
    ("handwear", "Handwear", "Clothing"),
    ("legwear", "Legwear", "Clothing"),
    ("eyewear", "Eyewear", "Clothing"),
    ("accessories", "Accessories", "Clothing"),
    ("fashion_style", "Fashion style", "Clothing"),
]

HEADING = re.compile(r"^h[1-6](?:#[\w-]+)?\.\s*(.+)$")
LINK = re.compile(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]")


def load_csv(path: Path) -> dict[str, tuple[int, int, str]]:
    """tag -> (category, posts, aliases)"""
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.reader(f):
            if len(r) >= 3 and r[2].isdigit():
                out[r[0]] = (int(r[1]) if r[1].isdigit() else -1, int(r[2]), r[3] if len(r) > 3 else "")
    return out


def fetch_wiki(slug: str, refresh: bool) -> str | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / f"{slug}.txt"
    if cache.exists() and not refresh:
        return cache.read_text(encoding="utf-8")
    req = urllib.request.Request(f"https://danbooru.donmai.us/wiki_pages/tag_group:{slug}.json", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.load(r)["body"]
    except Exception as e:  # noqa: BLE001
        print(f"  ! {slug}: {e}")
        return None
    cache.write_text(body, encoding="utf-8")
    time.sleep(0.7)  # be polite to danbooru
    return body


def parse_wiki(body: str) -> list[tuple[str, list[str]]]:
    """[(subsection heading, [tags...])] in page order."""
    subs: list[tuple[str, list[str]]] = [("General", [])]
    for line in body.splitlines():
        line = line.strip()
        m = HEADING.match(line)
        if m:
            title = re.sub(r"\[\[([^\]|]+\|)?([^\]]+)\]\]", r"\2", m.group(1)).strip().strip('"')
            subs.append((title, []))
            continue
        for link in LINK.findall(line):
            t = link.strip().lower().replace(" ", "_")
            if not t.startswith(("tag_group:", "list_of", "howto:", "help:", "about:")):
                subs[-1][1].append(t)
    return [(h, list(dict.fromkeys(ts))) for h, ts in subs if ts]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", type=Path)
    ap.add_argument("--min-count", type=int, default=50, help="search list: drop tags with fewer posts")
    ap.add_argument("--group-min-count", type=int, default=100, help="tag browser: drop tags with fewer posts")
    ap.add_argument("--refresh", action="store_true", help="re-download wiki pages")
    a = ap.parse_args()
    tags = load_csv(a.csv)
    OUT.mkdir(parents=True, exist_ok=True)

    rows = [[t, n] + ([al] if al else []) for t, (cat, n, al) in tags.items() if cat == 0 and n >= a.min_count]
    rows.sort(key=lambda r: -r[1])
    (OUT / "tags.json").write_text(json.dumps(rows, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} tags -> tags.json")

    sections = []
    for slug, label, group in SECTIONS:
        body = fetch_wiki(slug, a.refresh)
        if body is None:
            continue
        subs = []
        for heading, ts in parse_wiki(body):
            known = [t for t in ts if t in tags and tags[t][0] == 0 and tags[t][1] >= a.group_min_count]
            if known:
                subs.append({"title": heading, "tags": [{"t": t, "n": tags[t][1]} for t in known]})
        print(f"  {group:10} {label:16} {sum(len(s['tags']) for s in subs):5} tags")
        sections.append({"id": slug, "label": label, "group": group, "subsections": subs})
    (OUT / "tag_groups.json").write_text(json.dumps({"sections": sections}, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print("-> tag_groups.json")


if __name__ == "__main__":
    main()
