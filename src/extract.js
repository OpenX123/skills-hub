import path from 'node:path';
import { readText, readJSON, walk } from './lib/fsx.js';
import { parseFrontmatter, toolList } from './lib/frontmatter.js';
import { contentHash } from './lib/hash.js';
import { sketch } from './lib/minhash.js';
import { detectType, DEFAULT_TARGETS } from './detect.js';

const MAX_DESC = 600;

function firstParagraph(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const buf = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { if (buf.length) break; continue; }
    if (/^#{1,6}\s/.test(l)) { if (buf.length) break; continue; }
    if (/^(!\[|<img|\[!\[|<p|<div|---|===|\|)/.test(l)) continue; // 徽章/HTML/表格
    if (/^```/.test(l)) break;
    buf.push(l);
    if (buf.join(' ').length > MAX_DESC) break;
  }
  return buf.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DESC);
}

function cleanDesc(v, body) {
  const d = (typeof v === 'string' ? v : Array.isArray(v) ? v.join(' ') : '').trim();
  if (d) return d.replace(/\s+/g, ' ').slice(0, MAX_DESC);
  return firstParagraph(body);
}

function nameFromPath(rel) {
  const parts = rel.split('/');
  const base = parts.pop();
  const stem = base.replace(/\.(md|mdc|json)$/i, '');
  if (/^skill$/i.test(stem)) return parts.pop() || stem;
  return stem;
}

/** skill 目录里的附属资产 —— 既是完备度信号,也是风险面 */
function skillAssets(repoRoot, skillRel) {
  const dir = path.dirname(skillRel);
  const abs = path.join(repoRoot, dir);
  let files = [];
  try {
    files = walk(abs, { maxFiles: 400, maxDepth: 4 });
  } catch {
    return { files: 0, scripts: [], hasReferences: false };
  }
  const scripts = files.filter((f) => /\.(py|sh|bash|ps1|js|mjs|cjs|ts|rb|pl|exe|bat|cmd)$/i.test(f));
  return {
    files: files.length,
    scripts: scripts.slice(0, 40),
    hasReferences: files.some((f) => /^(references|reference|docs|assets|templates)\//i.test(f)),
  };
}

function baseEntry({ seed, rel, type, flavor, targets, name, description, body, frontmatter }) {
  return {
    type,
    flavor: flavor || null,
    name: String(name || nameFromPath(rel)).trim().slice(0, 120),
    description,
    frontmatter: frontmatter || {},
    source: {
      repo: seed.repo,
      owner: seed.repo.split('/')[0],
      path: rel,
      tier: seed.tier,
      seedLang: seed.lang || null,
      url: `https://github.com/${seed.repo}/blob/HEAD/${rel}`,
    },
    targets: targets || [],
    contentHash: contentHash(body),
    sketch: sketch(body),
    bytes: Buffer.byteLength(body || '', 'utf8'),
    bodyPreview: String(body || '').replace(/\s+/g, ' ').trim().slice(0, 500),
  };
}

function expandMarketplace(seed, rel, json) {
  const out = [];
  const plugins = Array.isArray(json?.plugins) ? json.plugins : [];
  for (const pl of plugins) {
    if (!pl || typeof pl !== 'object') continue;
    const body = [pl.name, pl.description, JSON.stringify(pl.source || '')].filter(Boolean).join('\n');
    const e = baseEntry({
      seed, rel, type: 'plugin', flavor: 'marketplace-item',
      targets: DEFAULT_TARGETS.plugin,
      name: pl.name || 'plugin',
      description: cleanDesc(pl.description, body),
      body,
      frontmatter: {},
    });
    e.spec = {
      marketplace: json.name || null,
      version: pl.version || null,
      pluginSource: typeof pl.source === 'string' ? pl.source : (pl.source?.source || pl.source?.repo || null),
      author: pl.author?.name || json.owner?.name || null,
    };
    out.push(e);
  }
  return out;
}

function expandMcpConfig(seed, rel, json) {
  const servers = json?.mcpServers || json?.servers || {};
  const out = [];
  for (const [key, cfg] of Object.entries(servers)) {
    if (!cfg || typeof cfg !== 'object') continue;
    const body = key + '\n' + JSON.stringify(cfg);
    const e = baseEntry({
      seed, rel, type: 'mcp', flavor: 'mcp-config',
      targets: DEFAULT_TARGETS.mcp,
      name: key,
      description: cleanDesc(cfg.description, body),
      body,
      frontmatter: {},
    });
    e.spec = {
      transport: cfg.url ? 'http' : 'stdio',
      command: cfg.command || null,
      args: Array.isArray(cfg.args) ? cfg.args.slice(0, 20) : [],
      url: cfg.url || null,
      envRequired: Object.keys(cfg.env || {}),
    };
    out.push(e);
  }
  return out;
}

/**
 * 解析一个已克隆的仓库,产出该仓库内所有资源条目。
 * role=curated-index 的仓库不抽内容(它们是投票源,不是内容源)。
 */
export function extractRepo(seed, dir) {
  const entries = [];
  const skipped = { noFrontmatter: 0, empty: 0, unreadable: 0 };
  if (seed.role === 'curated-index' || seed.role === 'tool') return { entries, skipped };

  const files = walk(dir, { maxFiles: 40000, maxDepth: 12 });

  for (const rel of files) {
    const hit = detectType(rel);
    if (!hit) continue;

    const abs = path.join(dir, rel);

    if (hit.type === 'plugin' && hit.flavor === 'marketplace') {
      const json = readJSON(abs);
      if (json) entries.push(...expandMarketplace(seed, rel, json));
      continue;
    }
    if (hit.type === 'plugin' && hit.flavor === 'plugin') {
      const json = readJSON(abs);
      if (!json) { skipped.unreadable++; continue; }
      const body = JSON.stringify(json);
      const e = baseEntry({
        seed, rel, type: 'plugin', flavor: 'plugin',
        targets: DEFAULT_TARGETS.plugin,
        name: json.name || nameFromPath(rel),
        description: cleanDesc(json.description, body),
        body, frontmatter: {},
      });
      e.spec = { version: json.version || null, author: json.author?.name || null };
      entries.push(e);
      continue;
    }
    if (hit.type === 'mcp') {
      const json = readJSON(abs);
      if (json) entries.push(...expandMcpConfig(seed, rel, json));
      continue;
    }

    const text = readText(abs);
    if (text === null) { skipped.unreadable++; continue; }
    if (!text.trim()) { skipped.empty++; continue; }

    const { data: fm, body, hasFrontmatter } = parseFrontmatter(text);

    if (hit.needsFrontmatter && !(hasFrontmatter && fm.description)) {
      skipped.noFrontmatter++;
      continue;
    }

    const e = baseEntry({
      seed, rel,
      type: hit.type,
      flavor: hit.flavor,
      targets: hit.targets,
      name: fm.name || nameFromPath(rel),
      description: cleanDesc(fm.description, body),
      body,
      frontmatter: fm,
    });

    if (hit.type === 'skill') {
      const assets = skillAssets(dir, rel);
      e.spec = {
        allowedTools: toolList(fm['allowed-tools'] ?? fm.allowedTools),
        license: fm.license || null,
        version: fm.version || null,
        userInvocable: fm['user_invocable'] ?? fm.userInvocable ?? null,
        assetFiles: assets.files,
        scripts: assets.scripts,
        hasReferences: assets.hasReferences,
        hasFrontmatter,
      };
      e._scriptBodies = assets.scripts
        .map((s) => readText(path.join(dir, path.dirname(rel), s), 200 * 1024))
        .filter(Boolean);
    } else if (hit.type === 'subagent') {
      e.spec = { tools: toolList(fm.tools), model: fm.model || null, hasFrontmatter };
    } else if (hit.type === 'command') {
      e.spec = {
        argumentHint: fm['argument-hint'] || null,
        allowedTools: toolList(fm['allowed-tools']),
        model: fm.model || null,
        invocation: '/' + nameFromPath(rel),
        hasFrontmatter,
      };
    } else if (hit.type === 'rules') {
      e.spec = {
        globs: fm.globs || null,
        alwaysApply: fm.alwaysApply ?? null,
        scope: rel.split('/').length === 1 ? 'repo-root' : 'nested',
        hasFrontmatter,
      };
    }

    e._body = body;
    entries.push(e);
  }

  return { entries, skipped };
}
