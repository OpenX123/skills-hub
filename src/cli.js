#!/usr/bin/env node
import path from 'node:path';
import { PATHS, readJSON } from './lib/fsx.js';
import { log, color, setQuiet } from './lib/log.js';
import { crawl } from './crawl.js';
import { build } from './build.js';
import { buildSite } from './site.js';
import {
  translatePending, buildQueue, mergeQueue, collectPending,
  loadCache as loadTranslations, cacheStats, pickProvider, QUEUE_DIR,
} from './translate.js';
import { categoryLabel } from './categorize.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (key.startsWith('no-')) { out[key.slice(3)] = false; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
    out[key] = next;
    i++;
  }
  return out;
}

const listOpt = (v) => (v == null || v === true ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));

function usage() {
  console.log(`
${color.bold('skills-hub')} — 跨端 Agent 资源注册表

  ${color.cyan('node src/cli.js <命令> [选项]')}

命令
  crawl              抓取种子源(增量:上游未变则复用上轮结果)
  build              归一化 / 分类 / 去重 / 打分 / 产出 registry
  sync               crawl + build + translate + site(--no-translate 可跳过翻译)
  site               从 registry 生成静态站点(site/)
  translate          把缺失的中文描述补齐(增量,按英文原文哈希缓存)
    --status           查看译文缓存与待翻数量
    --queue            生成分片队列(供并发回填)
    --merge            把 out-*.json 分片合并进缓存
    --provider=auto|claude-cli|anthropic-api
    --batch=40 --limit=N
  stats              打印底表
  search <关键词>    在 registry 中检索
  risk               列出风险条目

选项
  --tier 0,1,2       只抓指定层级
  --only <子串>      只抓仓库名含该子串的源(逗号分隔)
  --limit <n>        限制仓库数量
  --force            忽略增量缓存,全量重抓
  --no-mcp           跳过 MCP registry
  --type/--cat/--lang/--limit   search 的过滤条件
  --quiet            静默

示例
  node src/cli.js sync
  node src/cli.js crawl --tier 0,2 --force
  node src/cli.js search 小红书 --lang zh
  node src/cli.js risk --limit 20
`);
}

function printStats() {
  const s = readJSON(path.join(PATHS.registry, 'stats.json'));
  if (!s) { log.err('还没有 registry/stats.json,先跑 sync'); process.exitCode = 1; return; }

  log.head(`底表 · 生成于 ${s.generatedAt}`);
  console.log(`  总条目 ${color.bold(String(s.total))}   canonical ${color.green(String(s.canonical))}   推荐 ${color.cyan(String(s.recommended))}`);
  console.log(`  ${color.gray('冗余')} 精确重复 ${s.duplicates} · 跨仓搬运 ${s.nearDuplicates} · 冗余率 ${s.dedupeRatio}%`);
  console.log(`  ${color.gray('灌仓')} 模板批量生成 ${s.templateFamilyEntries} 条 / ${s.templateFamilyGroups} 族`);

  log.head('按类型');
  for (const [k, v] of Object.entries(s.byType)) {
    if (!v) continue;
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(6)}   canonical ${String(s.byTypeCanonical[k]).padStart(6)}`);
  }

  log.head('按分类');
  const cats = Object.entries(s.byCategory).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of cats) {
    const l = categoryLabel(k);
    console.log(`  ${(l.zh + ' / ' + l.en).padEnd(28)} ${String(v).padStart(6)}`);
  }

  log.head('按语言');
  for (const [k, v] of Object.entries(s.byLang).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(6)}`);
  }

  log.head('风险分布');
  const order = ['critical', 'high', 'medium', 'low', 'clean', 'unscanned'];
  for (const k of order) {
    if (!s.byRisk[k]) continue;
    const paint = k === 'critical' || k === 'high' ? color.red : k === 'medium' ? color.yellow : color.gray;
    console.log(`  ${paint(k.padEnd(10))} ${String(s.byRisk[k]).padStart(6)}`);
  }

  log.head('闸门未过');
  for (const [k, v] of Object.entries(s.gateFailures)) {
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(6)}`);
  }

  log.head('源仓库产出 Top 15');
  for (const r of s.sources.slice(0, 15)) {
    const star = r.stars == null ? '-' : String(r.stars);
    console.log(`  ${String(r.entries).padStart(6)}  ${color.gray('t' + r.tier)} ${r.repo.padEnd(46)} ${color.gray('★' + star.padStart(7))}  ${color.gray(r.role || '')}`);
  }
  console.log();
}

function search(argv) {
  const args = parseArgs(argv);
  const q = args._.join(' ').toLowerCase().trim();
  const idx = readJSON(path.join(PATHS.registry, 'index.json'));
  if (!idx) { log.err('还没有 registry/index.json,先跑 sync'); process.exitCode = 1; return; }
  if (!q) { log.err('给个关键词'); process.exitCode = 1; return; }

  const type = args.type ? String(args.type) : null;
  const cat = args.cat ? String(args.cat) : null;
  const lang = args.lang ? String(args.lang) : null;
  const limit = Number(args.limit || 20);

  const hits = idx.entries.filter((e) => {
    if (type && e.type !== type) return false;
    if (cat && !e.categories.includes(cat)) return false;
    if (lang && e.lang !== lang) return false;
    const hay = `${e.name} ${e.description.zh || ''} ${e.description.en || ''} ${e.source.repo} ${e.source.path}`.toLowerCase();
    return hay.includes(q);
  }).slice(0, limit);

  log.head(`命中 ${hits.length} 条`);
  for (const e of hits) {
    const risk = e.risk.level === 'clean' ? '' : ' ' + (['critical', 'high'].includes(e.risk.level) ? color.red(`[${e.risk.level}]`) : color.yellow(`[${e.risk.level}]`));
    const dup = e.duplicateOf ? color.gray(' (副本)') : '';
    console.log(`\n  ${color.bold(e.name)} ${color.gray(e.type)}  ${color.cyan(String(e.quality.score))}${risk}${dup}`);
    console.log(`  ${color.gray(e.source.repo + ' · ' + e.source.path)}`);
    const d = e.description.zh || e.description.en || '';
    if (d) console.log(`  ${d.slice(0, 150)}`);
  }
  console.log();
}

function riskReport(argv) {
  const args = parseArgs(argv);
  const limit = Number(args.limit || 25);
  const r = readJSON(path.join(PATHS.registry, 'risk-report.json'));
  if (!r) { log.err('还没有 registry/risk-report.json,先跑 sync'); process.exitCode = 1; return; }

  log.head(`风险条目 ${r.flagged} / 已扫描 ${r.scanned}  ${color.gray('(' + r.engine + ')')}`);
  for (const e of r.entries.slice(0, limit)) {
    const paint = ['critical', 'high'].includes(e.level) ? color.red : e.level === 'medium' ? color.yellow : color.gray;
    console.log(`\n  ${paint(e.level.toUpperCase().padEnd(8))} ${color.bold(String(e.score).padStart(3))}  ${e.name} ${color.gray(e.type)}`);
    console.log(`  ${color.gray(e.repo + ' · ' + e.path)}`);
    for (const f of e.flags.slice(0, 4)) {
      console.log(`    ${color.gray('L' + f.line)} ${f.title.zh} ${color.gray('(' + f.id + ', ' + f.where + ')')}`);
      console.log(`      ${color.gray(String(f.evidence).slice(0, 110))}`);
    }
  }
  console.log();
}

async function translateCmd(argv) {
  const args = parseArgs(argv);
  const idx = readJSON(path.join(PATHS.registry, 'index.json'));
  if (!idx) { log.err('还没有 registry/index.json,先跑 sync'); process.exitCode = 1; return; }

  if (args.status) {
    const st = cacheStats();
    const cache = loadTranslations();
    const pend = collectPending(idx.entries, cache);
    log.head('译文缓存');
    log.detail(`缓存条数 ${st.total} · 待翻 ${pend.length} · provider=${pickProvider(args.provider)}`);
    log.detail('来源:' + (Object.entries(st.byEngine).map(([k, v]) => `${k}=${v}`).join(' ') || '（空）'));
    log.detail(st.file);
    return;
  }

  if (args.queue) {
    const cache = loadTranslations();
    const pend = collectPending(idx.entries, cache);
    const shards = buildQueue(pend, Number(args['shard-size'] || 125));
    log.ok(`分片队列已生成:${pend.length} 条待翻 -> ${shards.length} 个分片`);
    log.detail(QUEUE_DIR);
    return;
  }

  if (args.merge) {
    const { merged, shards } = mergeQueue(String(args.engine || 'agent'));
    log.ok(`已从 ${shards} 个分片合并 ${merged} 条译文进缓存`);
    return;
  }

  await translatePending(idx.entries, {
    provider: args.provider,
    batch: args.batch,
    limit: args.limit,
  });
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (args.quiet) setQuiet(true);

  const crawlOpts = {
    tiers: listOpt(args.tier).map(Number).filter((n) => !Number.isNaN(n)),
    only: listOpt(args.only),
    limit: args.limit ? Number(args.limit) : null,
    force: !!args.force,
    noMcp: args.mcp === false,
  };

  try {
    switch (cmd) {
      case 'crawl': await crawl(crawlOpts); break;
      case 'build': build(); break;
      case 'sync': {
        await crawl(crawlOpts);
        build();
        // 先 build 出 index.json,翻译层才知道这轮新增了哪些描述;
        // 翻完再 build 一次把中文灌回条目。两次 build 各约 2 秒,可忽略。
        if (args.translate !== false) {
          const idx = readJSON(path.join(PATHS.registry, 'index.json'));
          if (idx) {
            const r = await translatePending(idx.entries, { provider: args.provider, batch: args.batch });
            if (r.translated > 0) build();
          }
        }
        buildSite();
        break;
      }
      case 'site': buildSite(); break;
      case 'translate': await translateCmd(rest); break;
      case 'stats': printStats(); break;
      case 'search': search(rest); break;
      case 'risk': riskReport(rest); break;
      default: usage();
    }
  } catch (e) {
    log.err(e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exitCode = 1;
  }
}

main();
