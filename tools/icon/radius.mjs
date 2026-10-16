/**
 * 亮色主体的半径分布。
 * 包围盒最远角是"最坏情况"；真实墨迹可能集中在中心，
 * 那就说明满幅使用 + 圆形遮罩是可接受的。
 */
import { decodePng } from './png.mjs';

const file = process.argv[2];
const { width: W, height: H, pixels } = decodePng(file);
const scale = 108 / W;

const radii = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    if (lum < 190) continue;
    radii.push(Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2) * scale);
  }
}

radii.sort((a, b) => a - b);
const n = radii.length;
const pct = (p) => radii[Math.min(n - 1, Math.floor(n * p))];
const over = (r) => ((radii.filter((v) => v > r).length / n) * 100).toFixed(2) + '%';

console.log(`亮色像素 ${n} 个\n`);
console.log('半径分位数（单位 dp，108dp 画布）:');
for (const p of [0.5, 0.9, 0.95, 0.99, 0.995, 0.999]) {
  console.log(`  ${(p * 100).toFixed(1).padStart(5)}%  ${pct(p).toFixed(1)}dp`);
}
console.log(`  最大    ${radii[n - 1].toFixed(1)}dp`);

console.log('\n超出安全圆的墨迹比例:');
for (const r of [33, 36, 40, 42, 45]) {
  console.log(`  r=${r}dp (直径 ${r * 2}dp)  ${over(r)}`);
}
