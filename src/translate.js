import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PATHS, ensureDir, readJSON, writeJSON, p } from './lib/fsx.js';
import { sha256 } from './lib/hash.js';
import { log, color, progress } from './lib/log.js';

/**
 * 描述翻译层。
 *
 * 设计要点:
 *  1. **按英文文本哈希缓存**,不按条目 id。上游有大量重复/搬运,10,689 条待翻只对应
 *     10,486 条唯一文本;换了仓库、改了路径都不会让已翻译的文本重新计费。
 *  2. **增量**。缓存持久化在 data/translations.json,定时任务每天只翻当轮新出现的文本。
 *  3. **provider 可插拔**。本机用 claude CLI(复用已有登录态,无需 API key);
 *     CI 里若配了 ANTHROPIC_API_KEY 则走 API;都没有时不翻译、不伪造,保持 needsTranslation 标记。
 *  4. 大批量首次回填走分片队列,由外部并发填充 out-*.json,再 merge 进缓存。
 */

// 放在 data/ 根而非 data/cache/ —— cache 是 gitignore 的抓取中间产物,
// 而译文是要提交、跨 CI 复用的资产,丢了就得整轮重翻。
const CACHE = p('data', 'translations.json');
const QUEUE = p('data', 'translate-queue');
export const SHARD_SIZE = 125;

/** 归一化后再哈希:大小写/空白差异不该产生两份译文 */
export const descKey = (text) => sha256(String(text || '').replace(/\s+/g, ' ').trim().toLowerCase());

export function loadCache() {
  return readJSON(CACHE, { version: 1, entries: {} }) || { version: 1, entries: {} };
}
export function saveCache(cache) {
  ensureDir(path.dirname(CACHE));
  writeJSON(CACHE, cache, false);
  return CACHE;
}

/** 取所有缺中文、且有英文原文的唯一描述 */
export function collectPending(indexEntries, cache) {
  const seen = new Map();
  for (const e of indexEntries) {
    if (e.description?.zh) continue;
    const en = (e.description?.en || '').trim();
    if (!en) continue;
    const k = descKey(en);
    if (cache.entries[k]) continue;
    if (!seen.has(k)) seen.set(k, en);
  }
  return [...seen.entries()].map(([k, en]) => ({ k, en }));
}

/* ------------------------------------------------------------ 分片队列 */

export function buildQueue(pending, shardSize = SHARD_SIZE) {
  fs.rmSync(QUEUE, { recursive: true, force: true });
  ensureDir(QUEUE);
  const shards = [];
  for (let i = 0; i < pending.length; i += shardSize) {
    const idx = shards.length;
    const file = path.join(QUEUE, `in-${String(idx).padStart(3, '0')}.json`);
    writeJSON(file, pending.slice(i, i + shardSize), false);
    shards.push(file);
  }
  writeJSON(path.join(QUEUE, '_manifest.json'), {
    createdAt: new Date().toISOString(),
    total: pending.length,
    shardSize,
    shards: shards.length,
  });
  return shards;
}

/** 合并 out-*.json 回缓存。out 文件格式:{ "<key>": "中文", ... } */
export function mergeQueue(engine = 'agent') {
  const cache = loadCache();
  if (!fs.existsSync(QUEUE)) return { merged: 0, shards: 0, cache };
  const files = fs.readdirSync(QUEUE).filter((f) => /^out-\d+\.json$/.test(f));
  let merged = 0;
  const at = new Date().toISOString();
  for (const f of files) {
    const obj = readJSON(path.join(QUEUE, f));
    if (!obj || typeof obj !== 'object') continue;
    for (const [k, zh] of Object.entries(obj)) {
      const t = String(zh || '').trim();
      if (!t || cache.entries[k]) continue;
      cache.entries[k] = { zh: t, engine, at };
      merged++;
    }
  }
  saveCache(cache);
  return { merged, shards: files.length, cache };
}

/* ------------------------------------------------------------ provider */

const PROMPT_HEAD =
  '你是技术文档翻译。把下面 JSON 数组里每条英文描述翻译成简体中文。\n' +
  '要求:\n' +
  '- 严格输出一个 JSON 数组,长度和顺序与输入完全一致\n' +
  '- 不要输出任何解释、前言、markdown 代码围栏\n' +
  '- 保留专有名词与代码标识符原样(如 SKILL.md、MCP、Claude Code、npm 包名、API 名)\n' +
  '- 技术术语用中文开发者习惯译法,简洁自然,不要逐字硬译\n' +
  '- 若某条无法翻译,原样返回该条英文\n\n';

/** 从可能带围栏/前后缀/自我更正的输出里抽出最后一个合法 JSON 数组 */
export function extractJsonArray(text, expectLen) {
  const s = String(text || '');
  const candidates = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '[') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          candidates.push(s.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  for (const raw of candidates.reverse()) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
        if (!expectLen || arr.length === expectLen) return arr;
      }
    } catch { /* 下一个候选 */ }
  }
  return null;
}

// Windows 上 claude 是 shell shim(claude / claude.cmd),Node 不加 shell 解析不到,
// 必须 shell:true。但 shell:true 会把参数原样拼进命令行、不做转义,
// 所以 prompt 一律走 stdin —— 描述里带引号、竖线、换行都不会破坏调用。
function claudeCliAvailable() {
  const r = spawnSync('claude', ['--version'], {
    encoding: 'utf8', timeout: 20000, windowsHide: true, shell: true, input: '',
  });
  return r.status === 0;
}

/** 本机后端:走 claude CLI headless,复用已有登录态,不需要 API key */
function translateViaClaudeCli(texts, { timeout = 600000 } = {}) {
  const prompt = PROMPT_HEAD + JSON.stringify(texts);
  const r = spawnSync('claude', ['-p'], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    shell: true,
    input: prompt,
  });
  if (r.status !== 0) return null;
  return extractJsonArray(r.stdout, texts.length);
}

/** CI 后端:配了 ANTHROPIC_API_KEY 时用 Messages API */
async function translateViaApi(texts, { model = 'claude-sonnet-5', timeout = 180000 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: PROMPT_HEAD + JSON.stringify(texts) }],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const txt = (j.content || []).map((c) => c.text || '').join('');
    return extractJsonArray(txt, texts.length);
  } catch {
    return null;
  }
}

export function pickProvider(requested) {
  if (requested && requested !== 'auto') return requested;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic-api';
  if (claudeCliAvailable()) return 'claude-cli';
  return 'none';
}

/**
 * 增量翻译。定时任务用的就是这个入口 —— 每轮只处理缓存里没有的新文本。
 */
export async function translatePending(indexEntries, opts = {}) {
  const cache = loadCache();
  const pending = collectPending(indexEntries, cache);
  const provider = pickProvider(opts.provider);

  if (!pending.length) {
    log.ok('没有待翻译的新描述');
    return { provider, pending: 0, translated: 0, failed: 0 };
  }
  if (provider === 'none') {
    log.warn(`待翻译 ${pending.length} 条,但没有可用翻译后端(需 claude CLI 或 ANTHROPIC_API_KEY)`);
    return { provider, pending: pending.length, translated: 0, failed: pending.length };
  }

  const batch = Number(opts.batch || 40);
  const cap = opts.limit ? Math.min(pending.length, Number(opts.limit)) : pending.length;
  const work = pending.slice(0, cap);

  log.step(`翻译 ${work.length} 条(provider=${provider}, 批大小 ${batch})`);
  let translated = 0, failed = 0;
  const at = new Date().toISOString();

  for (let i = 0; i < work.length; i += batch) {
    const slice = work.slice(i, i + batch);
    const texts = slice.map((x) => x.en);
    const out =
      provider === 'anthropic-api'
        ? await translateViaApi(texts, opts)
        : translateViaClaudeCli(texts, opts);

    if (!out) {
      failed += slice.length;
    } else {
      slice.forEach((item, j) => {
        const zh = String(out[j] || '').trim();
        if (zh) {
          cache.entries[item.k] = { zh, engine: provider, at };
          translated++;
        } else failed++;
      });
      saveCache(cache); // 每批落盘,中断也不丢
    }
    progress(`已翻 ${translated} / 失败 ${failed}`, i + slice.length, work.length);
  }
  progress('', 1, 1);

  saveCache(cache);
  log.ok(`翻译完成:成功 ${color.green(String(translated))} · 失败 ${failed} · 缓存共 ${Object.keys(cache.entries).length} 条`);
  return { provider, pending: pending.length, translated, failed };
}

export function cacheStats() {
  const c = loadCache();
  const n = Object.keys(c.entries).length;
  const byEngine = {};
  for (const v of Object.values(c.entries)) byEngine[v.engine] = (byEngine[v.engine] || 0) + 1;
  return { total: n, byEngine, file: CACHE };
}

export { QUEUE as QUEUE_DIR, CACHE as CACHE_FILE };
