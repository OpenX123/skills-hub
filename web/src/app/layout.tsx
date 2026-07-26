import "./globals.css";
import "./ditto.css";
import type { ReactNode } from "react";
import { SITE_ORIGIN } from "../lib/site";

const TITLE = "skills-hub · 跨端 Agent 资源目录";
const DESC =
  "skill / subagent / command / rules / plugin / MCP 的聚合注册表,带三层去重、双语分类与文本层安全审计。";

export const metadata = {
  metadataBase: new URL(SITE_ORIGIN || "http://localhost:3000"),
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESC, type: "website", siteName: "skills-hub", url: "/" },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>%F0%9F%A7%A9</text></svg>",
        type: "image/svg+xml",
      },
    ],
  },
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="block text-foreground [font-family:Geist,_'Geist_Fallback'] text-base font-normal not-italic leading-6 tracking-[normal] [word-spacing:0px] text-start normal-case whitespace-normal [word-break:normal] [overflow-wrap:normal] indent-0 list-outside [writing-mode:horizontal-tb] [direction:ltr] bg-background">
        {children}
      </body>
    </html>
  );
}
