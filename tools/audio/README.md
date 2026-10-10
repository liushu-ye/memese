# 单词发音音频生成

给「点词查询」提供**离线可用的发音**。

## 为什么不用系统 TTS

| 方案 | 结果 |
|---|---|
| 小米 HyperOS 自带引擎 | ❌ 没有日语 |
| 讯飞语记 | ❌ **它是笔记 App，不是 TTS 引擎**，根本不会出现在引擎列表里 |
| Google 语音服务 | 需要 GMS，国行机型不一定能装 |
| **预生成音频** ← 采用 | ✅ 完全绕开手机差异，音质还更好 |

预生成还有一个隐性好处：**音色由我们决定**。手机上换引擎、装语音包、系统升级都影响不了发音。

## 流程

```
data/words.json  ──> generate_audio.py  ──> assets/audio/{en,ja}/*.mp3
                                        └─> assets/audio/index.json
```

产物打包进 APK，**App 端零网络、零权限、零 TTS 依赖**。

## 用什么合成

**Edge TTS**（微软 Edge 浏览器的朗读端点）：

- 免费，**不需要任何 API key**
- 神经音色质量很高：日语 `ja-JP-NanamiNeural`、英语 `en-US-AriaNeural`
- 通过 Python 的 `edge-tts` 库调用

```bash
pip install edge-tts
```

> 踩坑记录：一开始想用 Node 24 内置的 `WebSocket` 直接实现 —— 失败了。
> Node 的 WebSocket 遵循 WHATWG 规范，**不支持自定义请求头**，
> 而 Edge 端点要求特定的 `Origin` / `User-Agent`，服务端直接以 1006 拒绝。
> Python 的 `edge-tts` 库处理了这些细节（包括 `Sec-MS-GEC` 时间窗校验令牌）。

## 用法

```bash
# 只补缺失的（幂等，重跑几乎不耗时）
python tools/audio/generate_audio.py

# 全部重新生成（换音色时用）
python tools/audio/generate_audio.py --force
```

生成 231 个词约需 2–4 分钟（并发 4）。

## 文件命名

`assets/audio/{lang}/<sha1(词)前16位>.mp3`

**但 App 不自己算 hash** —— `index.json` 里直接给出「词 → 资源路径」：

```json
{
  "en:a": "audio/en/86f7e437faa5a7fc.mp3",
  "ja:神": "audio/ja/xxxxxxxxxxxxxxxx.mp3"
}
```

少一层约定，就少一处可能对不上的地方；出问题时直接打开 `index.json` 就能看。

## 体积

| | 文件数 | 体积 |
|---|---|---|
| 英语 | 137 | 1.41 MB |
| 日语 | 94 | 0.98 MB |
| 合计 | 231 | **2.39 MB** |

APK 从 9.47 MB 涨到 11.56 MB，可接受。

## 加新梗时

词表由 CI 自动补，音频需要重跑一次生成脚本：

```bash
python tools/audio/generate_audio.py
```

脚本是幂等的 —— **已有的词直接跳过**，只为新词合成。

没生成音频的词不会出错：App 会回退到系统 TTS；TTS 也不可用时明确提示，
不会静默失败。

## 注意

- `edge-tts` 是**非官方端点**，可能随时失效。但音频是**一次性生成并提交进仓库**的，
  所以端点挂了也不影响已发布的 App，只是没法再生成新词。
- 生成的 mp3 是**要提交进版本库**的（不是构建产物），否则别人克隆后没有音频。
