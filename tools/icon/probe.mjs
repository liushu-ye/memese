/**
 * 分析一张满幅图标：四角/边缘底色是什么，主体内容落在哪个范围。
 *
 * 决定自适应图标怎么摆：满幅设计图不能直接按 36dp 安全圆缩放（会整体缩小变糊），
 * 通常做法是整幅当背景/前景、让遮罩去裁边 —— 前提是主体在中心。
 */
import { decodePng } from './png.mjs';

const file = process.argv[2];
const { width: W, height: H, pixels } = decodePng(file);
const at = (x, y) => {
  const i = (y * W + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
};
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

console.log(`尺寸 ${W}x${H}\n`);

const m = Math.round(W * 0.01); // 距边 1%
console.log('=== 四角（距边 1%）===');
const corners = {
  左上: at(m, m), 右上: at(W - 1 - m, m),
  左下: at(m, H - 1 - m), 右下: at(W - 1 - m, H - 1 - m),
};
for (const [k, v] of Object.entries(corners)) console.log(`  ${k}: rgb(${v.join(',')})  ${hex(v)}`);

console.log('\n=== 四边中点（距边 1%）===');
for (const [k, v] of Object.entries({
  上: at(W >> 1, m), 下: at(W >> 1, H - 1 - m),
  左: at(m, H >> 1), 右: at(W - 1 - m, H >> 1),
})) console.log(`  ${k}: rgb(${v.join(',')})  ${hex(v)}`);

console.log('\n=== 中心 ===');
console.log(`  正中: rgb(${at(W >> 1, H >> 1).join(',')})`);

// 以四角平均色为底色，找"与底色差异明显"的像素的包围盒
const bg = [0, 1, 2].map((i) => Math.round(
  (corners.左上[i] + corners.右上[i] + corners.左下[i] + corners.右下[i]) / 4,
));
console.log(`\n=== 底色估计 rgb(${bg.join(',')}) ${hex(bg)} ===`);

const THRESH = 40;
let minX = W, minY = H, maxX = -1, maxY = -1, diff = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (dist(at(x, y), bg) > THRESH) {
      diff++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const pct = (n) => ((n / (W * H)) * 100).toFixed(1) + '%';
if (maxX < 0) {
  console.log('  整幅接近纯底色，没有明显主体');
} else {
  const scale = 108 / W;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  console.log(`  主体占画面   : ${pct(diff)}`);
  console.log(`  主体包围盒   : x ${minX}..${maxX} (${maxX - minX + 1}px), y ${minY}..${maxY} (${maxY - minY + 1}px)`);
  console.log(`  换算到 108dp : 宽 ${((maxX - minX + 1) * scale).toFixed(1)}dp, 高 ${((maxY - minY + 1) * scale).toFixed(1)}dp`);
  console.log(`  主体中心偏离 : dx=${(cx - W / 2).toFixed(1)}, dy=${(cy - H / 2).toFixed(1)}`);
  const corners4 = [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]];
  const worst = Math.max(...corners4.map(([x, y]) => Math.hypot(x - W / 2, y - H / 2))) * scale;
  console.log(`  主体最远角   : ${worst.toFixed(1)}dp  → ${worst <= 36 ? '✅ 圆形遮罩裁不到主体' : '⚠️ 圆形遮罩会切掉主体一角 ' + (worst - 36).toFixed(1) + 'dp'}`);
}
