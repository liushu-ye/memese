# 图标生成工具

App 图标是**自定义设计图**（紫色渐变 + 白色 logo）的自适应图标。
这里放的是把设计图变成可用图标的完整流程。

历史上这里还用浏览器渲染过一个「梗」字图标 —— 那套流程（`glyph.html` + `render.ps1`）
保留着，想换回文字图标可以用。

## 两种素材，两条路径

| 素材形态 | 怎么处理 |
|---|---|
| **满幅不透明设计图**（当前用的） | `compose.mjs` 缩放 + 羽化，融进背景色 |
| 透明底的文字/图形 | `render.ps1` 渲染 + `inspect.mjs` 验证 |

### 路径一：满幅设计图（当前）

满幅图**不能直接用** —— 圆形遮罩只显示中间 72dp，设计图的主体往往超出。

以当前图标为例，实测：

```
白色 logo 最远点   43.6dp     ← 超出 36dp 安全圆
超出安全圆的墨迹   19.92%     ← 将近五分之一会被切掉
```

所以必须先缩小。流程：

```powershell
# 1. 转成 RGBA（ffmpeg 处理各种源格式最省事）
ffmpeg -v error -y -i "源图.png" -pix_fmt rgba _icon_src\src_rgba.png

# 2. 摸清底细：四角/边缘什么颜色、主体多大、最远点多远
node tools/icon/probe.mjs  _icon_src\src_rgba.png
node tools/icon/radius.mjs _icon_src\src_rgba.png

# 3. 合成：缩到安全区内 + 边缘径向羽化融进背景色
node tools/icon/compose.mjs _icon_src\src_rgba.png master.png --scale 0.82 --bg "#33128a"

# 4. 验证（关键）：超出安全圆的比例必须是 0.00%
node tools/icon/radius.mjs master.png

# 5. 生成 5 个密度并装进 res/
node tools/icon/resize.mjs master.png
```

**`--scale` 怎么定**：用 `radius.mjs` 量出主体最远点 R，则 `scale ≈ 36 / R`。
当前 R=43.6dp → 36/43.6 = 0.826，取 0.82。

**羽化是必须的**：缩放后的图在画布上是**方形**，边缘会有可见的直边。
`compose.mjs` 从 `--feather-from`（默认 40dp）线性淡出到方形边缘，
把它融进背景色。羽化区间落在主体之外（主体最远 35.6dp < 40dp），所以削不到主体。

### 路径二：透明底文字/图形

```powershell
powershell -ExecutionPolicy Bypass -File tools/icon/render.ps1 -Size 432 -Out master.png
node tools/icon/inspect.mjs master.png 母版      # 重点看安全区与有无脏边
node tools/icon/resize.mjs master.png
```

> `render.ps1` 刻意写成纯 ASCII：Windows PowerShell 5.1 按 ANSI 读 `.ps1`，
> 中文注释会乱码甚至引发解析错误。这台机器也只有 `powershell`（v5.1），没有 `pwsh`。

## 两个通用坑

**1. 透明底是黑色，直接缩放会脏边。**
浏览器输出的透明像素是 `(0,0,0,0)`，普通缩放会把黑色混进字形边缘。
`png.mjs` 的 `resizeArea()` 在**预乘 alpha 空间**做面积平均，边缘保持干净。

**2. 自适应图标有安全区。**
画布 108dp，但圆形遮罩只显示中间直径 72dp 的圆（半径 36dp）。
`radius.mjs` 算的是**真实墨迹离中心的最远距离**，比包围盒四角可靠得多 ——
包围盒四角通常没有墨迹，用它判断会过度保守。

## 文件

| 文件 | 作用 |
|---|---|
| `compose.mjs` | **满幅图**：缩放 + 径向羽化 + 合成到背景色 |
| `probe.mjs` | 分析满幅图：四角/边缘底色、主体范围、底色估计 |
| `radius.mjs` | **关键验证**：主体墨迹的半径分布、超出安全圆的比例 |
| `inspect.mjs` | 透明图的验证：墨迹占比 / 居中 / 安全区 / 有无脏边 |
| `glyph.html` | 文字图标源（用 `vmin`，一份 HTML 适配任意分辨率） |
| `render.ps1` | 无头浏览器渲染成透明 PNG |
| `png.mjs` | 极简 PNG 编解码 + 预乘 alpha 面积平均缩放 |
| `resize.mjs` | 从母版生成 5 个密度并装进 `res/mipmap-*` |

全都零依赖，只用 Node 内置模块 + 本机的 ffmpeg / Chrome。

## 换图标时别忘了同步配色

改完图要检查三处是否一致，否则图标和应用内配色会打架：

- `app/src/main/res/values/colors.xml` 的 `ic_launcher_background`
- `app/src/main/java/com/example/memecard/ui/Theme.kt` 的 `Brand`

## 当前图标的历史数据

```
素材          1536x1536 满幅不透明（紫色渐变 #3D1791→#290C80 + 白 logo）
主体最远点    43.6dp  → 超出安全圆 19.92%（不能用）
缩放          0.82
合成后最远点  35.6dp  → 超出安全圆 0.00% ✅
羽化区间      40dp → 44.3dp
背景色        #33128a（边缘平均色）
应用主题色    #6C3BC9（取自图标主色系，与白字对比度 6.7:1）

五个密度实测：最远点 35.2 / 35.4 / 35.5 / 35.6 / 35.6 dp —— 缩放没引入偏差
```
