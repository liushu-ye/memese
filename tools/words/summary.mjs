/** 词表覆盖率汇总（精简版，避免刷屏）。 */
import fs from 'node:fs';

const memes = JSON.parse(fs.readFileSync('data/memes.json', 'utf8'));
const words = JSON.parse(fs.readFileSync('data/words.json', 'utf8'));

const normEn = (w) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

// 英语
let enTotal = 0;
const enMiss = new Set();
for (const m of memes) {
  for (const tok of String(m['英语'] ?? '').split(/\s+/)) {
    const w = normEn(tok);
    if (!w) continue;
    enTotal++;
    if (!words.en[w]) enMiss.add(w);
  }
}

// 日语（与 App 端一致的贪心最长匹配）
const keys = Object.keys(words.ja);
const maxLen = Math.max(...keys.map((k) => k.length));
function seg(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const c = text.slice(i, i + len);
      if (words.ja[c]) { hit = c; break; }
    }
    if (hit) { out.push({ t: hit, w: hit }); i += hit.length; }
    else {
      const last = out[out.length - 1];
      if (last && !last.w) last.t += text[i];
      else out.push({ t: text[i], w: null });
      i++;
    }
  }
  return out;
}

const PUNCT = /^[\s、。，！？（）()？…「」【】!?,.—・〜~]+$/;
const PLACE = /^[○×〇□*?？]+$/;
let jaTotal = 0, jaHit = 0;
const jaMiss = new Map();
for (const m of memes) {
  for (const s of seg(String(m['日语'] ?? ''))) {
    jaTotal++;
    if (s.w) { jaHit++; continue; }
    if (PUNCT.test(s.t) || PLACE.test(s.t)) { jaHit++; continue; }
    jaMiss.set(s.t, (jaMiss.get(s.t) ?? 0) + 1);
  }
}

console.log(`梗数据      : ${memes.length} 条 (ID ${memes[0].ID}-${memes[memes.length - 1].ID})`);
console.log(`词表        : 英语 ${Object.keys(words.en).length} 条 / 日语 ${keys.length} 条`);
console.log(`英语覆盖    : ${enTotal - enMiss.size}/${enTotal}  ${enMiss.size ? '缺: ' + [...enMiss].join(' ') : '✅ 全覆盖'}`);
console.log(`日语覆盖    : ${jaHit}/${jaTotal}  ${jaMiss.size ? '剩: ' + [...jaMiss].map(([k, n]) => `${k}×${n}`).join(' ') : '✅ 全覆盖'}`);
console.log(`sourceHash  : ${words._meta.sourceHash}`);
