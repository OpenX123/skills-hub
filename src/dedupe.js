/**
 * 去重与 canonical 判定。
 *
 * 上游生态最大的噪音源是搬运:官方那几个文档 skill 被复制了成百上千遍。
 * 按内容指纹分组后,要从一组相同内容里选出「原始出处」。
 *
 * 优先级:tier 越低越权威 > star 越多 > 仓库创建越早 > 路径越短 > repo 名字典序(保证结果稳定)
 */

import { bandKeys, similarity } from './lib/minhash.js';

function canonicalRank(e, metaMap) {
  const meta = metaMap[e.source.repo] || {};
  return [
    e.source.tier ?? 9,
    -(meta.stars ?? 0),
    meta.createdAt ? Date.parse(meta.createdAt) : Number.MAX_SAFE_INTEGER,
    String(e.source.path || '').split('/').length,
    String(e.source.repo || '~'),
  ];
}

function cmp(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/** 并查集,用于把近似重复聚成簇 */
function makeUF(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) p[ra] = rb; };
  return { find, union };
}

/**
 * 近似重复:MinHash + LSH 分带找候选对,再按相似度阈值聚簇。
 * 精确哈希只能抓逐字节相同的搬运,改几个字就绕过 —— 这一层才反映真实重复率。
 */
function nearDedupe(heads, metaMap, threshold = 0.75) {
  const idx = heads.map((e, i) => i).filter((i) => heads[i].sketch);
  if (idx.length < 2) return 0;

  const buckets = new Map();
  for (const i of idx) {
    for (const k of bandKeys(heads[i].sketch)) {
      const key = heads[i].type + '|' + k;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
  }

  const uf = makeUF(heads.length);
  const checked = new Set();
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > 400) continue; // 超大桶多为退化草图,跳过
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const i = list[a], j = list[b];
        const pk = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (checked.has(pk)) continue;
        checked.add(pk);
        if (similarity(heads[i].sketch, heads[j].sketch) >= threshold) uf.union(i, j);
      }
    }
  }

  const clusters = new Map();
  for (const i of idx) {
    const r = uf.find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  }

  let near = 0;
  let family = 0;
  let familyGroups = 0;

  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const sorted = members
      .map((i) => heads[i])
      .sort((a, b) => cmp(canonicalRank(a, metaMap), canonicalRank(b, metaMap)));
    const head = sorted[0];

    // 同仓库内的高相似簇不是搬运,是模板批量生成(如一个厂商为每个 SaaS 生成一份 skill)。
    // 语义上各不相同,不能判重;但它是「批量灌仓」的指纹,单独标记并降权。
    const repos = new Set(sorted.map((x) => x.source.repo));
    const familyId = `${head.source.repo}:${head.name}`;

    if (repos.size === 1) {
      familyGroups++;
      for (const m of sorted) {
        m.templateFamily = familyId;
        m.familySize = sorted.length;
        family++;
      }
      continue;
    }

    head.variantCount = 0;
    head.variants = [];
    for (const v of sorted.slice(1)) {
      if (v.source.repo === head.source.repo) {
        v.templateFamily = familyId;
        v.familySize = sorted.length;
        family++;
      } else {
        v.nearDuplicateOf = head.id;
        head.variantCount++;
        if (head.variants.length < 20) head.variants.push(`${v.source.repo}:${v.source.path}`);
        near++;
      }
    }
  }
  return { near, family, familyGroups };
}

/**
 * @param entries 已带 id 的条目数组
 * @param metaMap { 'owner/repo': {stars, createdAt} }
 * @returns 同一数组(原地补 canonical / duplicateOf / nearDuplicateOf / dupCount 字段)
 */
export function dedupe(entries, metaMap = {}) {
  const groups = new Map();
  for (const e of entries) {
    // 只在同类型内比对 —— 相同文本的 rules 和 skill 是两种东西
    const key = `${e.type}|${e.contentHash}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  let dupTotal = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      const e = group[0];
      e.canonical = e.id;
      e.duplicateOf = null;
      e.nearDuplicateOf = null;
      e.dupCount = 0;
      continue;
    }
    const sorted = [...group].sort((a, b) => cmp(canonicalRank(a, metaMap), canonicalRank(b, metaMap)));
    const head = sorted[0];
    head.canonical = head.id;
    head.duplicateOf = null;
    head.nearDuplicateOf = null;
    head.dupCount = sorted.length - 1;
    head.duplicateSources = sorted.slice(1, 21).map((x) => `${x.source.repo}:${x.source.path}`);
    for (const d of sorted.slice(1)) {
      d.canonical = head.id;
      d.duplicateOf = head.id;
      d.nearDuplicateOf = null;
      d.dupCount = 0;
      dupTotal++;
    }
  }

  // 第二层:在精确去重的幸存者之间找「改了几个字的搬运」
  const heads = entries.filter((e) => !e.duplicateOf);
  const { near, family, familyGroups } = nearDedupe(heads, metaMap);

  return {
    entries,
    duplicateCount: dupTotal,
    nearDuplicateCount: near,
    templateFamilyCount: family,
    templateFamilyGroups: familyGroups,
    groupCount: groups.size,
  };
}
