"""
一次性生成全部单词的发音音频，打包进 APK。

为什么不让 App 用系统 TTS：
- 国行手机的 TTS 引擎普遍没有日语（小米 HyperOS 实测不行）
- 讯飞语记是笔记 App，不是 TTS 引擎，不会出现在引擎列表里
- 预生成音频可以彻底绕开这些麻烦，而且音色质量远好于手机自带

产物：
  app/src/main/assets/audio/{en,ja}/<sha1前16位>.mp3
  app/src/main/assets/audio/index.json      ← 词 → 资源路径的清单

App 端查 index.json 拿到路径再播放，不需要自己算 hash，零匹配风险。

用法：
  python tools/audio/generate_audio.py            # 只补缺失的（幂等）
  python tools/audio/generate_audio.py --force    # 全部重生成
"""
import argparse
import asyncio
import hashlib
import json
import os
import sys

import edge_tts

VOICES = {
    "en": "en-US-AriaNeural",
    "ja": "ja-JP-NanamiNeural",
}

# 单词语速放慢一点，方便跟读
RATE = "-10%"

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORDS = os.path.join(ROOT, "data", "words.json")
OUT_DIR = os.path.join(ROOT, "app", "src", "main", "assets", "audio")
INDEX = os.path.join(OUT_DIR, "index.json")

CONCURRENCY = 4
RETRIES = 3


def digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


async def synth(text: str, voice: str, path: str, sem: asyncio.Semaphore) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return True  # 幂等：已存在就跳过，重跑几乎不耗时

    async with sem:
        for attempt in range(1, RETRIES + 1):
            try:
                await edge_tts.Communicate(text, voice, rate=RATE).save(path)
                if os.path.exists(path) and os.path.getsize(path) > 0:
                    return True
            except Exception as e:
                if attempt == RETRIES:
                    print(f"  FAIL {text}  ({e})", file=sys.stderr)
                else:
                    await asyncio.sleep(1.5 * attempt)
    return False


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="忽略已有文件，全部重新生成")
    args = parser.parse_args()

    with open(WORDS, encoding="utf-8") as f:
        words = json.load(f)

    if args.force:
        for lang in VOICES:
            d = os.path.join(OUT_DIR, lang)
            if os.path.isdir(d):
                for name in os.listdir(d):
                    os.remove(os.path.join(d, name))
        print("已清空旧音频，开始全量生成")

    os.makedirs(OUT_DIR, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    index = {}

    for lang, voice in VOICES.items():
        entries = words.get(lang) or {}
        lang_dir = os.path.join(OUT_DIR, lang)
        os.makedirs(lang_dir, exist_ok=True)

        print(f"\n[{lang}] {voice}  共 {len(entries)} 个词")
        tasks = []
        keys = sorted(entries.keys())
        for word in keys:
            name = f"{digest(word)}.mp3"
            rel = f"audio/{lang}/{name}"
            index[f"{lang}:{word}"] = rel
            tasks.append(synth(word, voice, os.path.join(lang_dir, name), sem))

        results = await asyncio.gather(*tasks)
        ok = sum(1 for r in results if r)
        print(f"  成功 {ok}/{len(results)}")

        # 失败的从清单里剔除，App 就自然回退到系统 TTS
        for word in keys:
            if not os.path.exists(os.path.join(lang_dir, f"{digest(word)}.mp3")):
                index.pop(f"{lang}:{word}", None)

    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=True)

    # 统计
    total_files = 0
    total_bytes = 0
    for lang in VOICES:
        d = os.path.join(OUT_DIR, lang)
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            p = os.path.join(d, name)
            total_files += 1
            total_bytes += os.path.getsize(p)

    print(f"\n清单: {INDEX}  ({len(index)} 条)")
    print(f"音频: {total_files} 个文件, {total_bytes / 1024 / 1024:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
