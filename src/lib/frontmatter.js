/**
 * 零依赖的 YAML frontmatter 解析器。
 *
 * 只覆盖 SKILL.md / agent / command / .mdc 实际用到的 YAML 子集:
 * 标量、引号标量、块标量(| >)、行内流式列表([a, b])、块式列表(- item)、一层嵌套映射。
 * 解析不出来的一律退回原始字符串,绝不抛异常 —— 上游有大量手写的不合规 frontmatter。
 */

const FM_RE = /^﻿?\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseFrontmatter(text) {
  if (typeof text !== 'string') return { data: {}, body: '', hasFrontmatter: false };
  const m = text.match(FM_RE);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  return {
    data: parseYamlSubset(m[1]),
    body: text.slice(m[0].length),
    hasFrontmatter: true,
  };
}

function stripQuotes(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerce(v) {
  const s = stripQuotes(v);
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);
  // 行内流式列表: [a, b, c]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return splitFlow(inner).map((x) => coerce(x));
  }
  return s;
}

/** 按逗号切分,但忽略引号内的逗号 */
function splitFlow(s) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const indentOf = (l) => l.length - l.trimStart().length;

export function parseYamlSubset(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const data = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) { i++; continue; }
    if (indentOf(line) > 0) { i++; continue; } // 孤立缩进行,跳过

    const km = line.match(/^([A-Za-z0-9_.\-$]+)\s*:\s?(.*)$/);
    if (!km) { i++; continue; }

    const key = km[1];
    const rest = km[2] ?? '';
    const restTrim = rest.trim();

    // 块标量 | 或 >
    if (restTrim === '|' || restTrim === '>' || /^[|>][-+]?\d*$/.test(restTrim)) {
      const fold = restTrim.startsWith('>');
      const buf = [];
      i++;
      while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > 0)) {
        buf.push(lines[i].replace(/^\s{1,8}/, ''));
        i++;
      }
      while (buf.length && !buf.at(-1).trim()) buf.pop();
      data[key] = fold ? buf.join(' ').replace(/\s+/g, ' ').trim() : buf.join('\n').trim();
      continue;
    }

    if (restTrim !== '') {
      data[key] = coerce(restTrim);
      i++;
      continue;
    }

    // 空值 -> 向下看是块列表还是嵌套映射
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length || indentOf(lines[j]) === 0) {
      data[key] = '';
      i = j;
      continue;
    }

    if (/^\s*-\s/.test(lines[j]) || /^\s*-$/.test(lines[j].trimEnd())) {
      const arr = [];
      i = j;
      while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > 0)) {
        const im = lines[i].match(/^\s*-\s*(.*)$/);
        if (im) arr.push(coerce(im[1]));
        i++;
      }
      data[key] = arr.filter((x) => x !== '');
      continue;
    }

    const obj = {};
    i = j;
    while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > 0)) {
      const sm = lines[i].match(/^\s+([A-Za-z0-9_.\-$]+)\s*:\s?(.*)$/);
      if (sm) obj[sm[1]] = coerce(sm[2] ?? '');
      i++;
    }
    data[key] = obj;
  }

  return data;
}

/** frontmatter 里 allowed-tools / tools 的写法五花八门,统一成数组 */
export function toolList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(/[,\n]/)
    .map((x) => x.trim().replace(/^-\s*/, ''))
    .filter(Boolean);
}
