import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PATHS, ensureDir, readJSON, writeJSON } from './fsx.js';

const CACHE_FILE = path.join(PATHS.meta, 'repo-meta.json');
const TTL_MS = 24 * 60 * 60 * 1000;

let cache = null;
let ghOk = null;

function loadCache() {
  if (!cache) cache = readJSON(CACHE_FILE, {}) || {};
  return cache;
}

export function flushCache() {
  if (cache) {
    ensureDir(PATHS.meta);
    writeJSON(CACHE_FILE, cache);
  }
}

export function ghAvailable() {
  if (ghOk !== null) return ghOk;
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  ghOk = r.status === 0;
  return ghOk;
}

/**
 * 仓库元数据(star / 最后推送 / license / 是否归档)。
 * 走 gh CLI,继承本机登录态,配额 5000/h。带 24h 磁盘缓存。
 * gh 不可用时返回 null —— 质量分会自动降级为不含 star 信号,而不是崩掉。
 */
export function repoMeta(repo, { force = false } = {}) {
  const c = loadCache();
  const hit = c[repo];
  if (!force && hit && Date.now() - (hit._at || 0) < TTL_MS) return hit.data;

  if (!ghAvailable()) return null;

  const r = spawnSync(
    'gh',
    ['api', `repos/${repo}`, '--jq',
      '{stars:.stargazers_count,forks:.forks_count,pushedAt:.pushed_at,createdAt:.created_at,license:(.license.spdx_id // null),archived:.archived,topics:.topics,defaultBranch:.default_branch,openIssues:.open_issues_count}'],
    { encoding: 'utf8', timeout: 30000, windowsHide: true }
  );

  if (r.status !== 0) {
    c[repo] = { _at: Date.now(), data: null };
    return null;
  }
  let data = null;
  try { data = JSON.parse(r.stdout); } catch { data = null; }
  c[repo] = { _at: Date.now(), data };
  return data;
}
