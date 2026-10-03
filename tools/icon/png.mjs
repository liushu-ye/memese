/**
 * 最小可用的 PNG 编解码（8-bit RGBA、非隔行）。
 *
 * 为什么要自己写：Icon 需要在小尺寸上保持边缘干净，
 * 而「白字 + 全黑透明区」直接缩放会把黑色混进边缘。
 * 只有在预乘 alpha 空间做面积平均才正确，ffmpeg 的滤镜链在这里不可用。
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  return zlib.crc32 ? zlib.crc32(buf) : fallbackCrc32(buf);
}

let crcTable = null;
function fallbackCrc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG');

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

export function encodePng(file, width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const out = Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, out);
}

/**
 * 面积平均缩放，在**预乘 alpha 空间**里做。
 *
 * 关键：先把 RGB 乘上 alpha 再求平均，最后除回去。
 * 否则（0,0,0,0）的透明像素会把黑色混进字形边缘，产生脏边。
 */
export function resizeArea(src, dstW, dstH) {
  const { width: sw, height: sh, pixels } = src;
  const out = Buffer.alloc(dstW * dstH * 4);
  const scaleX = sw / dstW;
  const scaleY = sh / dstH;

  for (let oy = 0; oy < dstH; oy++) {
    const sy0 = oy * scaleY, sy1 = (oy + 1) * scaleY;
    const iy0 = Math.floor(sy0), iy1 = Math.min(sh, Math.ceil(sy1));

    for (let ox = 0; ox < dstW; ox++) {
      const sx0 = ox * scaleX, sx1 = (ox + 1) * scaleX;
      const ix0 = Math.floor(sx0), ix1 = Math.min(sw, Math.ceil(sx1));

      let aAcc = 0, rpAcc = 0, gpAcc = 0, bpAcc = 0, wAcc = 0;

      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy * sw + sx) * 4;
          const a = pixels[i + 3];
          aAcc += a * w;
          // 预乘：RGB * alpha
          rpAcc += pixels[i] * a * w;
          gpAcc += pixels[i + 1] * a * w;
          bpAcc += pixels[i + 2] * a * w;
          wAcc += w;
        }
      }

      const o = (oy * dstW + ox) * 4;
      if (wAcc === 0 || aAcc === 0) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
        continue;
      }
      const a = aAcc / wAcc;
      // 反预乘：除以 alpha 占比
      out[o] = Math.min(255, Math.round(rpAcc / aAcc));
      out[o + 1] = Math.min(255, Math.round(gpAcc / aAcc));
      out[o + 2] = Math.min(255, Math.round(bpAcc / aAcc));
      out[o + 3] = Math.round(a);
    }
  }
  return { width: dstW, height: dstH, pixels: out };
}
