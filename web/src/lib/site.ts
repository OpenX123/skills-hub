export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "").replace(/\/$/, "");

/** 与 next.config.mjs 的 basePath 同源。fetch 静态数据时要手动带上,Next 只会自动处理路由和资源。 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
