// 站点文案与导航数据。原抓取产物中的文案已全部替换为 skills-hub 自有内容。

export type NavLinkDataItem = {
  href: string;
  label: string;
};
export const navLinkData: NavLinkDataItem[] = [
  { href: "#leaderboard", label: "目录" },
  { href: "#audit", label: "审计" },
  { href: "#sources", label: "数据源" },
  { href: "#stats", label: "底表" },
];

export type TextLinkDataItem = {
  href: string;
  label: string;
};
export const footerLinkData: TextLinkDataItem[] = [
  { href: "#leaderboard", label: "目录" },
  { href: "#audit", label: "审计报告" },
  { href: "#sources", label: "数据源清单" },
  { href: "#stats", label: "底表" },
];

export const BRAND = "skills-hub";
export const TAGLINE = "跨端 AGENT 资源目录";
export const LEAD =
  "把散落各处的 skill / subagent / command / rules / plugin / MCP 抓下来,归一化、三层去重、双语分类、文本层安全审计,产出一份可直接安装的注册表。";
export const TRY_CMD = "node src/cli.js search";
