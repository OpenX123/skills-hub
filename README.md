# skills-hub

跨端 Agent 资源注册表 —— 把散落在各处的 **skill / subagent / command / rules / plugin / MCP** 抓下来,归一化、去重、分类、审计,产出机器可读的 registry,并支持定时增量更新。

不是又一个 awesome-list。链接聚合是零边际成本的东西,这里做的是三件别人没做的:**去重看穿搬运、审计看穿注入、灌仓识别看穿刷量**。

---

## 快速开始

```bash
node src/cli.js sync      # 抓取 + 归一化,一步到位
node src/cli.js stats     # 看底表
node src/cli.js search 小红书 --lang zh
node src/cli.js risk --limit 20
```

零依赖,只需 **Node ≥ 20** 和 **git**。装了 `gh` 并登录的话会额外拿到 star / 最后推送时间作为质量信号(没有也能跑,质量分自动降级)。

---

## 命令

| 命令 | 作用 |
|---|---|
| `crawl` | 抓取种子源。上游 commit 未变则复用上轮结果(增量) |
| `build` | 归一化 / 分类 / 去重 / 打分 / 产出 registry |
| `sync` | crawl + build |
| `stats` | 打印底表 |
| `search <关键词>` | 检索,支持 `--type` `--cat` `--lang` `--limit` |
| `risk` | 列出风险条目及证据行号 |

常用选项:`--tier 0,1,2` 只抓指定层级 · `--only <子串>` 只抓某些仓库 · `--force` 忽略增量缓存 · `--no-mcp` 跳过 MCP registry

---

## 数据来源

配置在 [`sources/seeds.json`](sources/seeds.json),按获取成本分层而非按名气:

- **tier 0** 官方规范基准 —— `anthropics/skills`、官方 MCP Registry(免鉴权 REST API,支持 `updated_since` 增量)
- **tier 1** 元索引 —— `Chat2AnyLLM/awesome-claude-skills`(追踪 2,200+ 源仓库)、`punkpeye/awesome-mcp-servers`
- **tier 2** 人工精选内容源 —— 英文侧 `obra/superpowers`、`ComposioHQ`、`davila7/claude-code-templates` 等;中文侧 `laolaoshiren`、`helloianneo`、`xu-xiang`、`joneqian`、`huangwb8` 等

`role` 字段区分两种源:`content` 是内容源(抽取资源),`curated-index` 是**投票源**(只采集它推荐了哪些仓库)。

### 关于 skills.sh

`skills.sh` 有全量榜单、安装量、hot 时间序列和官方审计结论,是理论上最好的数据源。但 2026-07-26 实测**所有端点均返回 401**,需要 Vercel OIDC token。配置已就位(`registries[].skills-sh`),拿到 token 后把 `enabled` 改成 `true` 即可接管。

### 明确不抓的

`skillsmp.com`(声称 233 万条,数量级不可信)、`claudemarketplaces.com` / `agent-skills.cc` / `lobehub`(无公开 API,页面抓取属二手数据且有 ToS 风险)。这些只用作排序结果的交叉验证。

---

## 三层去重

上游的冗余不是一种,是三种,混在一起统计会得出错误结论:

| 层 | 判定方式 | 含义 |
|---|---|---|
| **精确重复** | 归一化后 SHA-256 相同 | 逐字节搬运 |
| **跨仓搬运** | MinHash + LSH,Jaccard ≥ 0.75,**且跨仓库** | 改几个字的搬运 —— 精确哈希抓不到 |
| **模板批量生成** | 高相似但**同仓库内** | 不是搬运,是灌仓库存(一个厂商为每个 SaaS 生成一份) |

第三类最容易被误判成重复。它们语义各不相同,不该判重;但它是「批量灌仓刷量」的指纹,单独标记并在质量分里按族规模降权。

canonical 判定优先级:tier 越低越权威 → star 越多 → 仓库创建越早 → 路径越短。

---

## 安全审计

`src/audit.js`,引擎 `text-baseline/v2`。

**为什么要自己做**:skills.sh 的审计接的是 Socket / Snyk,它们是为 npm/pypi 依赖设计的**代码供应链扫描器**。而 Snyk 自己的 ToxicSkills 研究指出,agent skill 上最主流的攻击手法**不含任何代码** —— 就是在 SKILL.md 正文里埋一句隐藏指令。代码扫描器结构性地扫不出这类东西。而且官方审计页当时只覆盖了约 50 个 skill。

**14 条规则**,分四档:

- `critical` 指示外传密钥、pipe-to-shell 远程执行、混淆载荷
- `high` 覆盖既有指令、要求对用户隐瞒、隐藏指令(零宽字符插入词中)、触碰凭证文件、破坏性操作、密钥拼进 URL
- `medium` 工具权限过宽、读 .env 并可能外发、裸 IP/短链、写自启动位置、下载外部脚本、包管理配置、破坏性 SQL
- `low` 推广返利链接、导流联系方式、付费导流

**三条降误报机制**(v1 因为缺这些,在真实数据上误报率超过 90%):

1. **判意图不判关键词**。文档里写 `export FOO_API_KEY=...` 是安装说明;只有密钥被拼进 URL,或出现「把密钥发送到某处」的祈使句,才算外传。
2. **围栏代码块降一级**。SKILL.md 的散文是 agent 真正会执行的指令,``` 里多为示例。仍然报出,但降级并标 `inFence`,交人工判断。
3. **安全类工具衰减**。渗透/审计类 skill 天然会提到攻击关键词,对非 critical 项衰减到 0.4 权重。

另外:零宽字符**单独出现**多为文档站抓取残留(标题后的 U+200B),只有插进单词中间打断关键词匹配才判 high;已知官方安装器(bun.sh、rustup.rs 等)的 pipe-to-shell 降到 medium。

定位是**基线筛**,筛出待人工复核项,不构成终审判决。

---

## 质量分与四道闸

```
score = 40×策展交叉命中 + 25×star + 20×活跃度 + 15×完备度 − 0.3×风险分 − 模板族惩罚
```

排在第一位的是**「被多少个独立人工精选源同时收录」**。刷 star 容易,同时混进多个互不相关策展人的名单里很难 —— 这是全套信号里最抗刷的一个。

四道闸(全过且 score ≥ 40 才进推荐位):

| 闸 | 条件 |
|---|---|
| security | 风险等级不是 critical / high |
| schema | 有名字且描述 ≥ 20 字 |
| unique | 不是重复副本 |
| alive | 近 365 天有提交 |

**全都收,但不全都展示** —— 长尾进 raw 层,展示层默认只放过闸的。

---

## 产出

```
registry/
  index.json          # 全量精简条目 + 分类/类型字典(主要消费入口)
  entries.json        # 全量完整条目
  stats.json          # 底表
  risk-report.json    # 风险条目 + 证据行号
  by-type/*.json
  by-category/*.json
```

条目结构:

```jsonc
{
  "id": "skill:anthropics/skills:pdf/skill.md#pdf",
  "type": "skill",
  "name": "pdf",
  "description": { "zh": null, "en": "...", "needsTranslation": ["zh"] },
  "lang": "en",
  "categories": ["document"],
  "targets": ["claude-code", "claude-ai", "codex", "cursor", "agents"],
  "source": { "repo": "...", "path": "...", "url": "...", "tier": 0 },
  "quality": { "score": 78, "gates": {}, "recommended": true },
  "risk": { "level": "clean", "score": 0 },
  "duplicateOf": null, "nearDuplicateOf": null,
  "templateFamily": null, "familySize": 0
}
```

---

## 中文描述翻译

上游 96% 的描述是英文。翻译层把它们补成中文,并且**能跟着每日抓取自动增量更新**。

```bash
node src/cli.js translate --status     # 看缓存与待翻数量
node src/cli.js translate              # 增量翻译(sync 会自动带上)
node src/cli.js translate --no-...     # 见下方选项
```

### 缓存按英文原文哈希索引,不按条目 id

这是整个设计的关键。上游有大量搬运和模板批量生成,11,014 条待翻只对应 10,486 条唯一文本;更重要的是,**同一段描述换了仓库、改了路径、甚至被搬到另一个 repo,都会命中同一条译文**。所以:

- 首次回填一次到位,之后每日定时任务只翻当轮**新出现**的文本(通常几条到几十条)
- 译文存在 `data/translations.json` 并**提交进版本库** —— 它是资产不是缓存,丢了就得整轮重翻
- 上游改了描述 → 哈希变了 → 自动重翻那一条,不会留着过期译文

### provider 可插拔

| provider | 用在哪 | 说明 |
|---|---|---|
| `claude-cli` | 本机 / Windows 计划任务 | 走 `claude -p` headless,复用已有登录态,**不需要 API key** |
| `anthropic-api` | GitHub Actions | 需要 `ANTHROPIC_API_KEY` secret |
| `none` | 都没有时 | 不翻译、**不伪造**,条目保留 `needsTranslation` 标记 |

`auto`(默认)按 `ANTHROPIC_API_KEY` → `claude CLI` → `none` 的顺序挑。

Windows 上有个坑:`claude` 是 shell shim,Node 不加 `shell:true` 解析不到;但 `shell:true` 又会把参数原样拼进命令行不做转义。所以 prompt 一律走 **stdin**,描述里带引号、竖线、换行都不会破坏调用。

### 大批量回填

首次 10,486 条走分片队列并发回填:

```bash
node src/cli.js translate --queue        # 切成 84 个分片(每片 125 条)
# 由多个 agent / 进程并发填 out-NNN.json
node src/cli.js translate --merge        # 合并进缓存
node src/cli.js build                    # 中文灌回条目
```

翻译规范写在 `src/translate.js` 的 PROMPT_HEAD 里:专有名词与代码标识符不译(`SKILL.md`、`MCP`、包名、API 名),术语用中文开发者习惯译法,触发语照译不省略。

条目里保留 `description.zhEngine` 标记译文来源,原生中文描述则没有这个字段 —— 机器译文与人写的中文在数据层可区分。

---

## 站点

有两套前端,共用同一份 registry 数据。

### A. 零依赖静态站(site/)

```bash
node src/cli.js site      # 从 registry 生成 site/
node site/serve.js        # -> http://localhost:8787
```

`sync` 会自动带上这步。`site/index.html` 也可以直接双击打开 —— 数据以 `.js` 而非 `.json` 写出,不受 `file://` 的 fetch 限制。

### B. Next.js 站(web/)

页面骨架由 [ditto.site](https://github.com/ion-design/ditto.site) 编译产出(该工具把渲染后的公开页面编译成 Next.js 工程),在此基础上替换为本项目自有的品牌、文案与数据。

```bash
node src/cli.js site                       # 同时写出 web/public/data/*.json
cd web && npm install && npm run build     # 静态导出到 web/out
node serve.mjs                             # -> http://localhost:3000
```

Next 配了 `output: export`,所以用 `serve.mjs` 发静态产物,不能用 `next start`。

按 ditto.site 自身的 [RESPONSIBLE_USE](https://github.com/ion-design/ditto.site/blob/main/docs/RESPONSIBLE_USE.md) 要求,生成物与原发布方明确分离:抓取前核过 robots(只取允许的 `/`,单次低频),并已移除原站的 logo、favicon、字标、营销文案、第三方厂商商标图标,以及 `llms.txt` 里的原站正文快照。留下的是版式骨架与 CSS token;品牌、文案、全部 11,014 条数据均为本项目自有。

两套前端的信息架构一致:排行榜 + 多维筛选 + 详情抽屉 + 审计面。

- **目录** —— 11,014 条全量,5 种排序(质量分 / 策展交叉命中 / 仓库热度 / 风险优先 / 名称),按类型、分类、语言、风险四维筛选,三个视图开关(只看推荐位 / 隐藏重复副本 / 隐藏模板批量生成)。滚动增量渲染,`/` 聚焦搜索。
- **详情抽屉** —— 完整描述、信号明细、审计发现(含行号与证据片段)、以及**按类型生成的安装命令**:skill 给多端安装(`~/.claude/skills` + `~/.codex/skills` + `~/.agents/skills`,bash 与 PowerShell 两版),rules 给 `.cursor/rules` 落盘,plugin 给 `/plugin marketplace add`,MCP 按 transport 给 `claude mcp add`(http 4,329 条 / stdio 3,006 条可直接生成)。
- **审计 / 数据源 / 底表** 三个页面直接读 registry 产物。

数据分片加载:非 MCP 的 3,964 条先渲染(gzip 后 232KB),7,050 条 MCP 后台补(556KB)。深色/浅色跟随系统并可手动切换。

---

## 定时抓取

### GitHub Actions

[`.github/workflows/sync.yml`](.github/workflows/sync.yml) 每天 19:00 UTC(北京时间次日 03:00)跑一次,自动提交 registry 变更,并把 `stats.json` / `risk-report.json` 作为 artifact 留存 30 天。上游浅克隆副本走 actions/cache 跨轮复用。也支持手动触发(可勾选全量重抓)。

### Windows 本地计划任务

```powershell
# 注册(默认每天 03:00,无需管理员权限)
powershell -ExecutionPolicy Bypass -File scripts\schedule-windows.ps1 -Register

powershell ... -Register -At 06:30   # 自定义时间
powershell ... -Status               # 查看状态
powershell ... -RunNow               # 立即跑一次
powershell ... -Unregister           # 移除
```

日志写到 `data/logs/`,保留最近 30 份。任务设了错过补跑、电池下允许执行、3 小时超时上限。

### 增量机制

`data/raw/_manifest.json` 记录每个仓库上轮的 commit ref。ref 未变则跳过解析直接复用产物;MCP registry 用 `updated_since` 只取变更。全量重抓加 `--force`。

---

## 工程约束

零依赖(本机没有 npm,`node_modules` 不可用),因此 YAML frontmatter 解析、MinHash、日志、HTTP 重试全部手写在 `src/lib/` 下。好处是 `git clone` 完就能跑。

```
src/
  cli.js          命令分发
  crawl.js        抓取编排(增量 + 审计在此完成,正文不落盘)
  build.js        归一化 / 打分 / 产出
  extract.js      仓库 -> 资源条目
  detect.js       路径 -> 资源类型判定
  mentions.js     榜单链接采集(投票信号)
  categorize.js   双语分类 + 语言识别
  dedupe.js       三层去重 + canonical 判定
  audit.js        安全审计规则集
  sources/        registry 类数据源
  lib/            frontmatter / minhash / git / gh / fs / log
```
