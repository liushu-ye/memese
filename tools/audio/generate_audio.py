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

CONCURRENCY = 2        # 并发调低：Edge 端点在约 230 次请求后会开始返回 403
RETRIES = 4
GAP_SECONDS = 0.6      # 每次请求之间留点间隔，配合低并发避免触发限流
MIN_BYTES = 2000       # 低于这个大小视为无效（正常情况下单词语音 5~15 KB）


def digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def valid(path: str) -> bool:
    """
    文件存在且不是空壳。

    必须是这个判断而不是 os.path.exists —— edge_tts 在收到 403 时会先建好文件
    再失败，留下 0 字节的空壳。只看"存在"会把空壳当成已完成，
    既让清单虚报条目数，又让重跑永远跳过它们。
    """
    return os.path.exists(path) and os.path.getsize(path) >= MIN_BYTES


def purge_invalid(out_dir: str) -> int:
    """清掉所有 0 字节 / 过小的残留文件，让它们能被重新生成。"""
    removed = 0
    for lang in VOICES:
        d = os.path.join(out_dir, lang)
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            if not name.endswith(".mp3"):
                continue
            p = os.path.join(d, name)
            if not valid(p):
                os.remove(p)
                removed += 1
    return removed


async def synth(text: str, voice: str, path: str, sem: asyncio.Semaphore) -> bool:
    if valid(path):
        return True  # 幂等：已完成就跳过

    async with sem:
        for attempt in range(1, RETRIES + 1):
            # 打开文件前先删掉可能存在的空壳，避免看到旧的 0 字节文件误判成功
            if os.path.exists(path) and not valid(path):
                os.remove(path)
            try:
                await edge_tts.Communicate(text, voice, rate=RATE).save(path)
                if valid(path):
                    await asyncio.sleep(GAP_SECONDS)
                    return True
            except Exception as e:
                if attempt == RETRIES:
                    print(f"  FAIL {text}  ({e})", file=sys.stderr)
                else:
                    # 指数退避：403 是限流，等久一点比立刻重试有效
                    await asyncio.sleep(3 * (3 ** (attempt - 1)))
    # 失败就清掉空壳，别留在磁盘上污染清单
    if os.path.exists(path) and not valid(path):
        os.remove(path)
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
    else:
        purged = purge_invalid(OUT_DIR)
        if purged:
            print(f"清掉 {purged} 个无效残留（0 字节空壳），将重新生成")

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

        # 只有真正有效的音频才进清单（valid 会检查大小，不是只看存在）
        # 没进清单的词，App 会自然回退到系统 TTS
        missing = 0
        for word in keys:
            if not valid(os.path.join(lang_dir, f"{digest(word)}.mp3")):
                index.pop(f"{lang}:{word}", None)
                missing += 1
        if missing:
            print(f"  {missing} 个词没有有效音频，已从清单剔除")

    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=True)

    # 统计（只算有效文件）
    total_files = 0
    total_bytes = 0
    invalid = 0
    for lang in VOICES:
        d = os.path.join(OUT_DIR, lang)
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            p = os.path.join(d, name)
            if valid(p):
                total_files += 1
                total_bytes += os.path.getsize(p)
            else:
                invalid += 1

    print(f"\n清单: {INDEX}  ({len(index)} 条)")
    print(f"音频: {total_files} 个有效文件, {total_bytes / 1024 / 1024:.2f} MB")
    if invalid:
        print(f"⚠️  磁盘上还有 {invalid} 个无效文件（应已为 0，非 0 说明需要重跑）")
    if len(index) < sum(len(words.get(l, {})) for l in VOICES):
        print("⚠️  清单条目少于词表，缺的那部分 App 会回退到系统 TTS")
    return 0 if len(index) == sum(len(words.get(l, {})) for l in VOICES) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
