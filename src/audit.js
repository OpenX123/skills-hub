/**
 * 文本层安全审计基线扫描器。
 *
 * 存在的理由:Socket / Snyk 这类代码供应链扫描器是为 npm/pypi 依赖设计的,
 * 而 Snyk 自己的 ToxicSkills 研究指出,agent skill 上最主流的攻击手法**不含任何代码** ——
 * 就是在 SKILL.md 正文里埋一句隐藏指令。代码扫描器结构性地扫不出这类东西。
 *
 * 设计要点(v2,针对 v1 的大量误报重写):
 *  1. 判「意图」而非判「关键词」。文档里写 `export FOO_API_KEY=...` 是安装说明,
 *     只有密钥被**拼进 URL** 或出现「把密钥发送到某处」的祈使句才是外传。
 *  2. 围栏代码块降一级。SKILL.md 的散文是 agent 真正会执行的指令,
 *     ``` 里的多为示例;仍然报出,但降级并标注 inFence,交人工判断。
 *  3. 安全类工具天然会提到攻击关键词,对非 critical 做衰减。
 *
 * 只做静态匹配,不执行任何内容。定位是「基线筛」,筛出待人工复核项,不是终审判决。
 */

const SEV_WEIGHT = { critical: 40, high: 25, medium: 10, low: 4 };
const SEV_ORDER = ['low', 'medium', 'high', 'critical'];
const downgrade = (s) => SEV_ORDER[Math.max(0, SEV_ORDER.indexOf(s) - 1)];

const ZERO_WIDTH = /[​-‏‪-‮⁠-⁤﻿]/;

// 密钥标识符:环境变量名 / ${VAR} / %VAR%
// 必须大小写敏感 —— 带 i 标志会让 `?ods_key=` `cloudflare_api_key` 这类普通 URL 片段全部误报
const SECRET_TOKEN = String.raw`(?:\$\{?[A-Za-z_][A-Za-z0-9_]*(?:API[_-]?)?(?:KEY|TOKEN|SECRET|PASSWORD)\}?|%[A-Z_]*(?:KEY|TOKEN|SECRET)%|\b[A-Z][A-Z0-9_]{2,30}_(?:API_)?(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\b)`;
const SECRET_CS = new RegExp(SECRET_TOKEN); // 无 i 标志

// 广为人知的官方安装脚本。pipe-to-shell 本身是真实风险类别,
// 但这些是各语言/工具链的标准安装方式,判 critical 会把信号淹掉,降到 medium 交人工看。
const KNOWN_INSTALLERS = /(?:bun\.sh|rustup\.rs|sh\.rustup\.rs|get\.docker\.com|ollama\.(?:ai|com)|deno\.land|astral\.sh|install\.python-poetry\.org|nodejs\.org|get\.pnpm\.io|cli\.github\.com|starship\.rs|get\.k3s\.io|raw\.githubusercontent\.com\/(?:render-oss|Homebrew|nvm-sh))/i;

const RULES = [
  // ---------- critical ----------
  {
    // 定级 high 而非 critical:把 token 放进 URL 查询串是不良实践,
    // 但 Mapbox 瓦片、各类图床都这么用,并不等于外传。
    id: 'secret-in-url', severity: 'high',
    zh: '密钥被拼进 URL', en: 'Secret interpolated into URL',
    fn: (text) => {
      const out = [];
      const urlRe = /https?:\/\/[^\s'"`)]{0,200}/g;
      let m;
      while ((m = urlRe.exec(text)) && out.length < 5) {
        if (SECRET_CS.test(m[0])) out.push({ index: m.index, match: m[0].slice(0, 160) });
      }
      return out;
    },
  },
  {
    id: 'secret-exfil-instruction', severity: 'critical',
    zh: '指示外传密钥', en: 'Instructs sending secret out',
    re: new RegExp(
      '(?:' +
        String.raw`(?:send|post|upload|transmit|exfiltrat\w*|leak|append|include)[^\n.]{0,120}` + SECRET_TOKEN + String.raw`[^\n.]{0,120}(?:https?:\/\/|webhook|endpoint|server)` +
        '|' +
        SECRET_TOKEN + String.raw`[^\n.]{0,100}(?:as|in)\s+(?:a\s+)?(?:query\s+param\w*|querystring|url\s+param\w*|request\s+body)` +
        '|' +
        String.raw`(?:as|in)\s+(?:a\s+)?(?:query\s+param\w*|querystring|url\s+param\w*)[^\n.]{0,100}` + SECRET_TOKEN +
        '|' +
        String.raw`(?:发送|上传|回传|附加|外传)[^\n。]{0,80}(?:密钥|令牌|凭证|API[_\s-]?KEY|TOKEN)[^\n。]{0,80}(?:https?:\/\/|服务器|接口|地址)` +
      ')', 'g'),
  },
  {
    id: 'remote-code-exec', severity: 'critical',
    zh: '远程脚本直接执行', en: 'Pipe-to-shell remote execution',
    fn: (text) => {
      const out = [];
      const re = /(?:curl|wget)[^\n|]{0,200}\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b|(?:Invoke-WebRequest|iwr|irm)[^\n|]{0,200}\|\s*iex\b/gi;
      let m;
      while ((m = re.exec(text)) && out.length < 5) {
        out.push({
          index: m.index,
          match: m[0].replace(/\s+/g, ' ').slice(0, 160),
          // 已知官方安装器降一级
          severity: KNOWN_INSTALLERS.test(m[0]) ? 'medium' : 'critical',
        });
      }
      return out;
    },
  },
  {
    id: 'obfuscated-payload', severity: 'critical',
    zh: '混淆载荷', en: 'Obfuscated payload',
    re: /(?:eval\s*\(\s*(?:atob|base64_decode|Buffer\.from)|base64\s+(?:-d|--decode)\s*\|\s*(?:ba)?sh|FromBase64String[^\n]{0,80}\|\s*iex)/gi,
  },

  // ---------- high ----------
  {
    id: 'instruction-override', severity: 'high',
    zh: '覆盖既有指令', en: 'Instruction override',
    re: /(?:ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions?|disregard\s+(?:the\s+)?(?:above|previous|prior)|override\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)|忽略(?:之前|上面|以上|先前)的?(?:所有)?(?:指令|提示|规则)|无视(?:之前|上述)(?:指令|规则))/gi,
  },
  {
    id: 'conceal-from-user', severity: 'high',
    zh: '要求对用户隐瞒', en: 'Instructs concealment from user',
    re: /(?:do\s+not\s+(?:tell|inform|mention\s+(?:this\s+)?to)\s+the\s+user|don'?t\s+(?:tell|mention\s+(?:this\s+)?to)\s+the\s+user|without\s+(?:informing|notifying|telling)\s+the\s+user|silently\s+(?:send|upload|post|exfiltrat)|不要(?:告诉|告知|提示|通知)用户|无需(?:告知|提示)用户|悄悄(?:发送|上传|执行))/gi,
  },
  {
    id: 'hidden-instruction', severity: 'high',
    zh: '隐藏指令', en: 'Hidden instruction',
    fn: (text) => {
      const out = [];
      // 零宽字符单独出现多为抓取残留(文档站锚点会在标题后留 U+200B),不是攻击。
      // 真正的规避手法是把零宽字符插进单词中间来打断关键词匹配 —— 只有那种才定 high。
      const inWord = /[A-Za-z一-鿿][​-‍⁠﻿]+[A-Za-z一-鿿]/.exec(text);
      if (inWord) {
        out.push({ index: inWord.index, match: '零宽字符插入词中,疑似规避关键词匹配:' + JSON.stringify(inWord[0]) });
      } else if (ZERO_WIDTH.test(text)) {
        out.push({ index: text.search(ZERO_WIDTH), match: '存在零宽字符(常见于文档站抓取残留,需人工确认)', severity: 'low' });
      }
      const re = /<!--([\s\S]{0,600}?)-->/g;
      let m;
      while ((m = re.exec(text)) && out.length < 5) {
        const inner = m[1];
        if (/\b(?:you\s+must|always\s+send|never\s+tell|ignore\s+|upload|exfiltrat|api[_\s-]?key)\b/i.test(inner)
            || /(?:必须|务必|不要告诉|发送到|上传到)/.test(inner)) {
          out.push({ index: m.index, match: inner.replace(/\s+/g, ' ').slice(0, 160) });
        }
      }
      const css = /color\s*:\s*(?:#fff(?:fff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i.exec(text);
      if (css) out.push({ index: css.index, match: '白色隐藏文本样式:' + css[0] });
      return out;
    },
  },
  {
    // 只放真凭证载体。.npmrc / .pypirc 之类另开一条中危规则 —— 它们绝大多数时候是镜像源配置。
    id: 'credential-file-access', severity: 'high',
    zh: '触碰凭证文件', en: 'Credential file access',
    re: /(?:~\/\.ssh\b|\bid_rsa\b|\bid_ed25519\b|\.aws\/credentials|\.git-credentials|Login\s+Keychain|security\s+find-generic-password|AppData\\Roaming\\[^\n]{0,60}(?:Cookies|Login\s*Data)|\/etc\/shadow)/gi,
  },
  {
    id: 'destructive-ops', severity: 'high',
    zh: '破坏性操作', en: 'Destructive operation',
    // `rm -rf ~` 要求 ~ 后是空白或行尾 —— `rm -rf ~/.cache/foo` 是正常清理,不该报
    re: /(?:rm\s+-rf\s+(?:\/(?:\s|$)|~(?:\s|$)|\$HOME(?:\s|$)|\*(?:\s|$))|Remove-Item[^\n]{0,60}-Recurse[^\n]{0,60}-Force[^\n]{0,40}(?:[A-Z]:\\(?:\s|$)|\$HOME|~(?:\s|$))|git\s+push\s+(?:--force|-f)\b|:\(\)\s*\{\s*:\|:&\s*\};:|\bformat\s+[a-z]:\s)/gi,
  },
  {
    id: 'package-config-access', severity: 'medium',
    zh: '触碰包管理配置', en: 'Package manager config access',
    re: /(?:\.npmrc\b|\.pypirc\b|\.docker\/config\.json|\.netrc\b)/gi,
  },
  {
    id: 'sql-destructive', severity: 'medium',
    zh: 'SQL 破坏性语句', en: 'Destructive SQL statement',
    re: /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\s+TABLE\b|\bDELETE\s+FROM\s+\w+\s*(?:;|$)/gi,
  },

  // ---------- medium ----------
  {
    id: 'unrestricted-tools', severity: 'medium',
    zh: '工具权限过宽', en: 'Overly broad tool grant',
    fn: (text, ctx) => {
      const tools = [...(ctx?.spec?.allowedTools || []), ...(ctx?.spec?.tools || [])].map((t) => String(t).trim());
      if (!tools.length) return [];
      const bad = tools.filter((t) => t === '*' || /^all$/i.test(t) || /^bash$/i.test(t) || /^Bash\(\*\)$/i.test(t));
      return bad.length ? [{ index: 0, match: `allowed-tools: ${bad.join(', ')}(无约束)`, noFence: true }] : [];
    },
  },
  {
    id: 'dotenv-exfil', severity: 'medium',
    zh: '读取 .env 并可能外发', en: 'Reads .env with egress nearby',
    fn: (text) => {
      const out = [];
      const re = /(?:cat|type|Get-Content|read|open|load|source)\s+[^\n]{0,40}\.env\b/gi;
      let m;
      while ((m = re.exec(text)) && out.length < 5) {
        const win = text.slice(m.index, m.index + 300);
        if (/(?:curl|wget|fetch|post|upload|webhook|https?:\/\/)/i.test(win)) {
          out.push({ index: m.index, match: win.replace(/\s+/g, ' ').slice(0, 160) });
        }
      }
      return out;
    },
  },
  {
    id: 'raw-endpoint', severity: 'medium',
    zh: '裸 IP 或短链接端点', en: 'Raw IP / shortener endpoint',
    re: /https?:\/\/(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?|bit\.ly|tinyurl\.com|t\.cn|dwz\.cn|is\.gd|goo\.gl)\S*/gi,
  },
  {
    id: 'persistence-write', severity: 'medium',
    zh: '写入自启动/持久化位置', en: 'Writes to autorun / persistence location',
    re: /(?:(?:>>|>|Add-Content|Set-Content|tee\s+-a)[^\n]{0,60}(?:\.bashrc|\.zshrc|\.profile|\$PROFILE|\.claude\/settings\.json)|crontab\s+-|schtasks\s+\/create|Register-ScheduledTask|launchctl\s+load|systemctl\s+enable)/gi,
  },
  {
    id: 'external-script-fetch', severity: 'medium',
    zh: '下载外部脚本', en: 'Downloads external script',
    re: /(?:curl|wget|Invoke-WebRequest|iwr)\s[^\n]{0,200}\.(?:sh|ps1|py|exe|bat|cmd)\b/gi,
  },

  // ---------- low(导流/广告) ----------
  {
    id: 'promo-link', severity: 'low',
    zh: '推广/返利链接', en: 'Promotional / affiliate link',
    re: /https?:\/\/\S{0,120}(?:utm_source=|utm_campaign=|[?&](?:ref|aff|affiliate|invite|referral)=)\S*/gi,
  },
  {
    id: 'contact-solicitation', severity: 'low',
    zh: '导流联系方式', en: 'Contact solicitation',
    re: /(?:加(?:我)?(?:的)?微信|微信号\s*[:：]|vx\s*[:：]|wechat\s*[:：]\s*\S|扫码(?:关注|添加|进群)|公众号回复|私信我|加入(?:我的)?(?:知识)?星球|添加助理)/gi,
  },
  {
    id: 'paid-funnel', severity: 'low',
    zh: '付费导流', en: 'Paid funnel',
    re: /(?:付费(?:课程|社群|专栏)|限时优惠|优惠码\s*[:：]|立即(?:购买|下单)|coupon\s+code\s*[:：]|discount\s+code\s*[:：])/gi,
  },
];

const lineOf = (text, index) => text.slice(0, Math.max(0, index)).split('\n').length;

/** ``` / ~~~ 围栏区间,用于判定命中是否落在示例代码里 */
function fenceRanges(text) {
  const out = [];
  const re = /(?:^|\n)[ \t]*(?:```|~~~)[\s\S]*?(?:\n[ \t]*(?:```|~~~)|$)/g;
  let m;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}
const inRanges = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);

/** 安全类工具天然会提到攻击关键词,对非 critical 做衰减 */
function isSecurityContext(ctx) {
  const s = `${ctx?.name || ''} ${ctx?.description || ''} ${ctx?.source?.path || ''}`.toLowerCase();
  return /(security|pentest|vulnerab|owasp|exploit|malware|forensic|redteam|red-team|hacking|审计|渗透|漏洞|安全)/.test(s);
}

function scanText(text, where, ctx, acc) {
  if (!text) return;
  const fences = where === 'body' ? fenceRanges(text) : [];

  for (const rule of RULES) {
    let hits = [];
    if (rule.fn) {
      try { hits = rule.fn(text, ctx) || []; } catch { hits = []; }
    } else {
      const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
      let m;
      let n = 0;
      while ((m = re.exec(text)) && n < 5) {
        hits.push({ index: m.index, match: m[0].replace(/\s+/g, ' ').slice(0, 160) });
        n++;
        if (m[0].length === 0) re.lastIndex++;
      }
    }

    for (const h of hits) {
      const fenced = !h.noFence && where === 'body' && inRanges(fences, h.index);
      const base = h.severity || rule.severity; // 规则可按命中内容自行降级
      acc.push({
        id: rule.id,
        severity: fenced ? downgrade(base) : base,
        baseSeverity: base,
        inFence: fenced,
        title: { zh: rule.zh, en: rule.en },
        where,
        line: lineOf(text, h.index),
        evidence: h.match,
      });
    }
  }
}

/**
 * @param {object} entry 归一化前的条目(需带 _body / _scriptBodies)
 * @returns {{score:number, level:string, flags:Array}}
 */
export function auditEntry(entry) {
  const acc = [];
  const body = entry._body ?? entry.bodyPreview ?? '';
  scanText(body, 'body', entry, acc);
  const scripts = entry._scriptBodies || [];
  for (const s of scripts) scanText(s, 'script', entry, acc);

  const seen = new Set();
  const flags = acc.filter((f) => {
    const k = `${f.id}|${f.where}|${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const damp = isSecurityContext(entry);

  // 同一规则重复命中按边际递减计分。线性累加会让「AWS CLI 指南里提了三次
  // ~/.aws/credentials」这种正常文档冲到 critical —— 重复出现不等于更危险。
  const byRule = new Map();
  for (const f of flags) {
    const cur = byRule.get(f.id) || { severity: f.severity, n: 0, script: false };
    if (SEV_ORDER.indexOf(f.severity) > SEV_ORDER.indexOf(cur.severity)) cur.severity = f.severity;
    cur.n++;
    if (f.where === 'script') cur.script = true;
    byRule.set(f.id, cur);
  }

  let score = 0;
  for (const r of byRule.values()) {
    let w = SEV_WEIGHT[r.severity] || 0;
    w *= Math.min(2, 1 + 0.4 * (r.n - 1));           // 边际递减,最多 2 倍封顶
    if (r.script) w *= 1.5;                          // 脚本里的同款问题更实锤
    if (damp && r.severity !== 'critical') w *= 0.4; // 安全类工具的中低危衰减
    score += w;
  }
  score = Math.min(100, Math.round(score));

  // 等级由最高严重度主导,不由累加分数主导:
  // 一条实锤的 critical 就该是 critical,一堆 low 堆到 60 分不该是。
  const hasCritical = flags.some((f) => f.severity === 'critical');
  const hasHigh = flags.some((f) => f.severity === 'high');
  const level = hasCritical ? 'critical'
    : hasHigh && score >= 35 ? 'high'
    : score >= 15 ? 'medium'
    : score > 0 ? 'low' : 'clean';

  return {
    score,
    level,
    flags: flags.slice(0, 30),
    counts: flags.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {}),
    scanned: { body: !!body, scripts: scripts.length },
    dampened: damp,
    engine: 'text-baseline/v2',
  };
}
