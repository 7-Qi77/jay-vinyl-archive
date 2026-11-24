# -*- coding: utf-8 -*-
"""
扫描 assets/audio/ 下的本地音频，按文件名匹配曲目，生成 manifest.json。
放入新音频（如 晴天.mp3 / 晴天-周杰伦.mp3）后重跑本脚本即可被页面识别。
用法：python tools/scan-audio.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_EXTS = {".mp3", ".m4a", ".flac", ".wav", ".ogg"}

T2S = str.maketrans("愛龍捲風簡單雙開靜獸島鐵號後戰東藉擱淺園遊髮楓聽媽話約說蘭煙見會飛淚緒驚嘆嗎傷紅塵棧鐘裡陽麼寫從聲邊氣該偉顏妳著説涙晩録帶",
                    "爱龙卷风简单双开静兽岛铁号后战东借搁浅园游发枫听妈话约说兰烟见会飞泪绪惊叹吗伤红尘栈钟里阳么写从声边气该伟颜你着说泪晚录带")


def norm(s):
    return re.sub(r"[\s·・.\-–—_()（）\[\]【】'\"!！?？,，]", "", s.translate(T2S).lower())


def read_albums():
    text = (ROOT / "js" / "data.js").read_text(encoding="utf-8")
    albums = []
    for m in re.finditer(r"n:\s*(\d+),.*?title:\s*'([^']*)'.*?tracks:\s*\[(.*?)\]", text, re.S):
        n, title, tracks = m.groups()
        albums.append({"n": int(n), "title": title, "tracks": re.findall(r"'([^']*)'", tracks)})
    return albums


def main():
    folder = ROOT / "assets" / "audio"
    folder.mkdir(parents=True, exist_ok=True)
    albums = read_albums()
    index = {}
    for a in albums:
        for i, t in enumerate(a["tracks"]):
            index[norm(t)] = {"title": t, "album": a["n"], "track": i}

    files, skipped = [], []
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() not in AUDIO_EXTS:
            continue
        stem = norm(p.stem)
        hit = index.get(stem)
        if not hit:  # 去掉 “-周杰伦” 之类后缀再试
            stem2 = re.sub(r"周杰伦.*$", "", stem)
            hit = index.get(stem2)
        if hit:
            files.append({**hit, "file": p.name})
        else:
            skipped.append(p.name)

    manifest = {"files": files}
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"matched {len(files)} file(s):")
    for f in files:
        print(f"  {f['file']} -> 专辑{f['album']} #{f['track'] + 1} {f['title']}")
    if skipped:
        print("unmatched:", ", ".join(skipped))

    # 歌词索引：assets/lyrics/<曲名>.json(逐字) / .lrc / .txt
    lyric_dir = ROOT / "assets" / "lyrics"
    lyric_dir.mkdir(parents=True, exist_ok=True)
    titles = {t for a in albums for t in a["tracks"]}
    lindex = {}
    for p in sorted(lyric_dir.iterdir()):
        stem = p.stem
        if stem not in titles:
            continue
        e = lindex.setdefault(stem, {})
        if p.suffix == ".json":
            e["karaoke"] = p.name
        elif p.suffix == ".lrc":
            e["lrc"] = p.name
        elif p.suffix == ".txt":
            e["txt"] = p.name
    (lyric_dir / "index.json").write_text(json.dumps(lindex, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"lyrics index: {len(lindex)} title(s)")


if __name__ == "__main__":
    main()