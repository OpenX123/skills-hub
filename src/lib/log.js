const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? code + s + C.reset : s);

export const color = {
  dim: (s) => c(C.dim, s),
  bold: (s) => c(C.bold, s),
  red: (s) => c(C.red, s),
  green: (s) => c(C.green, s),
  yellow: (s) => c(C.yellow, s),
  blue: (s) => c(C.blue, s),
  cyan: (s) => c(C.cyan, s),
  gray: (s) => c(C.gray, s),
};

let quiet = false;
export const setQuiet = (v) => { quiet = v; };

export const log = {
  info: (...a) => { if (!quiet) console.log(...a); },
  step: (...a) => { if (!quiet) console.log(color.cyan('▸'), ...a); },
  ok: (...a) => { if (!quiet) console.log(color.green('✓'), ...a); },
  warn: (...a) => { if (!quiet) console.log(color.yellow('!'), ...a); },
  err: (...a) => console.error(color.red('✗'), ...a),
  detail: (...a) => { if (!quiet) console.log(color.gray('  ' + a.join(' '))); },
  head: (s) => { if (!quiet) console.log('\n' + color.bold(s)); },
};

/** 单行覆盖式进度,CI 下降级为静默 */
export function progress(label, done, total) {
  if (quiet || !process.stdout.isTTY) return;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '·');
  process.stdout.write(`\r  ${color.gray(bar)} ${String(pct).padStart(3)}% ${label.slice(0, 48).padEnd(48)}`);
  if (done >= total) process.stdout.write('\r' + ' '.repeat(80) + '\r');
}
