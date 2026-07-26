import fs from "node:fs";
import path from "node:path";
import Navbar from "./sections/navbar";
import HeroSection from "./sections/hero-section";
import Leaderboard from "./sections/leaderboard";
import Footer from "./sections/footer";

export const dynamic = "force-static";

function loadMeta() {
  const f = path.join(process.cwd(), "public", "data", "meta.json");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      stats: {
        total: 0, canonical: 0, recommended: 0, duplicates: 0, nearDuplicates: 0,
        templateFamilyEntries: 0, byType: {}, byTypeCanonical: {}, byCategory: {},
      },
      types: [], cats: [], langs: [], risks: [], targets: [], sources: [], risk: {},
    };
  }
}

const H2 = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <h2
    id={id}
    className="block pt-10 overflow-hidden [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm font-medium leading-5 uppercase scroll-mt-16"
    data-component="heading"
  >
    {children}
  </h2>
);

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th
    className={
      "border-b border-solid border-b-border py-2 px-2.5 text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs font-medium leading-4 uppercase " +
      (right ? "text-right" : "text-left")
    }
  >
    {children}
  </th>
);

const Td = ({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) => (
  <td
    className={
      "border-b border-solid border-b-border py-2 px-2.5 text-sm leading-5 align-top " +
      (right ? "text-right " : "") +
      (mono ? "[font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs " : "")
    }
  >
    {children}
  </td>
);

export default function Page() {
  const meta = loadMeta();
  const s = meta.stats;
  const flagged = Object.keys(meta.risk || {}).length;

  const auditRows = Object.entries(meta.risk || {})
    .map(([k, v]: [string, any]) => {
      const parts = k.split(" ");
      return { repo: parts[0], path: parts[1], name: parts.slice(2).join(" "), ...v };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 60);

  return (
    <>
      <Navbar />
      <div className="min-h-screen block mx-auto px-8 max-w-6xl max-md:px-4 md:max-lg:px-6">
        <HeroSection
          stats={{
            total: s.total,
            canonical: s.canonical,
            recommended: s.recommended,
            flagged,
            duplicates: s.duplicates,
            nearDuplicates: s.nearDuplicates,
            templateFamilyEntries: s.templateFamilyEntries,
            generatedAt: meta.generatedAt,
          }}
        />

        <main className="block py-8 max-md:py-6">
          <H2>资源目录</H2>
          <Leaderboard meta={meta} />

          <H2 id="audit">安全审计 · 文本层基线</H2>
          <p className="block py-2 text-muted-foreground text-sm leading-6">
            代码供应链扫描器为 npm/pypi 依赖设计,扫不出 SKILL.md 正文里的纯文本注入。这里用 14 条规则做静态文本匹配,
            筛出需人工复核的条目,不构成终审判决。共 {flagged.toLocaleString("en-US")} 条被标记 /{" "}
            {Number(s.total || 0).toLocaleString("en-US")} 条已扫描。
          </p>
          <div className="block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>等级</Th>
                  <Th right>分</Th>
                  <Th>名称</Th>
                  <Th>来源</Th>
                  <Th>发现</Th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((r: any, i: number) => (
                  <tr key={i}>
                    <Td mono>{r.level}</Td>
                    <Td right mono>{r.score}</Td>
                    <Td>{r.name}</Td>
                    <Td mono>
                      {r.repo}
                      <br />
                      <span className="text-muted">{r.path}</span>
                    </Td>
                    <Td mono>
                      {r.flags.slice(0, 3).map((f: any, j: number) => (
                        <span className="block" key={j}>
                          {f.t} <span className="text-muted">L{f.l}{f.f ? "·围栏" : ""}</span>
                        </span>
                      ))}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="sources">数据源</H2>
          <p className="block py-2 text-muted-foreground text-sm leading-6">
            按产出条目数排序。role=curated-index 的源不抽内容,只贡献「策展交叉命中」投票信号 —— 刷 star 容易,
            同时混进多个互不相关策展人的名单里很难。
          </p>
          <div className="block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>仓库</Th>
                  <Th>层</Th>
                  <Th>角色</Th>
                  <Th right>条目</Th>
                  <Th right>投票边</Th>
                  <Th right>★</Th>
                </tr>
              </thead>
              <tbody>
                {(meta.sources || []).map((r: any, i: number) => (
                  <tr key={i}>
                    <Td mono>{r.repo}</Td>
                    <Td mono>t{r.tier}</Td>
                    <Td mono>{r.role || ""}</Td>
                    <Td right mono>{Number(r.entries || 0).toLocaleString("en-US")}</Td>
                    <Td right mono>{Number(r.mentions || 0).toLocaleString("en-US")}</Td>
                    <Td right mono>{r.stars == null ? "—" : Number(r.stars).toLocaleString("en-US")}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="stats">底表</H2>
          <div className="grid py-2 gap-6 grid-cols-2 max-md:grid-cols-1">
            <div className="block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>类型</Th>
                    <Th right>总数</Th>
                    <Th right>canonical</Th>
                  </tr>
                </thead>
                <tbody>
                  {(meta.types || []).map((t: any) =>
                    s.byType?.[t.key] ? (
                      <tr key={t.key}>
                        <Td>
                          {t.zh} <span className="text-muted">{t.en}</span>
                        </Td>
                        <Td right mono>{Number(s.byType[t.key]).toLocaleString("en-US")}</Td>
                        <Td right mono>{Number(s.byTypeCanonical[t.key]).toLocaleString("en-US")}</Td>
                      </tr>
                    ) : null
                  )}
                </tbody>
              </table>
            </div>
            <div className="block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>分类</Th>
                    <Th right>条目</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.byCategory || {})
                    .filter(([, v]: any) => v)
                    .sort((a: any, b: any) => b[1] - a[1])
                    .map(([k, v]: any) => {
                      const c = (meta.cats || []).find((x: any) => x.key === k);
                      return (
                        <tr key={k}>
                          <Td>{c ? c.zh : k}</Td>
                          <Td right mono>{Number(v).toLocaleString("en-US")}</Td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
