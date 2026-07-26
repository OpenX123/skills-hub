import crypto from 'node:crypto';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

/**
 * 内容指纹 —— 去重的主键。
 *
 * 上游存在大量「同一份 skill 换个名字/改个标题/重排空白」的搬运副本,
 * 所以做归一化后再哈希:去 frontmatter、去 markdown 标记、折叠空白、转小写。
 * 目标是让实质相同的内容落到同一个 hash 上。
 */
export function contentHash(body) {
  const norm = String(body || '')
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/\s+/g, ' ')) // 代码块内只折叠空白,保留语义
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return sha256(norm);
}

/** 短指纹,用于展示 */
export const short = (h, n = 12) => String(h || '').slice(0, n);
