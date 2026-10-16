/**
 * 逐个核对音频：清单里的每个词是否都有文件、文件是否像样的 mp3。
 *
 * 背景：edge-tts 在跑的过程中出现过 HTTP 403，脚本的"成功 N/M"汇总与
 * "清单 495 条"自相矛盾。这种情况只能逐文件核对，不能信汇总。
 */
import fs from 'node:fs';
import path from 'node:path';

const AUDIO = 'app/src/main/assets/audio';
const index = JSON.parse(fs.readFileSync(path.join(AUDIO, 'index.json'), 'utf8'));
const words = JSON.parse(fs.readFileSync('data/words.json', 'utf8'));

const entries = Object.entries(index);
const missing = [];
const tiny = [];
const sizes = [];

for (const [key, rel] of entries) {
  const p = path.join(AUDIO, rel.replace('audio/', ''));
  if (!fs.existsSync(p)) { missing.push(key); continue; }
  const size = fs.statSync(p).size;
  sizes.push(size);
  if (size < 3000) tiny.push(`${key} (${size}B)`);
}

// 清单里有词表没有的？词表里有清单没有的？
const want = [];
for (const lang of ['en', 'ja']) {
  for (const w of Object.keys(words[lang])) want.push(`${lang}:${w}`);
}
const notInIndex = want.filter((k) => !index[k]);

// 磁盘上的文件数
let filesOnDisk = 0;
for (const lang of ['en', 'ja']) {
  const d = path.join(AUDIO, lang);
  if (fs.existsSync(d)) filesOnDisk += fs.readdirSync(d).filter((f) => f.endsWith('.mp3')).length;
}

sizes.sort((a, b) => a - b);
const sum = sizes.reduce((a, b) => a + b, 0);

console.log(`清单条目      : ${entries.length}`);
console.log(`磁盘 mp3 文件 : ${filesOnDisk}  ${filesOnDisk === entries.length ? '✅ 数量一致' : '❌ 数量不一致'}`);
console.log(`文件缺失      : ${missing.length ? missing.join(', ') : '✅ 无'}`);
console.log(`过小(<3KB)    : ${tiny.length ? tiny.join(', ') : '✅ 无'}`);
console.log(`清单缺词      : ${notInIndex.length ? notInIndex.join(', ') : '✅ 词表里的词清单都有'}`);
console.log(`体积          : 最小 ${(sizes[0] / 1024).toFixed(1)}KB / 中位 ${(sizes[Math.floor(sizes.length / 2)] / 1024).toFixed(1)}KB / 最大 ${(sizes[sizes.length - 1] / 1024).toFixed(1)}KB`);
console.log(`合计          : ${(sum / 1024 / 1024).toFixed(2)} MB`);
