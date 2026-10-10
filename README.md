# 梗学外语（memese）

打开就随机出一个网络梗，下面给出你选定的语言翻译。用「梗」当记忆钩子学外语。

- 主页：一个梗 + 翻译，底部一个「换一个」按钮
- 设置：可多选中文 / English / 日本語，选几种就显示几种
- **点词查询**：点译文里的词看读音和释义，可朗读
- 反馈：顶栏信封图标，可一键复制 QQ 群号
- 数据：飞书多维表格 → 自动同步到仓库 → App 读取

## 界面

```
┌─────────────────────────────┐
│  梗学外语         ✉️   ⚙️   │
├─────────────────────────────┤
│                             │
│  ┌───────────────────────┐  │
│  │                       │  │
│  │        YYDS           │  │  ← 梗（大字）
│  │   ───────────────     │  │
│  │      永远的神          │  │  ← 选中的语言
│  │   The Eternal God     │  │     每选一种多一行
│  │                       │  │
│  └───────────────────────┘  │
│                             │
│      ┌─────────────┐        │
│      │  ⟳  换一个   │        │
│      └─────────────┘        │
└─────────────────────────────┘
```

**翻译全部取消勾选**时只显示梗 —— 可以当作自测模式，想不起来再打开设置。

## 点词查询

译文里的词是**可以点的**。点一下弹出卡片：**读音 + 中文释义**，还能用系统 TTS 读出来。

```
The Eternal God        ← 点「Eternal」
        ↓
┌─────────────────────┐
│ Eternal             │
│ English             │
│ 音标  /ɪˈtɜːrnl/    │
│ 释义  永恒的；不朽的  │
│   [▶ 朗读]  [关闭]   │
└─────────────────────┘
```

**整套是零运行时成本的：**

- 词表由 GitHub Actions 在**你改表格时**用 LLM 生成一次，产出静态 `words.json`
- **发音音频预先合成好打包进 APK**（231 个词，2.4 MB），不依赖手机 TTS 引擎
- App 只查本地 Map、只播本地音频 —— **点一万次也是 0 token、0 网络、0 延迟**
- 数据没变时连那一次 LLM 调用都会跳过

**为什么音频要预生成**：国行手机的 TTS 引擎普遍没有日语（小米 HyperOS 实测不行），
而「讯飞语记」是笔记 App、不是 TTS 引擎。预生成彻底绕开手机差异，音色质量还更好。
详见 [`tools/audio/README.md`](tools/audio/README.md)。

中文是母语不提供查词，**英语和日语可点**。词表的设计细节（为什么不用实时词典 API、
中日文怎么分词、成本怎么控）记在 [`tools/words/README.md`](tools/words/README.md)。

## 图标

白色「梗」字 + 粉红底（`#EC407A`）的自适应图标。

图标是用**无头浏览器渲染系统字体**生成的，不是手绘矢量 —— 一个复杂汉字手写路径不现实。
生成流程和踩到的坑（透明底缩放会脏边、自适应图标安全区）都记在
[`tools/icon/README.md`](tools/icon/README.md)，想换字换色照着走即可。


## 构建

```powershell
$env:JAVA_HOME='D:\App\APP_studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
cd D:\tonggong\deepcode2\memecard
.\gradlew.bat assembleDebug --offline
```

产物：`app\build\outputs\apk\debug\app-debug.apk`（debug 签名，可直接安装）

> **必须 `--offline`**：本机 Gradle 缓存里只有固定几个依赖，
> 联网反而可能因为版本解析失败。依赖集与 `fishdream` 完全一致。

## 数据是怎么来的

```
飞书多维表格（你只改这里）
    │  GitHub Actions 每 6 小时跑一次
    ▼
data/memes.json ──提交回仓库──> jsDelivr CDN
    │                              │
    │ 构建时复制                    │ App 启动时后台拉取
    ▼                              ▼
app/src/main/assets/memes.json   App（三级缓存）
```

**三级数据源**，从快到慢：

| 层级 | 来源 | 何时用 |
|---|---|---|
| ① 内存 | 进程内 | 同一次运行内 |
| ② 本地文件 | 上次从 CDN 成功同步的结果 | 离线、CDN 挂了 |
| ③ assets | 打包进 APK 的兜底数据 | 首次安装、从未联网 |

设计原则：**网络只负责让数据变新，不负责让 App 能用。**
所以 `immediate()` 是同步的、永不失败；`sync()` 是后台的、失败静默。
冷启动永远不白屏。

### 启用自动同步

`ENDPOINT` 已指向本仓库，只需在 GitHub 上配好密钥：

1. Settings → Secrets and variables → Actions
   - **Secrets**：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`
   - **Variables**：`MEME_TABLE_URL`（你的多维表格分享链接）
2. 到 Actions 页手动跑一次 `Sync memes from Feishu`，确认能拿到数据

```kotlin
// app/src/main/java/com/example/memecard/data/MemeRepository.kt
private const val ENDPOINT =
    "https://cdn.jsdelivr.net/gh/liushu-ye/memese@main/data/memes.json"
```

> 换成你自己的仓库时，把 `liushu-ye/memese` 替换掉即可。
> 若把它改回含 `OWNER/REPO` 的占位符，`syncConfigured` 会变为 false，
> App **不发起任何网络请求**，只用内置数据 —— 给不想接同步的人一个安全默认值。

**为什么密钥不在 App 里**：`App Secret` 一旦打包进 APK 就等于公开，
而它代表应用身份。所以密钥只存在于 GitHub 加密 Secrets，
App 读的是一个**完全公开的静态 JSON** —— 没有任何凭证。

### 手动更新数据

不想接 CI 也可以，改完表格在本地跑：

```bash
node tools/feishu-tool/bin/feishu.mjs export \
  --url "<你的表格链接>" --sort-by ID --out data/memes.json

cp data/memes.json app/src/main/assets/memes.json
```

然后重新编译。需要 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 环境变量。

## 目录结构

```
memese/
├── app/src/main/
│   ├── assets/                        内置兜底数据（memes.json + words.json）
│   ├── java/com/example/memecard/
│   │   ├── MainActivity.kt            唯一 Activity
│   │   ├── data/
│   │   │   ├── Meme.kt                数据模型 + 语言枚举
│   │   │   ├── MemeDeck.kt            洗牌袋（随机不重复）
│   │   │   ├── MemePrefs.kt           设置持久化
│   │   │   ├── Tokenizer.kt           分词 + 词表（纯函数，可测）
│   │   │   └── MemeRepository.kt      三级数据源 + 增量同步
│   │   └── ui/
│   │       ├── MemeApp.kt             状态持有者
│   │       ├── HomeScreen.kt          主页
│   │       ├── ClickableTranslation.kt 可点文本（手写点击命中）
│   │       ├── WordSheet.kt           点词后的读音/释义卡片
│   │       ├── AudioPlayer.kt         播放内置发音音频
│   │       ├── Speaker.kt             系统 TTS（音频缺失时的兜底）
│   │       ├── SettingsSheet.kt       设置底部弹窗
│   │       ├── FeedbackDialog.kt      反馈弹窗（QQ 群）
│   │       ├── Theme.kt               Material 3 主题（品牌粉 #EC407A）
│   │       └── Labels.kt              语言显示名 / BCP-47
│   ├── assets/audio/                  231 个单词发音（2.4 MB，离线可用）
│   └── res/mipmap-*dpi/               自适应图标（5 个密度）
├── data/
│   ├── memes.json                     梗数据（CI 从飞书同步）
│   └── words.json                     词表（CI 用 LLM 生成，可手工改）
├── tools/feishu-tool/                 飞书导出工具（零依赖）
├── tools/icon/                        图标生成工具
├── tools/words/                       词表生成与校验
├── tools/audio/                       发音音频生成
└── .github/workflows/sync-memes.yml   定时同步 + 词表/音频生成
```

> 注：本地目录名和 Android 包名仍是 `memecard`，仓库名是 `memese`。
> 有历史原因（工程先于仓库命名），改包名要动一批 import，暂时没动。

## 技术选型

| 项 | 选择 | 为什么 |
|---|---|---|
| UI | Jetpack Compose + Material 3 | 与 `fishdream` 一致，已验证可离线编译 |
| JSON | `org.json` | Android 平台自带，**不需要新依赖** |
| 存储 | `SharedPreferences` | 平台自带。DataStore 不在本机缓存里 |
| 联网 | `HttpURLConnection` | JDK 自带。OkHttp / Retrofit 不在缓存里 |
| 导航 | 状态变量 | 只有两个界面，Navigation Compose 不在缓存里 |

**一行第三方依赖都没新增** —— 这是硬约束倒逼出来的，反而让工程很轻。

### 随机为什么用「洗牌袋」

不用 `Random.nextInt(size)`，因为它会连续抽到同一个梗，
而且 50 个里有几个可能很久轮不到。

`MemeDeck` 把全部下标打乱后依次取出，取完才重洗：

- 一轮之内不重复
- 所有梗都能轮到
- 新一轮的第一个尽量不接上一轮的最后一个

## 已知限制

- **未做真机运行验证**：本机没有可用 AVD，也没有连接的调试设备。
  代码能编译通过、APK 能装能启动，但**界面观感、间距、字号需要你装上手机后反馈**。
- **没有自动化测试**：本机 Gradle 缓存缺 JUnit。不过 `MemeDeck` 的随机源是可注入的
  （`MemeDeck(random)`），联网后补测试很容易。
- **图标复用自 `fishdream`**，是鱼和便签的图案，与该 App 主题不符，建议后续替换。
- **切语言时卡片尺寸会变**（翻译行数变了），没有做动画过渡。

## 数据格式

`memes.json` 是扁平数组，字段名与飞书表头一一对应：

```json
[
  {
    "record_id": "recvwoAyibpmwb",
    "ID": "1",
    "梗": "YYDS",
    "中文": "永远的神",
    "英语": "The Eternal God",
    "日语": "永遠の神"
  }
]
```

`record_id` 是飞书主键，App 不用它（但反向更新某一行时需要）。
改表头的话，同步改 `MemeRepository.parse()` 里的字段名即可。
