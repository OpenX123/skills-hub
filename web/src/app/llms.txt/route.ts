export const dynamic = "force-static";

const TEXT = `# skills-hub · 跨端 Agent 资源目录

skill / subagent / command / rules / plugin / MCP 的聚合注册表。
数据由仓库内的抓取流水线生成:分层种子源 -> 归一化 -> 三层去重 -> 双语分类 -> 文本层安全审计。

## 方法

- 三层去重:精确内容哈希 / MinHash+LSH 跨仓搬运 / 同仓模板批量生成(单独标记,不判重)
- 质量分:策展交叉命中 40% + star 25% + 活跃度 20% + 完备度 15% - 风险惩罚 - 模板族惩罚
- 四道闸:security / schema / unique / alive,全过且分数 >= 40 进推荐位
- 安全审计:14 条规则的静态文本匹配基线,筛出需人工复核项,不构成终审判决

## 路由

- / — 资源目录、审计报告、数据源清单、底表

## 说明

页面骨架由 ditto.site 编译生成;站点内容、品牌与数据均为本项目自有,与任何第三方目录站无关联。
`;

export function GET() {
  return new Response(TEXT, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
