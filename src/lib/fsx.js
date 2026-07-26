import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const p = (...segs) => path.join(ROOT, ...segs);

export const PATHS = {
  seeds: p('sources', 'seeds.json'),
  cache: p('data', 'cache'),
  repos: p('data', 'cache', 'repos'),
  meta: p('data', 'cache', 'meta'),
  raw: p('data', 'raw'),
  registry: p('registry'),
  entries: p('registry', 'entries'),
  byCategory: p('registry', 'by-category'),
  snapshots: p('data', 'snapshots'),
};

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data, pretty = true) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n', 'utf8');
  return file;
}

export function readText(file, maxBytes = 1024 * 512) {
  try {
    const st = fs.statSync(file);
    if (st.size > maxBytes) return null; // 超大文件不是资源文件,跳过
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export const exists = (f) => fs.existsSync(f);

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '.next', '.venv', 'venv', '__pycache__', '.pytest_cache', 'coverage',
  '.idea', '.vscode-test', 'test-fixtures', 'fixtures',
]);

/**
 * 递归遍历仓库文件,返回相对路径列表。
 * 带文件数与深度上限,防止巨型仓库拖垮抓取。
 */
export function walk(root, { maxFiles = 60000, maxDepth = 12 } = {}) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const it of items) {
      if (out.length >= maxFiles) return out;
      const full = path.join(dir, it.name);
      if (it.isDirectory()) {
        if (SKIP_DIRS.has(it.name)) continue;
        stack.push({ dir: full, depth: depth + 1 });
      } else if (it.isFile()) {
        out.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }
  return out;
}

/** 用于文件名的安全 slug,保留中文 */
export function slug(s, max = 80) {
  return String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max) || 'unnamed';
}
