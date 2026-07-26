import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { PATHS, ensureDir, exists } from './fsx.js';

function run(args, { cwd, timeout = 180000 } = {}) {
  const r = spawnSync('git', args, {
    cwd,
    timeout,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', GCM_INTERACTIVE: 'never' },
  });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    timedOut: r.error?.code === 'ETIMEDOUT',
  };
}

export function repoDir(repo) {
  const [owner, name] = repo.split('/');
  return path.join(PATHS.repos, owner, name);
}

export function headSha(dir) {
  const r = run(['rev-parse', 'HEAD'], { cwd: dir });
  return r.ok ? r.stdout : null;
}

function currentBranch(dir) {
  const r = run(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
  return r.ok && r.stdout && r.stdout !== 'HEAD' ? r.stdout : null;
}

/**
 * 浅克隆或增量更新一个仓库。
 * 返回 { ok, dir, ref, before, changed, error }。
 * changed=false 表示上游没动,build 阶段可以直接复用上次的解析结果。
 */
export function cloneOrUpdate(repo, { timeout = 180000 } = {}) {
  const dir = repoDir(repo);
  const url = `https://github.com/${repo}.git`;

  if (!exists(path.join(dir, '.git'))) {
    // 残留的半成品目录会让 clone 失败,先清掉
    if (exists(dir)) fs.rmSync(dir, { recursive: true, force: true });
    ensureDir(path.dirname(dir));
    const r = run(['clone', '--depth', '1', '--single-branch', '--no-tags', '--quiet', url, dir], { timeout });
    if (!r.ok) {
      return { ok: false, dir, error: r.timedOut ? 'clone timeout' : r.stderr.split('\n')[0] || 'clone failed' };
    }
    return { ok: true, dir, ref: headSha(dir), before: null, changed: true, fresh: true };
  }

  const before = headSha(dir);
  const branch = currentBranch(dir) || 'HEAD';
  const f = run(['fetch', '--depth', '1', '--no-tags', '--quiet', 'origin', branch], { cwd: dir, timeout });
  if (!f.ok) {
    // 拉不动就沿用本地副本,不让单个仓库拖垮整轮抓取
    return { ok: true, dir, ref: before, before, changed: false, stale: true, error: f.stderr.split('\n')[0] };
  }
  run(['reset', '--hard', '--quiet', 'FETCH_HEAD'], { cwd: dir, timeout: 60000 });
  run(['clean', '-qfd'], { cwd: dir, timeout: 60000 });
  const after = headSha(dir);
  return { ok: true, dir, ref: after, before, changed: before !== after };
}

/** 该文件最后一次提交时间,用于活性判定(浅克隆下只有一层历史,失败则回退仓库级 pushedAt) */
export function fileLastCommit(dir, relPath) {
  const r = run(['log', '-1', '--format=%cI', '--', relPath], { cwd: dir, timeout: 20000 });
  return r.ok && r.stdout ? r.stdout : null;
}

export function gitAvailable() {
  return run(['--version'], { timeout: 10000 }).ok;
}
