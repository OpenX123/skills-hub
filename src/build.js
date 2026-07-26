import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ensureDir, readJSON, writeJSON, slug } from './lib/fsx.js';
import { log, color } from './lib/log.js';
import { categorize, bilingualDescription, detectLang, CATEGORIES, categoryLabel } from './categorize.js';
import { loadCache as loadTranslations, descKey } from './translate.js';
import { dedupe } from './dedupe.js';
import { TYPES, TYPE_LABEL } from './detect.js';

const DAY = 86400000;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function loadRaw() {
  ensureDir(PATHS.raw);
  const files = fs.readdirSync(PATHS.raw).filter((f) => f.endsWith('.json') && f !== '_manifest.json');
  return files.map((f) => readJSON(path.join(PATHS.raw, f))).filter(Boolean);
}

function makeId(e, used) {
  const repo = e.source.repo || e.source.registry || 'unknown';
  const base = `${e.type}:${repo}:${e.source.path}#${slug(e.name, 60)}`.toLowerCase();
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}~${n++}`;
  used.add(id);
  return id;
}

function scoreEntry(e, { mentions, meta }) {
  const stars = meta?.stars ?? null;
  const pushedAt = meta?.pushedAt ? Date.parse(meta.pushedAt) : null;
  const freshnessDays = pushedAt ? Math.max(0, Math.round((Date.now() - pushedAt) / DAY)) : null;

  const mentionCount = mentions?.size || 0;
  const mentionNorm = clamp(Math.min(mentionCount, 5) / 5);
  const starNorm = stars == null ? 0 : clamp(Math.log10(stars + 1) / Math.log10(50001));
  const freshNorm = freshnessDays == null ? 0.5 : clamp(1 - Math.min(freshnessDays, 540) / 540);

  const descLen = (e.description?.raw || '').length;
  const hasFm = !!(e.spec?.hasFrontmatter ?? Object.keys(e.frontmatter || {}).length);
  const hasAssets = !!(e.spec?.hasReferences || (e.spec?.assetFiles ?? 0) > 1);
  const completeness = (descLen >= 20 ? 0.4 : descLen > 0 ? 0.15 : 0) + (hasFm ? 0.3 : 0) + (hasAssets ? 0.3 : 0);

  const risk = e.audit?.score ?? 0;
  // 批量生成的模板族属于灌仓库存,差异化低,按族规模降权
  const famPenalty = e.familySize > 2 ? Math.min(12, Math.round(Math.log2(e.familySize) * 3)) : 0;
  const raw = 40 * mentionNorm + 25 * starNorm + 20 * freshNorm + 15 * completeness - 0.3 * risk - famPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const gates = {
    security: !['critical', 'high'].includes(e.audit?.level),
    schema: !!e.name && descLen >= 20,
    unique: !e.duplicateOf && !e.nearDuplicateOf,
    alive: freshnessDays == null ? true : freshnessDays <= 365,
  };

  return {
    signals: {
      curatedMentions: mentionCount,
      curatedBy: [...(mentions || [])].slice(0, 10),
      stars,
      freshnessDays,
      dupCount: e.dupCount || 0,
      familySize: e.familySize || 0,
      completeness: Math.round(completeness * 100) / 100,
    },
    quality: {
      score,
      gates,
      passed: Object.values(gates).every(Boolean),
      recommended: Object.values(gates).every(Boolean) && score >= 40,
    },
  };
}

export function build() {
  const bundles = loadRaw();
  if (!bundles.length) throw new Error('data/raw 为空 —— 先跑 crawl');

  // 元数据 + 榜单投票图
  const metaMap = {};
  const mentionMap = new Map(); // repo(lower) -> Set(策展源)
  for (const b of bundles) {
    if (b.repo && b.repoMeta) metaMap[b.repo] = b.repoMeta;
    for (const m of b.mentions || []) {
      const k = m.to.toLowerCase();
      if (!mentionMap.has(k)) mentionMap.set(k, new Set());
      mentionMap.get(k).add(m.from);
    }
  }

  // 归一化
  const translations = loadTranslations().entries;
  let filledZh = 0;
  const used = new Set();
  const entries = [];
  for (const b of bundles) {
    for (const e of b.entries || []) {
      const desc = bilingualDescription(e.description, e.name);
      // 用译文缓存补中文。译文按英文原文哈希索引,与条目 id 无关,
      // 所以换仓库/改路径都能命中,定时任务只需翻当轮新出现的文本。
      if (!desc.zh && desc.en) {
        const hit = translations[descKey(desc.en)];
        if (hit?.zh) {
          desc.zh = hit.zh;
          desc.zhEngine = hit.engine;
          desc.needsTranslation = desc.needsTranslation.filter((x) => x !== 'zh');
          filledZh++;
        }
      }
      const topics = metaMap[e.source.repo]?.topics || [];
      const n = {
        id: null,
        type: e.type,
        flavor: e.flavor || null,
        name: e.name,
        description: desc,
        lang: desc.lang === 'unknown' ? detectLang(e.name) : desc.lang,
        categories: categorize({ name: e.name, description: desc.raw, path: e.source.path, topics }),
        targets: e.targets || [],
        source: { ...e.source, ref: b.ref || null },
        contentHash: e.contentHash,
        sketch: e.sketch || null,
        bytes: e.bytes,
        preview: e.bodyPreview,
        spec: e.spec || {},
        risk: e.audit
          ? { level: e.audit.level, score: e.audit.score, counts: e.audit.counts, flags: e.audit.flags, engine: e.audit.engine, dampened: e.audit.dampened }
          : { level: 'unscanned', score: 0, counts: {}, flags: [] },
        repoMeta: metaMap[e.source.repo] || null,
        crawledAt: b.crawledAt,
      };
      n.audit = e.audit;
      n.id = makeId(n, used);
      entries.push(n);
    }
  }

  // 去重(精确 + 近似两层)
  const { duplicateCount, nearDuplicateCount, templateFamilyCount, templateFamilyGroups, groupCount } = dedupe(entries, metaMap);
  for (const e of entries) delete e.sketch; // 草图只用于计算,不入库

  // 打分
  for (const e of entries) {
    const mset = mentionMap.get(String(e.source.repo || '').toLowerCase()) || new Set();
    const { signals, quality } = scoreEntry(e, { mentions: mset, meta: e.repoMeta });
    e.signals = signals;
    e.quality = quality;
    delete e.audit;
  }

  entries.sort((a, b) => b.quality.score - a.quality.score || a.id.localeCompare(b.id));

  // ---- 产出 ----
  ensureDir(PATHS.registry);
  const generatedAt = new Date().toISOString();

  const lite = (e) => ({
    id: e.id, type: e.type, name: e.name,
    description: {
      zh: e.description.zh, en: e.description.en,
      zhEngine: e.description.zhEngine || null,
      needsTranslation: e.description.needsTranslation,
    },
    lang: e.lang, categories: e.categories, targets: e.targets,
    source: { repo: e.source.repo, path: e.source.path, url: e.source.url, tier: e.source.tier },
    quality: e.quality, risk: { level: e.risk.level, score: e.risk.score },
    duplicateOf: e.duplicateOf, nearDuplicateOf: e.nearDuplicateOf || null,
    dupCount: e.dupCount, variantCount: e.variantCount || 0,
    templateFamily: e.templateFamily || null, familySize: e.familySize || 0,
    stars: e.signals.stars, curatedMentions: e.signals.curatedMentions,
  });

  const byType = {};
  const byCategory = {};
  const byLang = {};
  const riskBuckets = {};
  for (const e of entries) {
    (byType[e.type] ||= []).push(e);
    for (const c of e.categories) (byCategory[c] ||= []).push(e);
    byLang[e.lang] = (byLang[e.lang] || 0) + 1;
    riskBuckets[e.risk.level] = (riskBuckets[e.risk.level] || 0) + 1;
  }

  const isCanonical = (e) => !e.duplicateOf && !e.nearDuplicateOf;
  const canonicalEntries = entries.filter(isCanonical);
  const recommended = entries.filter((e) => e.quality.recommended);
  const redundant = duplicateCount + nearDuplicateCount;

  const stats = {
    generatedAt,
    total: entries.length,
    canonical: canonicalEntries.length,
    duplicates: duplicateCount,
    nearDuplicates: nearDuplicateCount,
    templateFamilyEntries: templateFamilyCount,
    templateFamilyGroups,
    redundant,
    dedupeRatio: entries.length ? Math.round((redundant / entries.length) * 1000) / 10 : 0,
    contentGroups: groupCount,
    recommended: recommended.length,
    byType: Object.fromEntries(TYPES.map((t) => [t, (byType[t] || []).length])),
    byTypeCanonical: Object.fromEntries(TYPES.map((t) => [t, (byType[t] || []).filter(isCanonical).length])),
    byCategory: Object.fromEntries(
      [...CATEGORIES.map((c) => c.key), 'other'].map((k) => [k, (byCategory[k] || []).length])
    ),
    byLang,
    translation: {
      withZh: entries.filter((e) => e.description.zh).length,
      machineTranslated: entries.filter((e) => e.description.zhEngine).length,
      pendingZh: entries.filter((e) => !e.description.zh && e.description.en).length,
      noDescription: entries.filter((e) => !e.description.raw).length,
    },
    byRisk: riskBuckets,
    gateFailures: {
      security: entries.filter((e) => !e.quality.gates.security).length,
      schema: entries.filter((e) => !e.quality.gates.schema).length,
      unique: entries.filter((e) => !e.quality.gates.unique).length,
      alive: entries.filter((e) => !e.quality.gates.alive).length,
    },
    sources: bundles.map((b) => ({
      repo: b.repo, tier: b.tier, role: b.role, lang: b.lang,
      entries: (b.entries || []).length, mentions: (b.mentions || []).length,
      stars: b.repoMeta?.stars ?? null, ref: b.ref ? b.ref.slice(0, 8) : null,
      crawledAt: b.crawledAt,
    })).sort((a, b) => b.entries - a.entries),
  };

  writeJSON(path.join(PATHS.registry, 'stats.json'), stats);
  writeJSON(path.join(PATHS.registry, 'index.json'), {
    generatedAt, schema: 1, counts: stats.byType, total: entries.length,
    categories: CATEGORIES.map((c) => ({ key: c.key, zh: c.zh, en: c.en })).concat([{ key: 'other', zh: '其他', en: 'Other' }]),
    types: TYPES.map((t) => ({ key: t, ...TYPE_LABEL[t] })),
    entries: entries.map(lite),
  });
  writeJSON(path.join(PATHS.registry, 'entries.json'), { generatedAt, entries }, false);

  ensureDir(path.join(PATHS.registry, 'by-type'));
  for (const t of TYPES) {
    writeJSON(path.join(PATHS.registry, 'by-type', `${t}.json`), {
      generatedAt, type: t, label: TYPE_LABEL[t],
      total: (byType[t] || []).length,
      entries: (byType[t] || []).map(lite),
    });
  }

  ensureDir(PATHS.byCategory);
  for (const key of [...CATEGORIES.map((c) => c.key), 'other']) {
    const list = byCategory[key] || [];
    writeJSON(path.join(PATHS.byCategory, `${key}.json`), {
      generatedAt, category: categoryLabel(key), total: list.length, entries: list.map(lite),
    });
  }

  // 风险报告 —— 这是审计层的对外产物
  const flagged = entries
    .filter((e) => e.risk.score > 0)
    .sort((a, b) => b.risk.score - a.risk.score)
    .map((e) => ({
      id: e.id, name: e.name, type: e.type,
      repo: e.source.repo, path: e.source.path, url: e.source.url,
      level: e.risk.level, score: e.risk.score, counts: e.risk.counts,
      flags: e.risk.flags.map((f) => ({ id: f.id, severity: f.severity, title: f.title, where: f.where, line: f.line, evidence: f.evidence })),
    }));
  writeJSON(path.join(PATHS.registry, 'risk-report.json'), {
    generatedAt,
    engine: entries.find((e) => e.risk?.engine)?.risk.engine || 'text-baseline',
    scanned: entries.length, flagged: flagged.length,
    byLevel: riskBuckets,
    note: '静态文本匹配基线,用于筛出需人工复核的条目,不构成终审判决',
    entries: flagged,
  });

  log.head('归一化完成');
  log.detail(`总条目 ${color.bold(String(stats.total))} · canonical ${stats.canonical} · 精确重复 ${stats.duplicates} · 近似重复 ${stats.nearDuplicates} · 冗余率 ${stats.dedupeRatio}% · 推荐 ${stats.recommended}`);
  log.detail('类型:' + Object.entries(stats.byType).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' '));
  log.detail(`中文描述:${color.bold(String(stats.translation.withZh))}/${stats.total}(本轮由译文缓存补 ${filledZh} 条,仍缺 ${stats.translation.pendingZh})`);
  log.detail('风险:' + Object.entries(riskBuckets).map(([k, v]) => `${k}=${v}`).join(' '));

  return stats;
}
