import path from 'node:path';
import { PATHS, ensureDir, readJSON, writeJSON, exists } from './lib/fsx.js';
import { log, color, progress } from './lib/log.js';
import { cloneOrUpdate, gitAvailable, repoDir } from './lib/git.js';
import { repoMeta, flushCache, ghAvailable } from './lib/gh.js';
import { extractRepo } from './extract.js';
import { harvestMentions } from './mentions.js';
import { auditEntry } from './audit.js';
import { fetchMcpRegistry } from './sources/mcp-registry.js';

const rawFile = (repo) => path.join(PATHS.raw, repo.replace('/', '__') + '.json');
const MANIFEST = path.join(PATHS.raw, '_manifest.json');

function selectRepos(seeds, opts) {
  let repos = seeds.repos || [];
  if (opts.tiers?.length) repos = repos.filter((r) => opts.tiers.includes(r.tier));
  if (opts.only?.length) {
    const want = opts.only.map((s) => s.toLowerCase());
    repos = repos.filter((r) => want.some((w) => r.repo.toLowerCase().includes(w)));
  }
  if (opts.limit) repos = repos.slice(0, opts.limit);
  return repos;
}

export async function crawl(opts = {}) {
  if (!gitAvailable()) throw new Error('未找到 git,无法抓取仓库');

  ensureDir(PATHS.raw);
  ensureDir(PATHS.repos);

  const seeds = readJSON(PATHS.seeds);
  if (!seeds) throw new Error(`读不到种子配置:${PATHS.seeds}`);

  const manifest = readJSON(MANIFEST, {}) || {};
  const repos = selectRepos(seeds, opts);

  log.head(`抓取 ${repos.length} 个仓库` + (opts.tiers?.length ? ` (tier ${opts.tiers.join(',')})` : ''));
  if (!ghAvailable()) log.warn('gh 未登录 —— 缺 star/更新时间信号,质量分会降级');

  const summary = {
    repos: [], totalEntries: 0, totalMentions: 0,
    failed: [], reused: 0, byType: {},
  };

  let i = 0;
  for (const seed of repos) {
    i++;
    progress(seed.repo, i, repos.length);

    const res = cloneOrUpdate(seed.repo, { timeout: opts.timeout || 240000 });
    if (!res.ok) {
      summary.failed.push({ repo: seed.repo, error: res.error });
      log.err(`${seed.repo} — ${res.error}`);
      continue;
    }

    const prev = manifest[seed.repo];
    const cached = exists(rawFile(seed.repo));
    // 上游没动且已有产物 -> 直接复用,增量抓取的核心
    if (!opts.force && cached && prev && prev.ref && prev.ref === res.ref) {
      const old = readJSON(rawFile(seed.repo));
      if (old) {
        summary.reused++;
        summary.totalEntries += old.entries?.length || 0;
        summary.totalMentions += old.mentions?.length || 0;
        for (const e of old.entries || []) summary.byType[e.type] = (summary.byType[e.type] || 0) + 1;
        summary.repos.push({ repo: seed.repo, entries: old.entries?.length || 0, reused: true });
        continue;
      }
    }

    const dir = res.dir;
    const { entries, skipped } = extractRepo(seed, dir);
    const mentions = harvestMentions(seed, dir);

    // 审计必须在这里做:正文和脚本还在内存里,之后就丢弃,不落盘
    for (const e of entries) {
      e.audit = auditEntry(e);
      delete e._body;
      delete e._scriptBodies;
    }

    const meta = repoMeta(seed.repo);

    writeJSON(rawFile(seed.repo), {
      repo: seed.repo,
      tier: seed.tier,
      role: seed.role,
      lang: seed.lang || null,
      ref: res.ref,
      crawledAt: new Date().toISOString(),
      repoMeta: meta,
      skipped,
      entries,
      mentions,
    });

    manifest[seed.repo] = { ref: res.ref, at: new Date().toISOString(), entries: entries.length };
    summary.totalEntries += entries.length;
    summary.totalMentions += mentions.length;
    for (const e of entries) summary.byType[e.type] = (summary.byType[e.type] || 0) + 1;
    summary.repos.push({ repo: seed.repo, entries: entries.length, mentions: mentions.length, changed: res.changed });
  }
  progress('', repos.length, repos.length);

  // MCP 官方 registry —— 唯一免鉴权的 API 源
  const mcpReg = (seeds.registries || []).find((r) => r.id === 'mcp-official' && r.enabled);
  if (mcpReg && !opts.noMcp) {
    log.step('拉取官方 MCP Registry');
    const since = !opts.force ? manifest._mcpSyncedAt : null;
    const servers = await fetchMcpRegistry({
      base: mcpReg.url,
      since,
      maxPages: opts.mcpPages || 200,
    });
    if (servers.length || !exists(rawFile('_registry/mcp'))) {
      for (const e of servers) e.audit = auditEntry(e);
      // 增量模式下与既有结果按 registryName 合并
      const oldPath = path.join(PATHS.raw, '_mcp-official.json');
      const old = readJSON(oldPath, { entries: [] });
      const byName = new Map((old.entries || []).map((e) => [e.spec?.registryName || e.name, e]));
      for (const e of servers) byName.set(e.spec?.registryName || e.name, e);
      const merged = [...byName.values()];
      writeJSON(oldPath, {
        repo: '_mcp-official', tier: 0, role: 'registry',
        ref: null, crawledAt: new Date().toISOString(),
        entries: merged, mentions: [],
      });
      manifest._mcpSyncedAt = new Date().toISOString();
      summary.totalEntries += merged.length;
      summary.byType.mcp = (summary.byType.mcp || 0) + merged.length;
      log.ok(`MCP registry:本轮新增/更新 ${servers.length},累计 ${merged.length}`);
    }
  }

  const disabled = (seeds.registries || []).filter((r) => !r.enabled);
  for (const r of disabled) log.warn(`跳过 ${r.id}:${r.note || '未启用'}`);

  writeJSON(MANIFEST, manifest);
  flushCache();

  log.head('抓取完成');
  log.detail(`条目 ${color.bold(String(summary.totalEntries))} · 榜单投票边 ${summary.totalMentions} · 复用未变仓库 ${summary.reused} · 失败 ${summary.failed.length}`);
  log.detail('按类型:' + Object.entries(summary.byType).map(([k, v]) => `${k}=${v}`).join(' '));

  return summary;
}
