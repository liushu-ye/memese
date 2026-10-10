/**
 * 校验词表能否完整覆盖数据，以及日语贪心分词是否落在预期边界上。
 *
 * 这是「点词查询」能不能用的关键验证：宁可在这里发现问题，
 * 也不要等装到手机上才发现点某个词没反应。
 */
import fs from 'node:fs';

const memes = JSON.parse(fs.readFileSync('data/memes.json', 'utf8'));
const words = JSON.parse(fs.readFileSync('data/words.json', 'utf8'));

// ---------- 英语：空格切分 ----------
const splitEn = (s) => String(s ?? '').split(/(\s+)/); // 保留空白，便于原样渲染
const normEn = (w) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

let enMissing = new Set();
let enTotal = 0;
for (const m of memes) {
  for (const tok of String(m['英语'] ?? '').split(/\s+/)) {
    const w = normEn(tok);
    if (!w) continue;
    enTotal++;
    if (!words.en[w]) enMissing.add(w);
  }
}

// ---------- 日语：贪心最长匹配（与 App 端完全相同的算法）----------
const jaKeys = Object.keys(words.ja);
const maxJa = Math.max(...jaKeys.map((k) => k.length));

function segmentCjk(text, dict, maxLen) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const cand = text.slice(i, i + len);
      if (dict[cand]) { hit = cand; break; }
    }
    if (hit) { out.push({ t: hit, w: hit }); i += hit.length; }
    else { out.push({ t: text[i], w: null }); i++; }
  }
  // 把连续未匹配的字符合并成一段
  const merged = [];
  for (const seg of out) {
    const last = merged[merged.length - 1];
    if (last && last.w === null && seg.w === null) last.t += seg.t;
    else merged.push({ ...seg });
  }
  return merged;
}

const OK_PUNCT = /^[\s、。，！？（）()？…「」【】!?,.—]+$/;

let jaTotal = 0, jaMatched = 0;
const unmatchedRuns = new Map();

console.log('=== 日语分词结果 ===\n');
for (const m of memes) {
  const ja = String(m['日语'] ?? '');
  const segs = segmentCjk(ja, words.ja, maxJa);
  jaTotal += segs.length;
  const gaps = segs.filter((s) => s.w === null);
  jaMatched += segs.length - gaps.length;

  const rendered = segs.map((s) => (s.w ? `[${s.t}]` : s.t)).join('');
  const flag = gaps.length && !gaps.every((g) => OK_PUNCT.test(g.t)) ? '  ⚠️' : '';
  console.log(`  ${String(m.ID).padStart(2)} ${rendered}${flag}`);

  for (const g of gaps) {
    if (OK_PUNCT.test(g.t)) continue;
    unmatchedRuns.set(g.t, (unmatchedRuns.get(g.t) ?? 0) + 1);
  }
}

console.log('\n=== 覆盖率 ===');
console.log(`  英语: ${enTotal - enMissing.size}/${enTotal} 词元命中  (词表 ${Object.keys(words.en).length} 条)`);
console.log(`  日语: ${jaMatched}/${jaTotal} 片段命中  (词表 ${Object.keys(words.ja).length} 条)`);

if (enMissing.size) {
  console.log(`\n  ❌ 英语缺 ${enMissing.size} 个词:`);
  console.log('     ' + [...enMissing].sort().join(' '));
}
if (unmatchedRuns.size) {
  console.log(`\n  ⚠️ 日语未匹配片段（非标点，需补词表或确认可以点空）:`);
  for (const [t, n] of unmatchedRuns) console.log(`     "${t}"  x${n}`);
}
if (!enMissing.size && !unmatchedRuns.size) {
  console.log('\n  ✅ 全覆盖，没有点不动的词');
}

// ---------- 词表自身的卫生 ----------
const dupEn = Object.keys(words.en).filter((k) => k !== k.toLowerCase());
console.log('\n=== 词表卫生 ===');
console.log(`  英语键非小写: ${dupEn.length ? dupEn.join(', ') : '无'}`);
const emptyZh = [...Object.entries(words.en), ...Object.entries(words.ja)]
  .filter(([, v]) => !v.zh || !v.reading)
  .map(([k]) => k);
console.log(`  缺 reading/zh: ${emptyZh.length ? emptyZh.join(', ') : '无'}`);
