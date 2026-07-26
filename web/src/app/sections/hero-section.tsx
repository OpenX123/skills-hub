import { BRAND, TAGLINE, LEAD, TRY_CMD } from "../content";

export type HeroStats = {
  total: number;
  canonical: number;
  recommended: number;
  flagged: number;
  duplicates: number;
  nearDuplicates: number;
  templateFamilyEntries: number;
  generatedAt: string;
};

const num = (n: number) => (n ?? 0).toLocaleString("en-US");

/** 首屏。左侧字标与说明,下方为本项目真实底表指标。 */
export default function HeroSection({ stats }: { stats: HeroStats }) {
  const metrics = [
    { label: "条目", value: num(stats.total) },
    { label: "canonical", value: num(stats.canonical) },
    { label: "推荐位", value: num(stats.recommended) },
    { label: "风险标记", value: num(stats.flagged) },
  ];

  return (
    <div className="block overflow-hidden">
      <div className="grid my-7 gap-10 mx-auto grid-cols-[1fr_1fr] w-full max-w-6xl max-lg:gap-6 max-lg:my-5 max-lg:grid-cols-1">
        <div className="grid py-1 gap-4 grid-cols-1">
          <h1 className="block [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-5xl font-medium leading-[3.25rem] tracking-[-2px] max-md:text-4xl max-md:leading-10">
            {BRAND}
          </h1>
          <p className="block [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-[1.1875rem] font-medium leading-[1.8125rem] tracking-[-0.47px] text-left uppercase text-muted-foreground max-md:text-base max-md:leading-6">
            {TAGLINE}
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1">
          <p className="block text-muted-foreground text-xl leading-7 tracking-[-0.4px] text-left text-balance max-md:text-base max-md:leading-6">
            {LEAD}
          </p>

          <div>
            <h2
              className="block mb-3.5 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm font-medium leading-5 text-left uppercase w-full"
              data-component="heading"
            >
              命令行同款检索
            </h2>
            <div className="flex py-3 px-4 rounded-md items-center gap-2 [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-sm leading-5 bg-clr-1 w-full">
              <span className="block text-color-001">$</span>
              <code className="flex items-center overflow-hidden [font-family:var(--font-002)] whitespace-nowrap text-nowrap">
                {TRY_CMD}
                <span className="block ml-[7.7px] text-color-001">{"<关键词>"}</span>
              </code>
            </div>
          </div>
        </div>
      </div>

      <div className="border-y border-solid border-y-border grid py-5 gap-4 grid-cols-4 max-md:grid-cols-2 mx-auto w-full max-w-6xl">
        {metrics.map((m) => (
          <div className="block" key={m.label}>
            <div className="block [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-2xl font-medium leading-8 tracking-[-0.6px]">
              {m.value}
            </div>
            <div className="block mt-1 text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4 uppercase">
              {m.label}
            </div>
          </div>
        ))}
      </div>

      <p className="block py-3 text-muted-foreground [font-family:'Geist_Mono',_'Geist_Mono_Fallback'] text-xs leading-4 mx-auto w-full max-w-6xl">
        精确重复 {num(stats.duplicates)} · 跨仓搬运 {num(stats.nearDuplicates)} · 模板批量生成{" "}
        {num(stats.templateFamilyEntries)} · 更新于 {String(stats.generatedAt).replace("T", " ").slice(0, 16)} UTC
      </p>
    </div>
  );
}
