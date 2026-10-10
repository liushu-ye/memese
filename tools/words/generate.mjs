/**
 * 自动维护词表：读 memes.json，产出/更新 words.json。
 *
 * 为什么这样设计：
 * - LLM 只在**数据变化时**跑一次，产出静态 JSON。App 端零 token、零网络、零延迟。
 * - memes.json 没变就直接跳过（比对 hash），重复运行不花一分钱。
 * - 合并时**已有词条优先**，所以你可以手工修正词表，自动流程不会覆盖你的修改。
 * - 没配 LLM 也不报错：保留现有词表，只报告缺了哪些词。
 *
 * 环境变量（二选一）：
 *   DEEPSEEK_API_KEY   → 走 DeepSeek
 *   GITHUB_TOKEN       → 走 GitHub Models（Actions 内置，无需额外配置密钥）
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const MEMES = 'data/memes.json';
const WORDS = 'data/words.json';

const memes = JSON.parse(fs.readFileSync(MEMES, 'utf8'));
const words = fs.existsSync(WORDS) ? JSON.parse(fs.readFileSync(WORDS, 'utf8')) : { en: {}, ja: {} };
words.en ??= {};
words.ja ??= {};

const sourceHash = crypto.createHash('sha256').update(JSON.stringify(memes)).digest('hex').slice(0, 16);
const knownHash = words._meta?.sourceHash;

// ───────────────────────── 同步前先算「缺什么」 ─────────────────────────

const normEn = (w) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
const enTokens = new Set();
for (const m of memes) {
  for (const tok of String(m['英语'] ?? '').split(/\s+/)) {
    const w = normEn(tok);
    if (w) enTokens.add(w);
  }
}
const enMissing = [...enTokens].filter((w) => !words.en[w]);

function cjkCoverage(text, dict) {
  // 与 App 端一致的贪心最长匹配，用来判断日语有没有点不动的实词
  const keys = Object.keys(dict);
  const maxLen = keys.length ? Math.max(...keys.map((k) => k.length)) : 0;
  const gaps = [];
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const c = text.slice(i, i + len);
      if (dict[c]) { hit = c; break; }
    }
    if (hit) i += hit.length;
    else { gaps.push(text[i]); i++; }
  }
  return gaps.join('');
}

const PUNCT = /^[\s、。，！？（）()？…「」【】!?,.—]+$/;

/**
 * 占位符不算缺词。
 * 例如「古代ギリシャの○○の神」里的 ○○ —— 它本来就不该被点开，
 * 若把它算作缺口，每次运行都会判定"有缺词"从而白白调用一次 LLM。
 */
const PLACEHOLDER = new Set(['○', '×', '〇', '□', '?', '？', '*', '...', '…']);

const jaMissing = [];
for (const m of memes) {
  const gaps = cjkCoverage(String(m['日语'] ?? ''), words.ja);
  const real = gaps.split('').filter((c) => !PUNCT.test(c) && !PLACEHOLDER.has(c)).join('');
  if (real) jaMissing.push({ id: m.ID, gaps: real, text: m['日语'] });
}

console.log(`梗数据 hash : ${sourceHash}  (词表现存 ${knownHash ?? '无'})`);
console.log(`英语缺词    : ${enMissing.length ? enMissing.join(' ') : '无'}`);
console.log(`日语缺口    : ${jaMissing.length ? jaMissing.map((x) => `[${x.id}]${x.gaps}`).join(' ') : '无'}`);

if (!enMissing.length && !jaMissing.length && knownHash === sourceHash) {
  console.log('\n✅ 数据没有变化，词表已是最新。跳过 LLM 调用（0 token）。');
  process.exit(0);
}

// ───────────────────────── LLM ─────────────────────────

function llmTarget() {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      name: 'DeepSeek',
      url: 'https://api.deepseek.com/chat/completions',
      key: process.env.DEEPSEEK_API_KEY,
      model: process.env.LLM_MODEL || 'deepseek-chat',
    };
  }
  if (process.env.GITHUB_TOKEN) {
    return {
      name: 'GitHub Models',
      url: 'https://models.github.ai/inference/chat/completions',
      key: process.env.GITHUB_TOKEN,
      model: process.env.LLM_MODEL || 'openai/gpt-4o-mini',
    };
  }
  return null;
}

const target = llmTarget();

if (!target) {
  console.log('\n⚠️ 没有配置 LLM（DEEPSEEK_API_KEY 或 GITHUB_TOKEN），跳过自动生成。');
  console.log('   词表保持原样，App 只是对这些词不可点，功能不会坏。');
  console.log('   想补词可以手工编辑 data/words.json，或配好密钥后重跑。');
  process.exit(0);
}

const existingKeys = {
  en: Object.keys(words.en),
  ja: Object.keys(words.ja),
};

const payload = memes.map((m) => ({ ID: m.ID, zh: m['中文'], en: m['英语'], ja: m['日语'] }));

const system = `你是语言学习词典的编纂助手。用户给一批中文网络梗及其英日翻译。

任务：
1. 把每条英语、日语文本切分成"词"（日语需自行判断词边界；英语按单词，连字符词算一个）
2. 列出所有出现过的不同的词
3. 为每个词给出读音和中文释义

严格要求：
- 英语读音用 IPA 音标（含斜杠，如 /ˈiːtərnl/）
- 日语读音用平假名
- 中文释义要简洁，10 字以内，必要时可加一句用法提示
- 切分时**优先沿用"已收录词表"里的边界**，不要改动既有词的切法
- 只输出 JSON，不要任何解释、不要 markdown 代码围栏

输出格式：
{"en":{"<词>":{"reading":"<IPA>","zh":"<释义>"}},"ja":{"<词>":{"reading":"<假名>","zh":"<释义>"}}}`;

const user = `## 已收录的英语词（请沿用这些边界）
${existingKeys.en.join(' ') || '（空）'}

## 已收录的日语词（请沿用这些边界）
${existingKeys.ja.join(' ') || '（空）'}

## 待处理的梗数据
${JSON.stringify(payload, null, 1)}`;

console.log(`\n调用 ${target.name} (${target.model}) ...`);

let content;
try {
  const res = await fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.key}`,
    },
    body: JSON.stringify({
      model: target.model,
      temperature: 0.2,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`响应里没有内容: ${JSON.stringify(json).slice(0, 300)}`);
} catch (e) {
  console.error(`\n❌ LLM 调用失败：${e.message}`);
  console.error('   词表未修改。');
  process.exit(1);
}

// 容忍模型偶尔套上 ```json 围栏
const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

let generated;
try {
  generated = JSON.parse(cleaned);
} catch (e) {
  console.error(`\n❌ 模型返回的不是合法 JSON：${e.message}`);
  console.error('   原始返回前 500 字：\n' + content.slice(0, 500));
  process.exit(1);
}

// ───────────────────────── 合并：已有优先 ─────────────────────────

let addedEn = 0;
let addedJa = 0;
for (const [k, v] of Object.entries(generated.en ?? {})) {
  if (!words.en[k] && v?.reading && v?.zh) { words.en[k] = { reading: v.reading, zh: v.zh }; addedEn++; }
}
for (const [k, v] of Object.entries(generated.ja ?? {})) {
  if (!words.ja[k] && v?.reading && v?.zh) { words.ja[k] = { reading: v.reading, zh: v.zh }; addedJa++; }
}

words._meta = {
  ...(words._meta ?? {}),
  sourceHash,
  updatedAt: new Date().toISOString(),
  generator: `${target.name}/${target.model}`,
};

// 保持键有序，方便 diff 阅读
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, 'zh')));
fs.writeFileSync(WORDS, JSON.stringify(
  { _meta: words._meta, en: sorted(words.en), ja: sorted(words.ja) },
  null,
  2,
) + '\n', 'utf8');

console.log(`\n✅ 词表已更新：英语 +${addedEn}，日语 +${addedJa}`);
console.log(`   合计 ${Object.keys(words.en).length} 英 / ${Object.keys(words.ja).length} 日`);
console.log('   已收录的词条一律保留，不覆盖手工修改。');
