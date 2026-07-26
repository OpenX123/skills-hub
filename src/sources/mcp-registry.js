import { contentHash } from '../lib/hash.js';
import { log, progress } from '../lib/log.js';

/**
 * 官方 MCP Registry —— 唯一一个免鉴权、有正式 REST API、支持增量的上游。
 * 支持 updated_since 增量:传入上次同步时间即可只取变更。
 */
export async function fetchMcpRegistry({ base, since = null, maxPages = 200, pageSize = 100 } = {}) {
  const url0 = base || 'https://registry.modelcontextprotocol.io/v0/servers';
  const out = [];
  let cursor = null;
  let pages = 0;

  while (pages < maxPages) {
    const u = new URL(url0);
    u.searchParams.set('limit', String(pageSize));
    if (cursor) u.searchParams.set('cursor', cursor);
    if (since) u.searchParams.set('updated_since', since);

    let json;
    try {
      const res = await fetch(u, {
        headers: { accept: 'application/json', 'user-agent': 'skills-hub/0.1' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        log.warn(`MCP registry HTTP ${res.status},在第 ${pages} 页停止`);
        break;
      }
      json = await res.json();
    } catch (e) {
      log.warn('MCP registry 请求失败:', e.message);
      break;
    }

    const servers = Array.isArray(json?.servers) ? json.servers : [];
    for (const row of servers) {
      const s = row?.server || row;
      if (!s?.name) continue;
      const official = row?._meta?.['io.modelcontextprotocol.registry/official'] || {};
      if (official.isLatest === false) continue; // 同名多版本只留最新

      const body = [s.name, s.title, s.description, JSON.stringify(s.remotes || s.packages || '')]
        .filter(Boolean).join('\n');

      const remotes = Array.isArray(s.remotes) ? s.remotes : [];
      const packages = Array.isArray(s.packages) ? s.packages : [];

      out.push({
        type: 'mcp',
        flavor: 'registry',
        name: s.title || s.name,
        description: String(s.description || '').replace(/\s+/g, ' ').slice(0, 600),
        frontmatter: {},
        source: {
          repo: s.repository?.url?.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '') || null,
          owner: String(s.name).split('/')[0],
          path: s.name,
          tier: 0,
          seedLang: null,
          url: s.repository?.url || s.websiteUrl || `https://registry.modelcontextprotocol.io/?q=${encodeURIComponent(s.name)}`,
          registry: 'mcp-official',
        },
        targets: ['mcp-client'],
        contentHash: contentHash(body),
        bytes: Buffer.byteLength(body, 'utf8'),
        bodyPreview: String(s.description || '').slice(0, 500),
        spec: {
          registryName: s.name,
          version: s.version || null,
          status: official.status || null,
          publishedAt: official.publishedAt || null,
          updatedAt: official.updatedAt || null,
          transport: remotes[0]?.type || (packages.length ? 'stdio' : null),
          url: remotes[0]?.url || null,
          packages: packages.map((p) => `${p.registryType || p.registry_type || ''}:${p.identifier || p.name || ''}`).filter((x) => x !== ':').slice(0, 10),
        },
      });
    }

    pages++;
    progress(`MCP registry 第 ${pages} 页 · 累计 ${out.length}`, pages, maxPages);
    cursor = json?.metadata?.nextCursor || json?.metadata?.next_cursor || null;
    if (!cursor || servers.length === 0) break;
  }

  return out;
}
