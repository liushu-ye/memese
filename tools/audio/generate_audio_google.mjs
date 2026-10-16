/**
 * 用 Google 翻译的 TTS 端点补齐发音音频。
 *
 * 为什么需要这个：Edge TTS 的端点会对同一 IP 限流，跑几百个请求后持续返回 403
 * （不是瞬时的，隔一段时间单发请求仍然 403）。Google 这条是现成的替代。
 *
 * 音质介于 Edge 神经音色和 Windows SAPI 之间；两者都是非官方端点，
 * 所以音频一律**生成一次就提交进仓库**，端点失效也不影响已发布的 App。
 *
 * 用法：node tools/audio/generate_audio_google.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AUDIO = 'app/src/main/assets/audio';
const INDEX = path.join(AUDIO, 'index.json');
const WORDS = 'data/words.json';

const LANGS = ['en', 'ja'];
const CONCURRENCY = 3;
const GAP_MS = 250;
const RETRIES = 3;
const MIN_BYTES = 2000;

const force = process.argv.includes('--force');
const words = JSON.parse(fs.readFileSync(WORDS, 'utf8'));

const digest = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 16);

/** 文件有效 = 够大 且 真的是 mp3（ID3 头或帧同步字）。 */
function valid(file) {
  if (!fs.existsSync(file)) return false;
  const size = fs.statSync(file).size;
  if (size < MIN_BYTES) return false;
  const head = Buffer.alloc(3);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 3, 0);
  fs.closeSync(fd);
  const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
  const isFrame = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  return isId3 || isFrame;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function googleTts(text, lang) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
    `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function one(lang, word) {
  const dir = path.join(AUDIO, lang);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${digest(word)}.mp3`);

  if (force && fs.existsSync(file)) fs.rmSync(file);
  if (valid(file)) return { ok: true, skipped: true };

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const buf = await googleTts(word, lang);
      fs.writeFileSync(file, buf);
      if (valid(file)) {
        await sleep(GAP_MS);
        return { ok: true };
      }
      throw new Error(`返回内容不是有效 mp3（${buf.length} 字节）`);
    } catch (e) {
      if (attempt === RETRIES) {
        if (fs.existsSync(file)) fs.rmSync(file);
        console.error(`  FAIL ${lang}:${word}  ${e.message}`);
        return { ok: false };
      }
      await sleep(1500 * attempt);
    }
  }
  return { ok: false };
}

/** 并发池：避免一次性把几百个请求全抛出去。 */
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

const jobs = [];
for (const lang of LANGS) {
  for (const word of Object.keys(words[lang] ?? {})) jobs.push({ lang, word });
}

console.log(`词表合计 ${jobs.length} 条，开始检查/补齐...`);
const results = await runPool(jobs, (j) => one(j.lang, j.word), CONCURRENCY);

const skipped = results.filter((r) => r?.skipped).length;
const made = results.filter((r) => r?.ok && !r.skipped).length;
const failed = results.filter((r) => !r?.ok).length;
console.log(`  已有(跳过) ${skipped}   新生成 ${made}   失败 ${failed}`);

// 重建清单：只有真正有效的音频才进清单
const index = {};
for (const { lang, word } of jobs) {
  const rel = `audio/${lang}/${digest(word)}.mp3`;
  if (valid(path.join(AUDIO, lang, `${digest(word)}.mp3`))) index[`${lang}:${word}`] = rel;
}
fs.writeFileSync(INDEX, JSON.stringify(index, null, 1, ) + '\n', 'utf8');

console.log(`\n清单: ${Object.keys(index).length} / ${jobs.length} 条`);
if (Object.keys(index).length < jobs.length) {
  console.log('⚠️  有词没有有效音频，App 会对这些词回退到系统 TTS');
  process.exitCode = 1;
}
