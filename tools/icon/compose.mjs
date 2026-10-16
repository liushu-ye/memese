/**
 * 把一张「满幅不透明」的设计图合成为可用的自适应图标前景。
 *
 * 为什么需要这一步：
 * 满幅设计图直接用会被遮罩裁边。实测这张图的白色 logo 最远到 43.6dp 半径，
 * 而安全圆只有 36dp —— 19.9% 的墨迹会被圆形遮罩切掉。
 *
 * 做法：
 *   1. 把原图缩到让主体落进安全圆（默认 0.82）
 *   2. 居中放到 108dp 画布上，四周用背景色填
 *   3. 把缩放后图片的方形边缘做径向羽化，融进背景，避免出现可见的方形接缝
 *
 * 羽化只作用在主体之外（主体最大半径 < 羽化起点），所以不会削到主体。
 *
 * 用法：
 *   node tools/icon/compose.mjs <源图.png> <输出.png> [--scale 0.82] [--bg #33128a]
 */
import { decodePng, encodePng, resizeArea } from './png.mjs';

const args = process.argv.slice(2);
const src = args[0];
const out = args[1];
if (!src || !out) {
  console.error('用法: node tools/icon/compose.mjs <源图.png> <输出.png> [--scale 0.82] [--bg #33128a]');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const SIZE = Number(opt('size', '432'));          // 输出边长（108dp 按 4x）
const SCALE = Number(opt('scale', '0.82'));       // 原图在画布上的占比
const BG_HEX = opt('bg', '#33128a');
const FEATHER_FROM_DP = Number(opt('feather-from', '40')); // 从这个半径开始淡出

const DP = SIZE / 108;                            // 1dp 等于多少像素
const bg = [
  parseInt(BG_HEX.slice(1, 3), 16),
  parseInt(BG_HEX.slice(3, 5), 16),
  parseInt(BG_HEX.slice(5, 7), 16),
];

const image = decodePng(src);
console.log(`源图: ${image.width}x${image.height}   背景色: ${BG_HEX}   缩放: ${SCALE}`);

// 1) 先把源图按面积平均缩放到目标尺寸（预乘 alpha，边缘干净）
const inner = Math.round(SIZE * SCALE);
const scaled = resizeArea(image, inner, inner);

// 2) 合成到画布上，方形边缘做径向羽化
const canvas = Buffer.alloc(SIZE * SIZE * 4);
const offset = Math.round((SIZE - inner) / 2);
const half = SIZE / 2;
const featherFrom = FEATHER_FROM_DP * DP;
// 羽化到方形边缘为止（边缘到中心的距离就是 inner/2）
const featherTo = inner / 2;
if (featherTo <= featherFrom) {
  console.error(`羽化区间非法: from=${featherFrom.toFixed(1)} to=${featherTo.toFixed(1)}`);
  process.exit(1);
}

let faded = 0;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * 4;
    const sx = x - offset;
    const sy = y - offset;

    let r = bg[0], g = bg[1], b = bg[2];

    if (sx >= 0 && sx < inner && sy >= 0 && sy < inner) {
      const i = (sy * inner + sx) * 4;
      const radius = Math.hypot(x + 0.5 - half, y + 0.5 - half);
      let alpha = 1;
      if (radius > featherFrom) {
        alpha = Math.max(0, 1 - (radius - featherFrom) / (featherTo - featherFrom));
        faded++;
      }
      r = Math.round(scaled.pixels[i] * alpha + bg[0] * (1 - alpha));
      g = Math.round(scaled.pixels[i + 1] * alpha + bg[1] * (1 - alpha));
      b = Math.round(scaled.pixels[i + 2] * alpha + bg[2] * (1 - alpha));
    }

    canvas[o] = r; canvas[o + 1] = g; canvas[o + 2] = b; canvas[o + 3] = 255;
  }
}

encodePng(out, SIZE, SIZE, canvas);

const logoWide = (inner * (81.1 / 108)).toFixed(1);
console.log(`原图在画布上占 ${(SCALE * 108).toFixed(1)}dp`);
console.log(`羽化区间 ${FEATHER_FROM_DP}dp → ${(featherTo / DP).toFixed(1)}dp，涉及 ${((faded / (SIZE * SIZE)) * 100).toFixed(1)}% 像素`);
console.log(`✅ 已写出 ${out}  (${SIZE}x${SIZE})`);
