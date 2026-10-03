/**
 * 极简 PNG 解码器，只支持 8-bit RGBA / 非隔行（我们自己的截图就是这种）。
 * 目的：在看不到图的情况下，用数值验证图标是否渲染正确。
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');

  let pos = 8;
  let ihdr = null;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (!ihdr) throw new Error('缺少 IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`只支持 8-bit，实际 ${ihdr.bitDepth}`);
  if (ihdr.colorType !== 6) throw new Error(`只支持 RGBA(colorType 6)，实际 ${ihdr.colorType}`);
  if (ihdr.interlace !== 0) throw new Error('不支持隔行扫描');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  // 逐行反滤波
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y === 0 ? Buffer.alloc(stride) : out.subarray((y - 1) * stride, y * stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 0xff;
          break;
        }
        default: throw new Error(`未知滤波类型 ${filter}`);
      }
      cur[x] = v;
    }
  }
  return { width, height, pixels: out };
}

function inspect(file, label) {
  const { width, height, pixels } = decodePng(file);
  let opaque = 0, semi = 0, transparent = 0;
  let rSum = 0, gSum = 0, bSum = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = pixels[i + 3];
      if (a === 0) { transparent++; continue; }
      if (a === 255) opaque++; else semi++;
      rSum += pixels[i]; gSum += pixels[i + 1]; bSum += pixels[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const inked = opaque + semi;
  const total = width * height;
  const pct = (n) => ((n / total) * 100).toFixed(1) + '%';

  // 全透明像素携带什么 RGB？若是黑色，用普通缩放会在字形边缘混出黑边。
  // 这决定了「缩小一档」到底安不安全。
  const tRgb = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] !== 0) continue;
      const k = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      tRgb.set(k, (tRgb.get(k) ?? 0) + 1);
    }
  }
  const topT = [...tRgb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);

  console.log(`\n=== ${label} (${file}) ===`);
  console.log(`尺寸        : ${width} x ${height}`);
  console.log(`透明像素    : ${pct(transparent)}`);
  console.log(`不透明像素  : ${pct(opaque)}`);
  console.log(`半透明像素  : ${pct(semi)}`);
  if (inked === 0) { console.log('❌ 全透明 —— 什么都没渲染出来'); return; }

  console.log(`墨迹占比    : ${pct(inked)}`);
  console.log(`透明区 RGB  : ${topT.map(([k, n]) => `rgb(${k}) x${n}`).join('  ')}`);
  console.log(`             → ${topT[0]?.[0] === '0,0,0' ? '⚠️ 黑色：普通缩放会产生黑边，必须先预乘 alpha' : '✅ 白色：可直接缩放，不会产生黑边'}`);
  console.log(`墨迹平均色  : rgb(${Math.round(rSum / inked)}, ${Math.round(gSum / inked)}, ${Math.round(bSum / inked)})`);
  console.log(`墨迹包围盒  : x ${minX}..${maxX} (宽 ${maxX - minX + 1}), y ${minY}..${maxY} (高 ${maxY - minY + 1})`);

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  console.log(`墨迹中心    : (${cx.toFixed(1)}, ${cy.toFixed(1)})   画布中心 (${width / 2}, ${height / 2})`);
  console.log(`中心偏移    : dx=${(cx - width / 2).toFixed(1)}, dy=${(cy - height / 2).toFixed(1)}`);

  // 真实墨迹离画布中心的最远距离（比包围盒四角更可信）
  const scale = width / 108;
  const mid = width / 2;
  let maxR = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      const d = Math.hypot(x + 0.5 - mid, y + 0.5 - mid);
      if (d > maxR) maxR = d;
    }
  }
  const safeCircle = 36 * scale;      // 圆形遮罩显示区
  const safeSquare = (72 / Math.SQRT2) * scale; // 方形字形完整可见的上限
  console.log(`墨迹最远点  : ${maxR.toFixed(1)}px  (${(maxR / scale).toFixed(1)}dp)`);
  console.log(`圆形安全区  : ${safeCircle.toFixed(1)}px (36dp)  → ${maxR <= safeCircle ? '✅ 不会出血' : '⚠️ 圆形遮罩会切角 ' + (maxR - safeCircle).toFixed(1) + 'px'}`);
  console.log(`字形上限建议: ${safeSquare.toFixed(1)}px (${(safeSquare / scale).toFixed(1)}dp)`);
}

for (const [f, l] of process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (i % 2 === 0) acc.push([v, arr[i + 1]]);
  return acc;
}, [])) {
  inspect(f, l);
}
