/**
 * 双语分类器(中文优先)。
 *
 * 不做机器翻译 —— 离线环境没有可靠译源,伪造译文比留空更糟。
 * 只做:语言识别 + 关键词打分归类,缺失语种打 needsTranslation 标记,留给后续人工/模型补。
 */

export const CATEGORIES = [
  { key: 'document',    zh: '文档处理',    en: 'Documents',    kw: ['pdf', 'docx', 'xlsx', 'pptx', 'word', 'excel', 'powerpoint', 'ocr', 'markdown', 'latex', 'ebook', 'resume', '文档', '表格', '报告', '简历', '排版', '公众号'] },
  { key: 'coding',      zh: '编码开发',    en: 'Coding',       kw: ['code', 'coding', 'refactor', 'debug', 'lint', 'typescript', 'javascript', 'python', 'rust', 'golang', 'java', 'react', 'vue', 'frontend', 'backend', 'compiler', 'codegen', 'boilerplate', '代码', '重构', '调试', '开发', '前端', '后端', '编程'] },
  { key: 'testing',     zh: '测试质量',    en: 'Testing',      kw: ['test', 'testing', 'tdd', 'bdd', 'e2e', 'unit test', 'coverage', 'playwright', 'jest', 'pytest', 'cypress', 'qa', '测试', '覆盖率', '单元测试', '质量'] },
  { key: 'security',    zh: '安全审计',    en: 'Security',     kw: ['security', 'vulnerability', 'pentest', 'owasp', 'cve', 'exploit', 'audit', 'malware', 'injection', 'threat', 'fuzz', 'secrets', '安全', '漏洞', '审计', '渗透', '加密', '风险'] },
  { key: 'devops',      zh: '运维部署',    en: 'DevOps',       kw: ['docker', 'kubernetes', 'k8s', 'ci/cd', 'cicd', 'deploy', 'terraform', 'ansible', 'aws', 'gcp', 'azure', 'cloudflare', 'vercel', 'nginx', 'monitoring', 'observability', 'sre', '部署', '运维', '监控', '容器', '流水线'] },
  { key: 'data',        zh: '数据分析',    en: 'Data',         kw: ['data analysis', 'analytics', 'pandas', 'numpy', 'dataset', 'etl', 'dashboard', 'chart', 'visualization', 'statistics', 'excel formula', 'bi', '数据分析', '可视化', '统计', '报表', '图表'] },
  { key: 'database',    zh: '数据库',      en: 'Database',     kw: ['postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'prisma', 'orm', 'migration', 'sql query', 'clickhouse', 'elasticsearch', '数据库', '建表', '索引优化'] },
  { key: 'design',      zh: '设计创意',    en: 'Design',       kw: ['design', 'ui', 'ux', 'figma', 'css', 'tailwind', 'theme', 'palette', 'typography', 'icon', 'layout', 'brand', 'animation', '设计', '配色', '排版', '视觉', '原型'] },
  { key: 'writing',     zh: '内容写作',    en: 'Writing',      kw: ['writing', 'copywriting', 'blog', 'article', 'seo', 'newsletter', 'editor', 'proofread', 'translate', 'summary', '文案', '写作', '标题', '小红书', '知乎', '短视频', '脚本', '逐字稿', '翻译'] },
  { key: 'research',    zh: '研究搜索',    en: 'Research',     kw: ['research', 'search', 'crawl', 'scrape', 'scraping', 'browse', 'literature', 'citation', 'fact-check', 'deep research', '调研', '搜索', '抓取', '爬虫', '综述', '文献'] },
  { key: 'business',    zh: '商业营销',    en: 'Business',     kw: ['marketing', 'growth', 'sales', 'pricing', 'product management', 'startup', 'monetization', 'crm', 'ads', 'campaign', '商业', '营销', '增长', '变现', '获客', '定价', '创业', '商业模式'] },
  { key: 'pm',          zh: '项目管理',    en: 'Project Mgmt', kw: ['roadmap', 'jira', 'sprint', 'backlog', 'ticket', 'issue triage', 'standup', 'retrospective', 'okr', 'planning', '需求', '项目管理', '排期', '迭代', '看板'] },
  { key: 'media',       zh: '音视频图像',  en: 'Media',        kw: ['image', 'video', 'audio', 'ffmpeg', 'tts', 'speech', 'photo', 'thumbnail', 'subtitle', 'podcast', 'music', '图像', '视频', '音频', '剪辑', '字幕', '配音', '封面'] },
  { key: 'integration', zh: '三方集成',    en: 'Integrations', kw: ['slack', 'notion', 'jira', 'gmail', 'google drive', 'airtable', 'stripe', 'shopify', 'discord', 'telegram', 'feishu', 'lark', 'dingtalk', 'wechat', '飞书', '钉钉', '企业微信', '集成', '对接'] },
  // 注意:不要放 skill / agent 这类裸词 —— 本领域几乎每条描述都含它们,会把整个索引吸进这一类
  { key: 'meta',        zh: 'Agent 基建',  en: 'Agent Infra',  kw: ['skill authoring', 'skill creator', 'agent skill', 'subagent', 'mcp server', 'prompt engineering', 'context engineering', 'slash command', 'claude code', 'cursor rules', 'agent workflow', 'orchestration', 'hooks', '技能开发', '提示词', '智能体', '编排', '工作流'] },
];

/**
 * 关键词匹配器。
 * ASCII 词强制词边界 —— 否则 'ui' 会命中 build/guide/requirements,'data' 会命中 metadata。
 * CJK 无词边界概念,直接子串匹配。
 */
function makeMatcher(kw) {
  if (/[^\x00-\x7f]/.test(kw)) {
    return (t) => t.includes(kw);
  }
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, 'i');
  return (t) => re.test(t);
}

for (const c of CATEGORIES) {
  c._m = c.kw.map((k) => ({ kw: k, test: makeMatcher(k) }));
}

/** 容器目录名不带语义,参与匹配只会制造系统性偏差 */
const CONTAINER_SEG = /(?:^|[\s/])(?:skills?|agents?|commands?|rules?|plugins?|src|lib|docs?|examples?|packages?|claude|codex|cursor|dist|main)(?=[\s/]|$)/gi;

const CAT_INDEX = new Map(CATEGORIES.map((c) => [c.key, c]));
export const categoryLabel = (key) => CAT_INDEX.get(key) || { key: 'other', zh: '其他', en: 'Other' };

const CJK_RE = /[一-鿿㐀-䶿豈-﫿]/g;

/** 语言识别:按 CJK 字符占比。zh / en / mixed */
export function detectLang(text) {
  const s = String(text || '');
  if (!s.trim()) return 'unknown';
  const cjk = (s.match(CJK_RE) || []).length;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const total = cjk + letters;
  if (total < 4) return 'unknown';
  const ratio = cjk / total;
  if (ratio > 0.5) return 'zh';
  if (ratio > 0.12) return 'mixed';
  return 'en';
}

/**
 * 关键词打分归类。name 权重 3、description 2、path 1。
 * 返回最多 3 个类别,全不命中归 other。
 */
export function categorize({ name = '', description = '', path = '', topics = [] } = {}) {
  const pathText = String(path).toLowerCase()
    .replace(/\.(md|mdc|json)$/, '')
    .replace(CONTAINER_SEG, ' ')
    .replace(/[/_-]/g, ' ');

  const fields = [
    { text: String(name).toLowerCase().replace(/[_-]/g, ' '), w: 3 },
    { text: String(description).toLowerCase(), w: 2 },
    { text: pathText, w: 1 },
    { text: (topics || []).join(' ').toLowerCase(), w: 2 },
  ];

  const scores = [];
  for (const cat of CATEGORIES) {
    let s = 0;
    for (const { kw, test } of cat._m) {
      for (const f of fields) {
        if (!f.text) continue;
        if (test(f.text)) s += f.w * (kw.length > 6 ? 1.5 : 1);
      }
    }
    if (s > 0) scores.push({ key: cat.key, score: s });
  }

  if (!scores.length) return ['other'];
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0].score;
  return scores.filter((s) => s.score >= top * 0.5).slice(0, 3).map((s) => s.key);
}

/** 双语描述结构。不伪造译文,缺哪侧就标 needsTranslation */
export function bilingualDescription(desc, name) {
  const raw = String(desc || '').trim();
  const lang = detectLang(raw || name);
  const out = { raw, zh: null, en: null, lang, needsTranslation: [] };
  if (lang === 'zh' || lang === 'mixed') {
    out.zh = raw;
    out.needsTranslation.push('en');
  } else if (lang === 'en') {
    out.en = raw;
    out.needsTranslation.push('zh');
  } else {
    out.needsTranslation.push('zh', 'en');
  }
  return out;
}
