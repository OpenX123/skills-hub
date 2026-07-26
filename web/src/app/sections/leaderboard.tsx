"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH } from "../../lib/site";

/* 紧凑记录字段位 —— 与 src/site.js 的 compact() 一一对应 */
const N = 0, D = 1, T = 2, C = 3, L = 4, S = 5, R = 6, REPO = 7, PATH = 8,
      STAR = 9, MEN = 10, FL = 11, TG = 12, URL = 13, FAM = 14, TIER = 15, SPEC = 16;
const F_DUP = 1, F_NEAR = 2, F_FAMILY = 4, F_REC = 8;

type Row = any[];
type Meta = {
  generatedAt: string;
  stats: any;
  types: { key: string; zh: string; en: string }[];
  cats: { key: string; zh: string; en: string }[];
  langs: string[];
  risks: string[];
  targets: string[];
  sources: any[];
  risk: Record<string, { level: string; score: number; flags: any[] }>;
};

const num = (n: number) => (n == null || n < 0 ? "—" : n.toLocaleString("en-US"));
const compact = (n: number) =>
  n == null || n < 0 ? "—" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);

const SORTS = [
  { k: "score", label: "质量分" },
  { k: "curated", label: "策展交叉命中" },
  { k: "stars", label: "仓库热度" },
  { k: "risk", label: "风险优先" },
  { k: "name", label: "名称" },
] as const;

const RISK_CLS: Record<string, string> = {
  low: "text-muted-foreground border-border",
  medium: "text-[#d29922] border-[#5a4713]",
  high: "text-[#f85149] border-[#6a2020]",
  critical: "text-background bg-[#f85149] border-[#f85149]",
};

function Tag({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return (
    <span
      className={
        "border border-solid inline-block py-px px-1.5 rounded-full [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-[0.625rem] leading-4 " +
        (cls || "border-border text-muted-foreground")
      }
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------- 安装命令 */
function installBlocks(r: Row, typeKey: string): [string, string][] {
  const name = r[N], repo = r[REPO], p = String(r[PATH] || "");
  const dir = p.includes("/") ? p.replace(/\/[^/]*$/, "") : ".";
  const out: [string, string][] = [];

  if (typeKey === "skill") {
    out.push([
      "克隆并安装到多端 (bash)",
      `git clone --depth 1 https://github.com/${repo} /tmp/hub-src\n` +
        `for D in ~/.claude/skills ~/.codex/skills ~/.agents/skills; do\n` +
        `  mkdir -p "$D" && cp -r /tmp/hub-src/${dir} "$D/${name}"\n` +
        `done`,
    ]);
    out.push([
      "PowerShell",
      `git clone --depth 1 https://github.com/${repo} $env:TEMP\\hub-src\n` +
        `foreach ($D in @("$HOME\\.claude\\skills","$HOME\\.codex\\skills","$HOME\\.agents\\skills")) {\n` +
        `  New-Item -ItemType Directory -Force $D | Out-Null\n` +
        `  Copy-Item -Recurse -Force "$env:TEMP\\hub-src\\${dir.replace(/\//g, "\\")}" "$D\\${name}"\n}`,
    ]);
  } else if (typeKey === "rules") {
    out.push([
      "放进项目规则目录",
      `mkdir -p .cursor/rules\n` +
        `curl -sSL https://raw.githubusercontent.com/${repo}/HEAD/${p} -o .cursor/rules/${name}${/\.mdc$/.test(p) ? ".mdc" : ""}`,
    ]);
  } else if (typeKey === "subagent") {
    out.push(["安装子代理", `mkdir -p ~/.claude/agents\ncurl -sSL https://raw.githubusercontent.com/${repo}/HEAD/${p} -o ~/.claude/agents/${name}.md`]);
  } else if (typeKey === "command") {
    out.push(["安装斜杠命令", `mkdir -p ~/.claude/commands\ncurl -sSL https://raw.githubusercontent.com/${repo}/HEAD/${p} -o ~/.claude/commands/${name}.md`]);
  } else if (typeKey === "plugin") {
    out.push(["在 Claude Code 内添加市场", `/plugin marketplace add ${repo}\n/plugin install ${name}`]);
  } else if (typeKey === "mcp") {
    const sp = r[SPEC] || {};
    if (sp.u) out.push(["远程 MCP (streamable-http)", `claude mcp add --transport http ${sp.rn || name} ${sp.u}`]);
    if (sp.pk) {
      const id = String(sp.pk).split(":")[1] || "";
      if (id) out.push(["本地 MCP (stdio)", `claude mcp add ${sp.rn || name} -- npx -y ${id}`]);
    }
    if (!sp.u && !sp.pk) out.push(["官方注册表条目", `# ${sp.rn || name}`]);
  }
  return out;
}

/* ---------------------------------------------------------- 详情抽屉 */
function Drawer({ row, meta, onClose }: { row: Row | null; meta: Meta; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [onClose]);

  if (!row) return null;
  const type = meta.types[row[T]];
  const url = row[URL] || `https://github.com/${row[REPO]}/blob/HEAD/${row[PATH]}`;
  const rk = meta.risk[`${row[REPO]} ${row[PATH]} ${row[N]}`];
  const blocks = installBlocks(row, type.key);

  return (
    <div className="flex fixed inset-0 z-60 justify-end">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.6)]" onClick={onClose} />
      <article className="w-[min(680px,100%)] h-full block relative overflow-auto bg-background border-l border-solid border-l-border py-6 px-7 pb-16">
        <button
          className="absolute top-4 right-5 text-muted-foreground text-2xl leading-none cursor-pointer hover:text-foreground"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
        <h2 className="block mr-9 mb-1.5 text-xl font-medium leading-7 tracking-[-0.5px] [word-break:break-word]">{row[N]}</h2>
        <div className="block [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4 text-muted-foreground [word-break:break-all]">
          {row[REPO]}
          {row[PATH] ? ` · ${row[PATH]}` : ""}
        </div>

        <div className="flex flex-wrap gap-1.5 my-3">
          <Tag>{type.zh}</Tag>
          {meta.langs[row[L]] === "zh" && <Tag cls="text-[#f0883e] border-[#5c3a1a]">中文</Tag>}
          {row[FL] & F_REC ? <Tag cls="text-[#3fb950] border-[#1d4429]">推荐</Tag> : null}
          {rk && rk.level !== "clean" && <Tag cls={RISK_CLS[rk.level]}>{rk.level}</Tag>}
          {row[C].map((ci: number) => meta.cats[ci] && <Tag key={ci}>{meta.cats[ci].zh}</Tag>)}
        </div>

        <Section title="描述">
          <p className="block text-muted-foreground text-sm leading-6">{row[D] || "（该条目没有提供描述）"}</p>
        </Section>

        <Section title="信号">
          <dl className="grid gap-1.5 gap-x-4 grid-cols-[auto_1fr] text-sm">
            <Kv k="质量分" v={`${row[S]} / 100`} />
            <Kv k="策展交叉命中" v={String(row[MEN])} />
            <Kv k="仓库 star" v={num(row[STAR])} />
            <Kv k="源层级" v={`tier ${row[TIER]}`} />
            <Kv k="可用端" v={row[TG].map((t: number) => meta.targets[t]).join(", ") || "—"} />
            {row[FAM] ? <Kv k="模板族规模" v={String(row[FAM])} /> : null}
          </dl>
        </Section>

        {blocks.length > 0 && (
          <Section title="安装">
            {blocks.map(([label, cmd]) => (
              <div key={label}>
                <p className="block mb-1 text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4">{label}</p>
                <pre className="border border-solid border-border block mb-2 py-2.5 px-3 rounded-md overflow-x-auto bg-clr-1 [font-family:var(--font-002)] text-xs leading-5 whitespace-pre">
                  {cmd}
                </pre>
              </div>
            ))}
          </Section>
        )}

        {rk && rk.flags.length > 0 && (
          <Section title={`审计发现 · ${rk.level} (${rk.score})`}>
            {rk.flags.map((f: any, i: number) => (
              <div className="border border-solid border-border block mb-2 py-2.5 px-3 rounded-md bg-clr-1" key={i}>
                <div className="flex flex-wrap items-center gap-2 text-sm leading-5">
                  <Tag cls={RISK_CLS[f.s]}>{f.s}</Tag>
                  <b className="font-medium">{f.t}</b>
                  <span className="text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs">
                    L{f.l} · {f.w}
                    {f.f ? " · 围栏内" : ""}
                  </span>
                </div>
                <div className="block mt-1.5 text-muted-foreground [font-family:var(--font-002)] text-xs leading-5 whitespace-pre-wrap [word-break:break-all]">
                  {f.e}
                </div>
              </div>
            ))}
            <p className="block text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4">
              静态文本匹配基线,用于筛出需人工复核的条目,不构成终审判决。
            </p>
          </Section>
        )}

        <div className="block mt-6">
          <a
            className="border border-solid border-border inline-block py-2 px-3.5 rounded-md text-sm leading-5 cursor-pointer bg-clr-1 hover:text-foreground"
            href={url}
            rel="noopener noreferrer"
            target="_blank"
          >
            在 GitHub 打开源文件 ↗
          </a>
        </div>
      </article>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="block mt-6">
    <h3 className="block mb-2 text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4 uppercase">{title}</h3>
    {children}
  </div>
);
const Kv = ({ k, v }: { k: string; v: string }) => (
  <>
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="m-0 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-5">{v}</dd>
  </>
);

/* ---------------------------------------------------------- 主组件 */
export default function Leaderboard({ meta }: { meta: Meta }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedMcp, setLoadedMcp] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string>("score");
  const [types, setTypes] = useState<Set<number>>(new Set());
  const [onlyRec, setOnlyRec] = useState(false);
  const [hideDup, setHideDup] = useState(true);
  const [shown, setShown] = useState(50);
  const [open, setOpen] = useState<Row | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE_PATH}/data/core.json`)
      .then((r) => r.json())
      .then((core: Row[]) => {
        if (!alive) return;
        setRows(core);
        return fetch(`${BASE_PATH}/data/mcp.json`).then((r) => r.json());
      })
      .then((mcp: Row[] | undefined) => {
        if (!alive || !mcp) return;
        setRows((prev) => prev.concat(mcp));
        setLoadedMcp(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  const filtered = useMemo(() => {
    const tk = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = rows.filter((r) => {
      if (hideDup && (r[FL] & F_DUP || r[FL] & F_NEAR)) return false;
      if (onlyRec && !(r[FL] & F_REC)) return false;
      if (types.size && !types.has(r[T])) return false;
      if (tk.length) {
        const hay = `${r[N]} ${r[D]} ${r[REPO]} ${r[PATH]}`.toLowerCase();
        if (!tk.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      score: (a, b) => b[S] - a[S] || b[MEN] - a[MEN],
      curated: (a, b) => b[MEN] - a[MEN] || b[S] - a[S],
      stars: (a, b) => b[STAR] - a[STAR] || b[S] - a[S],
      risk: (a, b) => b[R] - a[R] || b[S] - a[S],
      name: (a, b) => String(a[N]).localeCompare(String(b[N])),
    };
    return out.sort(cmp[sort]);
  }, [rows, q, sort, types, onlyRec, hideDup]);

  useEffect(() => setShown(50), [q, sort, types, onlyRec, hideDup]);

  const loadMore = useCallback(() => setShown((s) => s + 50), []);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (en) => en[0].isIntersecting && shown < filtered.length && loadMore(),
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, filtered.length, loadMore]);

  const toggleType = (i: number) =>
    setTypes((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const typeCounts = useMemo(() => {
    const c = new Array(meta.types.length).fill(0);
    rows.forEach((r) => {
      if (hideDup && (r[FL] & F_DUP || r[FL] & F_NEAR)) return;
      c[r[T]]++;
    });
    return c;
  }, [rows, hideDup, meta.types.length]);

  return (
    <>
      <div className="block py-4 w-full" id="leaderboard">
        <div className="block mb-6">
          <div className="block relative">
            <input
              ref={inputRef}
              className="w-full h-[2.8125rem] border-b border-solid border-b-foreground inline-block py-3 px-3 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-5 cursor-text bg-transparent outline-none"
              placeholder="搜索名称 / 描述 / 仓库…"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="h-full flex absolute top-0 right-0 items-center pointer-events-none max-md:hidden">
              <kbd className="border border-solid border-border block py-0.5 px-1.5 rounded-sm text-color-001 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-5">
                /
              </kbd>
            </div>
          </div>
        </div>

        <div className="flex mb-3 gap-4 flex-wrap [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-5">
          {SORTS.map((s) => (
            <button
              key={s.k}
              className={
                "cursor-pointer " +
                (sort === s.k ? "text-foreground underline underline-offset-4" : "text-muted hover:text-foreground")
              }
              onClick={() => setSort(s.k)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex mb-4 gap-1.5 flex-wrap items-center">
          {meta.types.map((t, i) =>
            typeCounts[i] ? (
              <button key={t.key} onClick={() => toggleType(i)} className="cursor-pointer">
                <Tag cls={types.has(i) ? "text-background bg-foreground border-foreground" : ""}>
                  {t.zh} {compact(typeCounts[i])}
                </Tag>
              </button>
            ) : null
          )}
          <span className="w-px h-4 bg-border mx-1" />
          <button onClick={() => setOnlyRec((v) => !v)} className="cursor-pointer">
            <Tag cls={onlyRec ? "text-background bg-foreground border-foreground" : ""}>只看推荐位</Tag>
          </button>
          <button onClick={() => setHideDup((v) => !v)} className="cursor-pointer">
            <Tag cls={hideDup ? "text-background bg-foreground border-foreground" : ""}>隐藏重复副本</Tag>
          </button>
          <span className="ml-auto text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4">
            {filtered.length.toLocaleString("en-US")} / {rows.length.toLocaleString("en-US")}
            {!loadedMcp && rows.length > 0 ? " · MCP 加载中…" : ""}
          </span>
        </div>

        <div className="border-b border-solid border-b-border grid py-3 gap-4 text-muted-foreground text-sm font-medium leading-5 uppercase grid-cols-16 max-lg:hidden">
          <div className="block col-span-1 [font-family:'Geist_Mono',_'Geist_Mono_Fallback']">#</div>
          <div className="block col-span-9 [font-family:'Geist_Mono',_'Geist_Mono_Fallback']">资源</div>
          <div className="block col-span-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-right">策展</div>
          <div className="block col-span-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-right">★</div>
          <div className="block col-span-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-right">质量分</div>
        </div>

        <div className="block">
          {rows.length === 0 && (
            <div className="block py-16 text-center text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm">
              加载注册表…
            </div>
          )}
          {filtered.slice(0, shown).map((r, i) => {
            const type = meta.types[r[T]];
            const rk = meta.risk[`${r[REPO]} ${r[PATH]} ${r[N]}`];
            return (
              <div
                key={`${r[REPO]}/${r[PATH]}/${r[N]}/${i}`}
                className="border-b border-solid border-b-border grid py-3 gap-4 grid-cols-16 items-start cursor-pointer hover:bg-clr-1 max-lg:grid-cols-1"
                onClick={() => setOpen(r)}
              >
                <div className="block col-span-1 text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-6 max-lg:hidden">
                  {i + 1}
                </div>
                <div className="block col-span-9 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="block text-sm font-medium leading-6 [word-break:break-word]">{r[N]}</span>
                    <Tag>{type.zh}</Tag>
                    {meta.langs[r[L]] === "zh" && <Tag cls="text-[#f0883e] border-[#5c3a1a]">中文</Tag>}
                    {r[FL] & F_REC ? <Tag cls="text-[#3fb950] border-[#1d4429]">推荐</Tag> : null}
                    {r[FL] & F_FAMILY ? <Tag>模板批量 ×{r[FAM]}</Tag> : null}
                    {rk && rk.level !== "clean" && <Tag cls={RISK_CLS[rk.level]}>{rk.level}</Tag>}
                  </div>
                  <div className="block mt-1 text-muted-foreground text-sm leading-5 line-clamp-2">{r[D] || "（无描述）"}</div>
                  <div className="block mt-1 text-muted [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4 [word-break:break-all]">
                    {r[REPO]}
                    {r[PATH] ? ` · ${r[PATH]}` : ""}
                  </div>
                </div>
                <div className="block col-span-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-6 text-right text-muted-foreground max-lg:hidden">
                  {r[MEN] || "—"}
                </div>
                <div className="block col-span-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-6 text-right text-muted-foreground max-lg:hidden">
                  {compact(r[STAR])}
                </div>
                <div className="block col-span-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm font-medium leading-6 text-right max-lg:hidden">
                  {r[S]}
                </div>
              </div>
            );
          })}
          <div ref={sentinel} />
          {rows.length > 0 && filtered.length === 0 && (
            <div className="block py-16 text-center text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm">
              没有匹配的条目 — 试试放宽筛选
            </div>
          )}
          {shown < filtered.length && (
            <div className="block py-4 text-center text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs">
              已显示 {shown} / {filtered.length.toLocaleString("en-US")},继续滚动加载…
            </div>
          )}
        </div>
      </div>

      <Drawer row={open} meta={meta} onClose={() => setOpen(null)} />
    </>
  );
}
