# -*- coding: utf-8 -*-
"""
构建曲目元数据 assets/track-meta.json：
  1. iTunes 官方目录（tw 区）抓取 15 张专辑的曲目：trackId / 30s 试听 URL / 时长。
  2. lrclib.net 匹配同步歌词，记录歌词 ID（运行时按 ID 取词，本机缓存）。
只保存 URL 与 ID，不下载、不打包任何音频或歌词内容。
用法：python tools/build-meta.py
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (VinylArchive build script)", "Accept": "application/json"}

# 繁→简（覆盖本项目曲目/专辑名用字）
T2S = str.maketrans(
    "愛龍捲風簡單雙開靜獸島鐵號後戰東藉擱淺園遊髮楓聽媽話約說蘭煙見會飛淚緒驚嘆嗎傷紅塵棧鐘裡陽麼寫從聲邊氣該偉顏妳著説涙晩録帶",
    "爱龙卷风简单双开静兽岛铁号后战东借搁浅园游发枫听妈话约说兰烟见会飞泪绪惊叹吗伤红尘栈钟里阳么写从声边气该伟颜你着说泪晚录带",
)


def norm(s: str) -> str:
    s = s.translate(T2S).lower()
    return re.sub(r"[\s·・.\-–—_()（）\[\]【】'\"!！?？,，]", "", s)


def http_json(url: str, timeout=25, retries=2):
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if i == retries:
                raise
        except Exception:
            if i == retries:
                raise
        time.sleep(1.2 * (i + 1))
    return None


def read_albums():
    text = (ROOT / "js" / "data.js").read_text(encoding="utf-8")
    albums = []
    for m in re.finditer(r"n:\s*(\d+),.*?title:\s*'([^']*)'.*?itunesId:\s*(\d+),.*?tracks:\s*\[(.*?)\]", text, re.S):
        n, title, iid, tracks = m.groups()
        titles = re.findall(r"'([^']*)'", tracks)
        albums.append({"n": int(n), "title": title, "itunesId": int(iid), "tracks": titles})
    return albums


def match_track(wanted, songs):
    w = norm(wanted)
    for s in songs:
        if norm(s.get("trackName", "")) == w:
            return s
    for s in songs:  # 容错：去掉括号注释后再比
        base = re.sub(r"[（(].*?[)）]", "", s.get("trackName", ""))
        if norm(base) == w:
            return s
    return None


def lrclib_match(title, album_title, duration_s):
    base = "https://lrclib.net/api"
    q = urllib.parse.urlencode(
        {"track_name": title, "artist_name": "周杰伦", "album_name": album_title, "duration": duration_s}
    )
    try:
        hit = http_json(f"{base}/get?{q}", timeout=25, retries=1)
        if hit and hit.get("syncedLyrics"):
            return hit["id"], True
        if hit:
            got_plain = hit["id"]
        else:
            got_plain = None
    except Exception:
        got_plain = None
    # search 兜底
    try:
        q2 = urllib.parse.urlencode({"track_name": title, "artist_name": "周杰伦"})
        rows = http_json(f"{base}/search?{q2}", timeout=30, retries=1) or []
        best, best_score = None, -1
        for r in rows:
            if norm(r.get("trackName", "")) != norm(title):
                continue
            score = 0
            if r.get("syncedLyrics"):
                score += 10
            d = r.get("duration") or 0
            if duration_s and abs(d - duration_s) <= 3:
                score += 5
            elif duration_s and abs(d - duration_s) <= 8:
                score += 2
            if norm(r.get("albumName", "")) == norm(album_title):
                score += 3
            if score > best_score:
                best, best_score = r, score
        if best:
            return best["id"], bool(best.get("syncedLyrics"))
    except Exception:
        pass
    return got_plain, False


def main():
    albums = read_albums()
    out = {"version": 1, "generatedAt": int(time.time()), "albums": {}}
    problems = []
    for a in albums:
        url = f"https://itunes.apple.com/lookup?id={a['itunesId']}&entity=song&country=tw&limit=100"
        data = http_json(url)
        songs = [r for r in (data or {}).get("results", []) if r.get("kind") == "song"]
        print(f"[{a['n']:02d}] {a['title']} — iTunes {len(songs)} songs", flush=True)
        entries = []
        for t in a["tracks"]:
            s = match_track(t, songs)
            if not s:
                problems.append(f"{a['title']} / {t}: iTunes 未匹配")
                entries.append({"title": t})
                continue
            dur_ms = s.get("trackTimeMillis") or 0
            entry = {
                "title": t,
                "trackId": s.get("trackId"),
                "trackNumber": s.get("trackNumber"),
                "previewUrl": s.get("previewUrl"),
                "durationMs": dur_ms,
            }
            lid, synced = lrclib_match(t, a["title"], round(dur_ms / 1000))
            if lid:
                entry["lrclibId"] = lid
                entry["hasSynced"] = synced
            else:
                problems.append(f"{a['title']} / {t}: lrclib 未匹配")
            entries.append(entry)
            print(f"    {t}: id={entry.get('trackId')} preview={'Y' if entry.get('previewUrl') else 'N'} "
                  f"lyrics={lid or '-'}{'(synced)' if synced else ''}", flush=True)
            time.sleep(0.25)
        out["albums"][str(a["n"])] = {"itunesId": a["itunesId"], "tracks": entries}
        time.sleep(0.2)

    dest = ROOT / "assets" / "track-meta.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nwritten: {dest}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  -", p)
    else:
        print("all tracks matched.")


if __name__ == "__main__":
    sys.exit(main())