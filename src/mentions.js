import path from 'node:path';
import { readText, walk } from './lib/fsx.js';

const NOISE_OWNERS = new Set([
  'topics', 'orgs', 'sponsors', 'features', 'about', 'pricing', 'login',
  'settings', 'marketplace', 'apps', 'collections', 'trending', 'explore',
  'readme', 'search', 'notifications', 'codespaces', 'security', 'enterprise',
]);

const REPO_RE = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?)\/([A-Za-z0-9._-]{1,100})/g;

/**
 * 从榜单类仓库的 markdown 里采集它推荐了哪些仓库。
 *
 * 这是质量排序里最抗刷的信号:刷 star 容易,同时混进多个互不相关的
 * 策展人的名单里很难。产出 { from, to } 边,build 阶段聚合成得票数。
 */
export function harvestMentions(seed, dir) {
  const role = seed.role;
  if (role !== 'curated-index' && role !== 'both') return [];

  const files = walk(dir, { maxFiles: 4000, maxDepth: 4 })
    .filter((f) => /\.md$/i.test(f) && !/\/(node_modules|\.github)\//.test(f))
    .slice(0, 300);

  const seen = new Set();
  const out = [];

  for (const rel of files) {
    const text = readText(path.join(dir, rel), 2 * 1024 * 1024);
    if (!text) continue;
    REPO_RE.lastIndex = 0;
    let m;
    while ((m = REPO_RE.exec(text))) {
      const owner = m[1];
      let name = m[2].replace(/\.git$/i, '').replace(/[.,)\]}>'"]+$/, '');
      if (!name || NOISE_OWNERS.has(owner.toLowerCase())) continue;
      if (/^(issues|pull|blob|tree|releases|actions|wiki|discussions)$/i.test(name)) continue;
      const to = `${owner}/${name}`;
      if (to.toLowerCase() === seed.repo.toLowerCase()) continue;
      if (seen.has(to.toLowerCase())) continue;
      seen.add(to.toLowerCase());
      out.push({ from: seed.repo, to, fromTier: seed.tier, fromLang: seed.lang || null });
    }
  }
  return out;
}
