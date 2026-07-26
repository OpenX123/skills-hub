/**
 * MinHash 草图 —— 近似去重用。
 *
 * 精确内容哈希只能抓到逐字节相同的搬运,但实测上游改几个字就能绕过:
 * 同名 skill 常有 5~8 个 hash 不同的版本。近似去重才是真实重复率。
 *
 * 零依赖实现:k-word shingle + n 个种子 FNV-1a,取每个哈希函数的最小值。
 * 两个草图相同位置的相等比例即 Jaccard 相似度的无偏估计。
 */

const N_HASH = 16;
const SHINGLE_K = 5;
const MIN_WORDS = 40; // 太短的文本草图不可靠,退回精确匹配

const SEEDS = Array.from({ length: N_HASH }, (_, i) => (0x811c9dc5 ^ (i * 0x9e3779b1)) >>> 0);

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** @returns {number[]|null} 长度 N_HASH 的草图;文本过短返回 null */
export function sketch(text) {
  const w = tokens(text);
  if (w.length < MIN_WORDS) return null;

  const shingles = new Set();
  for (let i = 0; i + SHINGLE_K <= w.length; i++) shingles.add(w.slice(i, i + SHINGLE_K).join(' '));
  if (!shingles.size) return null;

  const mins = new Array(N_HASH).fill(0xffffffff);
  for (const s of shingles) {
    for (let j = 0; j < N_HASH; j++) {
      const h = fnv1a(s, SEEDS[j]);
      if (h < mins[j]) mins[j] = h;
    }
  }
  return mins;
}

export function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let eq = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) eq++;
  return eq / a.length;
}

/** LSH 分带:同带同值才成为候选对,避免 O(n²) 全比 */
export const BANDS = 4;
export function bandKeys(s) {
  if (!s) return [];
  const per = s.length / BANDS;
  const keys = [];
  for (let b = 0; b < BANDS; b++) {
    keys.push(b + ':' + s.slice(b * per, (b + 1) * per).join(','));
  }
  return keys;
}
