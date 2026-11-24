#!/usr/bin/env python3
"""合成 js/pixel-room.js：把 pixel-worlds skill 的 kit.js 内嵌为私有 kitRoot，
再拼接 tools/pixel-room-part2.js（<pixel-room> 组件），输出单文件、不污染全局。

用法：python tools/build-pixel-room.py
依赖：assets/vendor/pixel-worlds-skill/kit.js（vendor 副本，MIT）
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "assets" / "vendor" / "pixel-worlds-skill" / "kit.js"
PART2 = ROOT / "tools" / "pixel-room-part2.js"
OUT = ROOT / "js" / "pixel-room.js"

TAIL_OLD = "})(typeof window !== 'undefined' ? window : globalThis);"
TAIL_NEW = "})(kitRoot);"


def main() -> None:
    kit = KIT.read_text(encoding="utf-8")
    if TAIL_OLD not in kit:
        raise SystemExit("kit.js 尾调用形式变化，请检查 TAIL_OLD")
    kit = kit.replace(TAIL_OLD, TAIL_NEW)
    part2 = PART2.read_text(encoding="utf-8")
    OUT.write_text(
        "(() => {\nconst kitRoot = {};\n" + kit + "\n" + part2 + "\n})();\n",
        encoding="utf-8",
    )
    print(f"written {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()