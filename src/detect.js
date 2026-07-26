/**
 * 路径 -> 资源类型的判定规则。
 *
 * 这是整个流水线信噪比的第一道闸:上游仓库里 markdown 遍地都是,
 * 只有落在约定位置、且(对易误判的类型)带合法 frontmatter 的才算资源。
 */

const lc = (s) => s.toLowerCase();

export const TYPES = ['skill', 'subagent', 'command', 'rules', 'plugin', 'mcp'];

export const TYPE_LABEL = {
  skill:    { zh: '技能',      en: 'Skill' },
  subagent: { zh: '子代理',    en: 'Subagent' },
  command:  { zh: '斜杠命令',  en: 'Command' },
  rules:    { zh: '规则文件',  en: 'Rules' },
  plugin:   { zh: '插件',      en: 'Plugin' },
  mcp:      { zh: 'MCP 服务',  en: 'MCP Server' },
};

/** 各类型默认可安装到哪些 agent 端 */
export const DEFAULT_TARGETS = {
  skill:    ['claude-code', 'claude-ai', 'codex', 'cursor', 'agents'],
  subagent: ['claude-code'],
  command:  ['claude-code'],
  plugin:   ['claude-code'],
  mcp:      ['mcp-client'],
};

const RULES_MATCHERS = [
  // 既有 .cursorrules 点文件,也有 vscode.cursorrules 这类带前缀的 —— 两种都要收
  { re: /(^|\/)[^/]*\.cursorrules$/i,                  flavor: 'cursorrules',    targets: ['cursor'] },
  // .mdc 后缀是 Cursor rules 专用,目录约定各家不同(rules/ .cursor/rules/ rules-mdc/ ...),按扩展名收
  { re: /\.mdc$/i,                                     flavor: 'cursor-mdc',     targets: ['cursor'] },
  { re: /(^|\/)\.windsurfrules$/i,                     flavor: 'windsurfrules',  targets: ['windsurf'] },
  { re: /(^|\/)\.github\/copilot-instructions\.md$/i,  flavor: 'copilot',        targets: ['copilot'] },
  { re: /(^|\/)AGENTS\.md$/,                           flavor: 'agents-md',      targets: ['codex', 'agents', 'cursor', 'claude-code'] },
  { re: /(^|\/)CLAUDE\.md$/,                           flavor: 'claude-md',      targets: ['claude-code'] },
];

/**
 * @returns {null | {type, flavor?, targets, needsFrontmatter?:boolean}}
 */
export function detectType(rel) {
  const path = rel.replace(/\\/g, '/');
  const base = path.split('/').pop();

  // skill —— 开放标准,唯一硬信号就是 SKILL.md 本身
  if (lc(base) === 'skill.md') {
    return { type: 'skill', targets: DEFAULT_TARGETS.skill };
  }

  // plugin
  if (/(^|\/)\.claude-plugin\/marketplace\.json$/.test(path)) {
    return { type: 'plugin', flavor: 'marketplace', targets: DEFAULT_TARGETS.plugin };
  }
  if (/(^|\/)\.claude-plugin\/plugin\.json$/.test(path)) {
    return { type: 'plugin', flavor: 'plugin', targets: DEFAULT_TARGETS.plugin };
  }

  // mcp 配置文件
  if (/(^|\/)\.?mcp\.json$/.test(path)) {
    return { type: 'mcp', flavor: 'mcp-config', targets: DEFAULT_TARGETS.mcp };
  }

  // subagent / command —— 目录约定容易误伤普通文档,强制要求 frontmatter
  if (/(^|\/)(\.claude|\.codex)\/agents\/.+\.md$/i.test(path) || /^agents\/.+\.md$/i.test(path)) {
    return { type: 'subagent', targets: DEFAULT_TARGETS.subagent, needsFrontmatter: true };
  }
  if (/(^|\/)(\.claude|\.codex)\/commands\/.+\.md$/i.test(path) || /^commands\/.+\.md$/i.test(path)) {
    return { type: 'command', targets: DEFAULT_TARGETS.command, needsFrontmatter: true };
  }

  // rules
  for (const m of RULES_MATCHERS) {
    if (m.re.test(path)) {
      return { type: 'rules', flavor: m.flavor, targets: m.targets };
    }
  }

  return null;
}

/** 仓库自身的说明文档不是资源,只是元信息 */
export function isRepoSelfDoc(rel) {
  const path = rel.replace(/\\/g, '/');
  const depth = path.split('/').length;
  return depth === 1 && /^(readme|contributing|license|changelog|code_of_conduct|security)\.md$/i.test(path);
}
