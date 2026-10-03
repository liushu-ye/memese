# 图标生成工具

App 图标是**白色「梗」字 + 粉红底**的自适应图标。这里放的是生成它的完整流程，
想换字、换色、换字号时照着来即可。

## 为什么是这套流程

图标是一个复杂汉字（梗），**手写矢量路径不现实**，所以改成：

```
浏览器渲染系统字体 → 高分辨率透明 PNG → 面积平均缩放到各密度 → 装进 res/mipmap-*
```

两个坑值得说明：

**1. 透明底是黑色，直接缩放会脏边。**
浏览器输出里透明像素是 `(0,0,0,0)`。如果直接缩放，黑色会混进字形边缘，在白字旁边
出现一圈灰。`png.mjs` 里的 `resizeArea()` 在**预乘 alpha 空间**做面积平均
（先 `RGB × alpha` 再平均，最后除回去），这样边缘保持纯白。

**2. 自适应图标有安全区。**
画布 108dp，但圆形遮罩只显示中间直径 72dp 的圆。所以字形不能顶满 ——
`inspect.mjs` 会算出**真实墨迹离中心的最远距离**（比包围盒四角可靠），
确认它落在 36dp 半径内。

## 文件

| 文件 | 作用 |
|---|---|
| `glyph.html` | 图标源文件。尺寸全部用 `vmin` 表达，一份 HTML 适配任意分辨率 |
| `render.ps1` | 用无头 Chrome/Edge 渲染成透明 PNG |
| `inspect.mjs` | PNG 解码 + 数值验证（墨迹占比 / 居中 / 安全区 / 有无脏边） |
| `png.mjs` | 极简 PNG 编解码 + 预乘 alpha 的面积平均缩放 |
| `resize.mjs` | 从母版生成 5 个密度档位并装进 `res/mipmap-*` |

工具都是零依赖的，只用 Node 内置模块。

## 重新生成

```powershell
# 1. 渲染母版（432x432，对应 xxxhdpi）
powershell -ExecutionPolicy Bypass -File tools/icon/render.ps1 -Size 432 -Out master.png

# 2. 先验证！重点看「墨迹最远点」是否 ≤ 36dp、「墨迹平均色」是否纯白
node tools/icon/inspect.mjs master.png 母版

# 3. 生成各密度并装进 res/
node tools/icon/resize.mjs master.png
```

第 2 步不要跳过 —— 这是**唯一能在装到手机之前发现问题的环节**。

> `render.ps1` 刻意写成纯 ASCII：Windows PowerShell 5.1 会按 ANSI 读取 `.ps1`，
> 中文注释会被解码坏掉，甚至可能引发解析错误。
> 另外这台机器上只有 `powershell`（v5.1），没有 `pwsh`（v7）。

## 改字 / 改色 / 改大小

- **换字**：改 `glyph.html` 里的 `<span class="glyph">梗</span>`
- **换底色**：同时改三处，否则图标和应用内配色会对不上
  - `glyph.html`（用不到，前景是白字）
  - `app/src/main/res/values/colors.xml` 的 `ic_launcher_background`
  - `app/src/main/java/com/example/memecard/ui/Theme.kt` 的 `Brand`
- **改字号**：`glyph.html` 里的 `font-size: 49.31vmin`
  - 当前值让字形方框约 52dp（目标是 108dp 画布的 ~48%）
  - 调大后必须重跑 `inspect.mjs` 确认没超出安全圆

## 历史数据（当前图标）

```
字形方框     208 x 206 px @432   ≈ 52dp
墨迹最远点   138.7 px @432       = 34.7dp   （安全圆 36dp ✅）
墨迹中心偏移 dx=-1.5, dy=-0.5 px           （几乎完美居中）
墨迹占比     15.2%
边缘干净度   墨迹平均色 rgb(255,255,255)   （无黑边 ✅）
```

五个密度的实测值一致（最远点 34.0 ~ 34.7dp），说明缩放没有引入偏差。
