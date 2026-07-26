import { footerLinkData, BRAND } from "../content";

const COLUMNS: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: "浏览",
    items: footerLinkData,
  },
  {
    title: "资源类型",
    items: [
      { href: "#leaderboard", label: "Skill" },
      { href: "#leaderboard", label: "Subagent" },
      { href: "#leaderboard", label: "Command" },
      { href: "#leaderboard", label: "Rules" },
      { href: "#leaderboard", label: "Plugin" },
      { href: "#leaderboard", label: "MCP" },
    ],
  },
  {
    title: "可安装端",
    items: [
      { href: "#leaderboard", label: "Claude Code" },
      { href: "#leaderboard", label: "Codex" },
      { href: "#leaderboard", label: "Cursor" },
      { href: "#leaderboard", label: "通用 Agents" },
    ],
  },
  {
    title: "方法",
    items: [
      { href: "#audit", label: "文本层审计" },
      { href: "#stats", label: "三层去重" },
      { href: "#sources", label: "分层种子源" },
    ],
  },
];

/** 页脚。 */
export default function Footer() {
  return (
    <footer className="border-t border-solid border-t-border block mt-24 bg-background">
      <div className="block mx-auto py-12 px-8 max-w-6xl max-md:px-4 md:max-lg:px-6">
        <div className="grid gap-8 text-sm leading-5 grid-cols-4 max-md:grid-cols-2">
          {COLUMNS.map((col) => (
            <div className="block" key={col.title}>
              <h3 className="block mb-3 text-color-002 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4 uppercase" data-component="heading">
                {col.title}
              </h3>
              <ul className="block [list-style-type:none] list-outside">
                {col.items.map((d, i) => (
                  <li className="list-item" key={i}>
                    <a
                      className="inline text-muted cursor-pointer hover:text-foreground"
                      data-component="link"
                      href={d.href}
                    >
                      {d.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-solid border-t-border flex mt-12 pt-6 flex-wrap justify-between items-center gap-4 text-muted-foreground text-xs leading-4">
          <span className="block">
            {BRAND} — 数据由本仓库 <code>node src/cli.js sync</code> 抓取生成。
          </span>
          <span className="block">
            页面骨架由{" "}
            <a
              className="inline cursor-pointer hover:text-foreground"
              data-component="link"
              href="https://github.com/ion-design/ditto.site"
              rel="noopener noreferrer"
              target="_blank"
            >
              ditto.site
            </a>{" "}
            编译生成,内容与品牌为本项目自有。
          </span>
        </div>
      </div>
    </footer>
  );
}
