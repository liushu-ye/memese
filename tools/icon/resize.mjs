/**
 * 从 432 母版生成各密度档位的前景图，并直接装进 app/src/main/res/mipmap-*dpi/。
 *
 * 用法（仓库根目录）：
 *   node tools/icon/resize.mjs <母版.png> [res 目录]
 *
 * 默认 res 目录为 app/src/main/res。
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng, resizeArea } from './png.mjs';

const [, , srcFile, resDirArg] = process.argv;

if (!srcFile) {
  console.error('用法: node tools/icon/resize.mjs <母版.png> [res 目录]');
  process.exit(1);
}

// 自适应图标画布是 108dp，各密度按倍数换算
const DENSITIES = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

const resDir = resDirArg ?? 'app/src/main/res';
const src = decodePng(srcFile);
console.log(`母版: ${src.width}x${src.height}  (${srcFile})`);

for (const [name, size] of DENSITIES) {
  const dir = path.join(resDir, `mipmap-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'ic_launcher_foreground.png');
  const resized = resizeArea(src, size, size);
  encodePng(out, resized.width, resized.height, resized.pixels);
  console.log(`  ✅ ${name.padEnd(8)} ${String(size).padStart(3)}x${size}  -> ${out}`);
}
