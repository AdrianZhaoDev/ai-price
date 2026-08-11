import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import type { PriceMode } from "@/lib/pricing/types";
import { DEFAULT_LOCALE, localizedPath, type Locale } from "@/lib/i18n";

export type LandingPageType = "global" | "domestic";

export type LandingPageDefinition = {
  slug: string;
  type: LandingPageType;
  name: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  aliases: string[];
  providerIds: Partial<Record<PriceMode, string[]>>;
  planIds?: string[];
  parentSlug?: string;
  contentUpdatedAt: string;
};

export const LANDING_CONTENT_UPDATED_AT = "2026-08-11T00:00:00.000Z";
const LANDING_TITLE_MAX_LENGTH = 60;
const LANDING_DESCRIPTION_MIN_LENGTH = 70;
const LANDING_DESCRIPTION_MAX_LENGTH = 155;

function truncateMetadata(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function landingMetadataDescription(value: string, locale: Locale): string {
  const expanded =
    value.length >= LANDING_DESCRIPTION_MIN_LENGTH
      ? value
      : `${value}${
          locale === "en"
            ? " Includes current plans or models, source links, and the latest verification time."
            : "同时展示当前可用套餐或模型、官方来源、价格口径、最近核验时间与数据说明。"
        }`;
  return truncateMetadata(expanded, LANDING_DESCRIPTION_MAX_LENGTH);
}

const globalProduct = (
  slug: string,
  name: string,
  aliases: string[],
  intro: string,
  providerId: string,
): LandingPageDefinition => ({
  slug,
  type: "global",
  name,
  title: `${name} 全球订阅价格对比：官方地区价格与最低价 | ${SITE_NAME}`,
  description: `比较 ${name} 在不同 App Store 地区的官方订阅价格、人民币参考价、地区价差和最近核验时间，查看可追溯的官方来源。`,
  heading: `${name} 全球订阅价格对比`,
  intro,
  aliases,
  providerIds: { global: [providerId] },
  contentUpdatedAt: LANDING_CONTENT_UPDATED_AT,
});

const globalPlan = (
  slug: string,
  name: string,
  aliases: string[],
  intro: string,
  providerId: string,
  planIds: string[],
  parentSlug: string,
): LandingPageDefinition => ({
  slug,
  type: "global",
  name,
  title: `${name} 全球价格对比：哪个地区更便宜 | ${SITE_NAME}`,
  description: `比较 ${name} 在不同 App Store 地区的官方原币价格、人民币参考价、月年周期和地区价差，查看最近核验时间与官方来源。`,
  heading: `${name} 全球价格对比`,
  intro,
  aliases,
  providerIds: { global: [providerId] },
  planIds,
  parentSlug,
  contentUpdatedAt: LANDING_CONTENT_UPDATED_AT,
});

const domesticBrand = (
  slug: string,
  name: string,
  aliases: string[],
  intro: string,
  providerIds: Partial<Record<PriceMode, string[]>>,
): LandingPageDefinition => {
  const hasSubscription = Boolean(providerIds["china-subscription"]?.length);
  const hasApi = Boolean(providerIds.api?.length);
  const focusTitle =
    hasSubscription && hasApi
      ? `${name} 订阅与 API 价格`
      : hasSubscription
        ? `${name} 订阅价格`
        : `${name} API 价格`;
  const description =
    hasSubscription && hasApi
      ? `查看 ${name} 官方订阅套餐与 API 模型价格，核对计费周期、输入输出单价、最近核验时间和可追溯来源，并进入完整价格比较工具。`
      : hasSubscription
        ? `查看 ${name} 官方订阅套餐价格、计费周期、额度说明、最近核验时间和可追溯来源，并进入国内 AI 订阅价格比较工具。`
        : `查看 ${name} 官方 API 模型的缓存输入、输入、输出及其他明确计费单位，核对最近核验时间与可追溯的官方来源。`;
  return {
    slug,
    type: "domestic",
    name,
    title: `${focusTitle}：官方套餐、模型与计费 | ${SITE_NAME}`,
    description,
    heading: focusTitle,
    intro,
    aliases,
    providerIds,
    contentUpdatedAt: LANDING_CONTENT_UPDATED_AT,
  };
};

export const landingPages: LandingPageDefinition[] = [
  globalProduct(
    "chatgpt-price",
    "ChatGPT",
    ["ChatGPT Plus", "ChatGPT Pro", "ChatGPT Go"],
    "查看 ChatGPT Plus、Pro 与 Go 在全球 App Store storefront 的官方订阅价格。",
    "chatgpt",
  ),
  globalProduct(
    "claude-price",
    "Claude",
    ["Claude Pro", "Claude Max"],
    "查看 Claude Pro 与 Max 在全球 App Store storefront 的官方订阅价格。",
    "claude",
  ),
  globalProduct(
    "gemini-price",
    "Gemini",
    ["Google AI Pro", "Google AI Ultra", "Google AI Plus"],
    "查看 Google AI Pro、Ultra 与 Plus 在全球 App Store storefront 的官方订阅价格。",
    "gemini",
  ),
  globalProduct(
    "grok-price",
    "Grok",
    ["SuperGrok", "SuperGrok Lite", "SuperGrok Heavy"],
    "查看 SuperGrok 系列在全球 App Store storefront 的官方订阅价格。",
    "grok",
  ),
  globalPlan(
    "chatgpt-plus-price",
    "ChatGPT Plus",
    ["ChatGPT Plus 月付"],
    "只看 ChatGPT Plus 月付套餐的全球 App Store 官方地区价格。",
    "chatgpt",
    ["chatgpt-plus-monthly"],
    "chatgpt-price",
  ),
  globalPlan(
    "chatgpt-go-price",
    "ChatGPT Go",
    ["ChatGPT Go 价格"],
    "只看 ChatGPT Go 的全球 App Store 官方订阅价格和地区差异。",
    "chatgpt",
    ["chatgpt-go-monthly"],
    "chatgpt-price",
  ),
  globalPlan(
    "chatgpt-pro-price",
    "ChatGPT Pro",
    ["ChatGPT Pro 5x", "ChatGPT Pro 20x"],
    "聚合 ChatGPT Pro、Pro 5x 与 Pro 20x 变体，比较不同地区的官方参考价格。",
    "chatgpt",
    [
      "chatgpt-pro-monthly",
      "chatgpt-pro-5x-monthly",
      "chatgpt-pro-20x-monthly",
    ],
    "chatgpt-price",
  ),
  globalPlan(
    "claude-pro-price",
    "Claude Pro",
    ["Claude Pro 月付", "Claude Pro 年付"],
    "只看 Claude Pro 月付和年付在不同 App Store 地区的官方价格。",
    "claude",
    ["claude-pro-monthly", "claude-pro-annual"],
    "claude-price",
  ),
  globalPlan(
    "claude-max-price",
    "Claude Max",
    ["Claude Max 5x", "Claude Max 20x"],
    "聚合 Claude Max 5x 与 Max 20x，比较各地区官方订阅价格和人民币参考价。",
    "claude",
    ["claude-max-monthly", "claude-max-5x-monthly", "claude-max-20x-monthly"],
    "claude-price",
  ),
  globalPlan(
    "gemini-pro-price",
    "Google AI Pro",
    ["Gemini Pro", "Google AI Pro 5 TB", "Google AI Pro 10 TB"],
    "聚合 Google AI Pro 不同容量与周期变体，查看 Gemini 相关全球官方订阅价格。",
    "gemini",
    [
      "google-ai-pro-monthly",
      "google-ai-pro-5tb-monthly",
      "google-ai-pro-5tb-annual",
      "google-ai-pro-10tb-monthly",
    ],
    "gemini-price",
  ),
  domesticBrand(
    "glm-price",
    "智谱 GLM",
    ["智谱", "GLM", "BigModel"],
    "合并智谱 GLM 资源包、Coding Plan 与 BigModel API 的官方价格。",
    {
      "china-subscription": ["glm-resource-package", "glm-coding-plan"],
      api: ["glm-api"],
    },
  ),
  domesticBrand(
    "kimi-price",
    "Kimi",
    ["Kimi 会员", "Moonshot API"],
    "同时查看 Kimi 会员和 Moonshot API 的官方套餐、模型与计费信息。",
    { "china-subscription": ["kimi-membership"], api: ["kimi-api"] },
  ),
  domesticBrand(
    "stepfun-price",
    "阶跃星辰",
    ["StepFun", "阶跃星辰会员", "Step API"],
    "同时查看阶跃星辰订阅套餐和 Step Plan API 官方价格。",
    {
      "china-subscription": ["stepfun-subscription"],
      api: ["stepfun-api"],
    },
  ),
  domesticBrand(
    "minimax-price",
    "MiniMax",
    ["MiniMax 会员", "MiniMax API"],
    "同时查看 MiniMax Token Plan 订阅和文本、语音、视频 API 官方价格。",
    {
      "china-subscription": ["minimax-token-plan"],
      api: ["minimax-api"],
    },
  ),
  domesticBrand(
    "qwen-price",
    "通义千问",
    ["阿里云百炼", "Qwen", "通义千问 API"],
    "同时查看通义千问 Token Plan 和阿里云百炼模型 API 官方价格。",
    { "china-subscription": ["qwen-token-plan"], api: ["qwen-api"] },
  ),
  domesticBrand(
    "baidu-qianfan-price",
    "百度千帆",
    ["文心一言", "ERNIE", "百度 AI"],
    "合并百度千帆 Token 福利与文心模型 API 的官方价格和可核验状态。",
    {
      "china-subscription": ["baidu-token-package"],
      api: ["ernie-api"],
    },
  ),
  domesticBrand(
    "spark-price",
    "讯飞星火",
    ["Spark", "讯飞星火会员", "星火 API"],
    "同时查看讯飞星火 Token Plan 和模型 API 的官方计费信息。",
    { "china-subscription": ["spark-token-plan"], api: ["spark-api"] },
  ),
  domesticBrand(
    "mimo-price",
    "Xiaomi MiMo",
    ["小米 MiMo", "MiMo API"],
    "同时查看 Xiaomi MiMo Token Plan 和 MiMo API 的官方价格。",
    { "china-subscription": ["mimo-token-plan"], api: ["mimo-api"] },
  ),
  domesticBrand(
    "huawei-maas-price",
    "华为云 MaaS",
    ["华为盘古", "MaaS API"],
    "同时查看华为云 MaaS Token Plan 和 MaaS API 的官方价格。",
    { "china-subscription": ["huawei-token-plan"], api: ["huawei-maas-api"] },
  ),
  domesticBrand(
    "comate-price",
    "百度文心快码 Comate",
    ["Comate", "文心快码"],
    "查看百度文心快码 Comate 的官方订阅套餐和计费周期。",
    { "china-subscription": ["comate-subscription"] },
  ),
  domesticBrand(
    "qoder-price",
    "阿里 Qoder CN",
    ["Qoder", "阿里 Qoder"],
    "查看阿里 Qoder CN 的官方开发者订阅套餐和额度说明。",
    { "china-subscription": ["qoder-subscription"] },
  ),
  domesticBrand(
    "trae-price",
    "TRAE",
    ["TRAE AI 编程", "TRAE Pro"],
    "查看 TRAE 官方会员套餐、周期和公开价格。",
    { "china-subscription": ["trae-subscription"] },
  ),
  domesticBrand(
    "codebuddy-price",
    "腾讯 CodeBuddy",
    ["WorkBuddy", "CodeBuddy 价格"],
    "查看腾讯 CodeBuddy / WorkBuddy 官方订阅套餐和连续包月价格。",
    { "china-subscription": ["codebuddy-subscription"] },
  ),
  domesticBrand(
    "sensenova-price",
    "商汤 SenseNova",
    ["商汤日日新", "SenseNova"],
    "查看商汤 SenseNova Token Plan 的官方公开状态和价格信息。",
    { "china-subscription": ["sensenova-token-plan"] },
  ),
  domesticBrand(
    "deepseek-price",
    "DeepSeek",
    ["DeepSeek API", "DeepSeek V4"],
    "查看 DeepSeek 模型的官方 API 输入、缓存输入和输出价格。",
    { api: ["deepseek-api"] },
  ),
  domesticBrand(
    "doubao-price",
    "豆包 / 火山方舟",
    ["豆包 API", "火山方舟"],
    "查看豆包和火山方舟模型、图像、视频与语音服务的官方计费信息。",
    { api: ["doubao-api"] },
  ),
  domesticBrand(
    "hunyuan-price",
    "腾讯混元",
    ["Hunyuan", "混元 API"],
    "查看腾讯混元模型 API 的官方输入、输出和缓存价格。",
    { api: ["hunyuan-api"] },
  ),
  domesticBrand(
    "baichuan-price",
    "百川智能",
    ["Baichuan", "百川 API"],
    "查看百川智能模型 API 的官方输入和输出价格。",
    { api: ["baichuan-api"] },
  ),
  domesticBrand(
    "longcat-price",
    "美团 LongCat",
    ["LongCat", "LongCat API"],
    "查看美团 LongCat 官方模型 API 和限时折扣价格。",
    { api: ["longcat-api"] },
  ),
  domesticBrand(
    "siliconflow-price",
    "硅基流动 SiliconFlow",
    ["SiliconFlow", "硅基流动 API"],
    "查看硅基流动模型 API 的官方输入、缓存和输出价格。",
    { api: ["siliconflow-api"] },
  ),
  domesticBrand(
    "teleai-price",
    "中国电信 TeleAI",
    ["TeleAI", "TeleMM"],
    "查看中国电信 TeleAI 的公开模型和 QPS 产品价格。",
    { api: ["teleai-api"] },
  ),
];

export const landingPageBySlug = new Map(
  landingPages.map((page) => [page.slug, page]),
);

export type LandingPageCopy = Pick<
  LandingPageDefinition,
  "title" | "description" | "heading" | "intro"
>;

const englishLandingIntros: Record<string, string> = {
  "chatgpt-price":
    "See official App Store subscription prices for ChatGPT Plus, Pro, and Go worldwide.",
  "claude-price":
    "See official App Store subscription prices for Claude Pro and Max worldwide.",
  "gemini-price":
    "See official App Store subscription prices for Google AI Pro, Ultra, and Plus worldwide.",
  "grok-price":
    "See official App Store subscription prices for the SuperGrok plan family worldwide.",
  "chatgpt-plus-price":
    "Compare the official monthly ChatGPT Plus price across global App Store regions.",
  "chatgpt-go-price":
    "Compare official ChatGPT Go subscription prices and regional differences across global App Store regions.",
  "chatgpt-pro-price":
    "Compare official regional prices for ChatGPT Pro, Pro 5x, and Pro 20x variants.",
  "claude-pro-price":
    "Compare official monthly and annual Claude Pro prices across App Store regions.",
  "claude-max-price":
    "Compare official regional subscription prices for Claude Max 5x and Max 20x.",
  "gemini-pro-price":
    "Compare official Google AI Pro prices across storage and billing-period variants.",
  "glm-price":
    "Compare official Zhipu GLM resource packs, Coding Plan subscriptions, and BigModel API prices.",
  "kimi-price":
    "Compare official Kimi membership plans with Moonshot API models and billing units.",
  "stepfun-price":
    "Compare official StepFun subscriptions with Step Plan API prices.",
  "minimax-price":
    "Compare the official MiniMax Token Plan with text, speech, and video API prices.",
  "qwen-price":
    "Compare the official Qwen Token Plan with model API prices from Alibaba Cloud Model Studio.",
  "baidu-qianfan-price":
    "Compare Baidu Qianfan token benefits with official ERNIE model API prices and verification status.",
  "spark-price":
    "Compare the official Spark Token Plan with model API billing information.",
  "mimo-price":
    "Compare the official Xiaomi MiMo Token Plan with MiMo API prices.",
  "huawei-maas-price":
    "Compare the official Huawei Cloud MaaS Token Plan with MaaS API prices.",
  "comate-price":
    "Review official Baidu Comate subscription plans and billing periods.",
  "qoder-price":
    "Review official Alibaba Qoder CN developer subscriptions and included quotas.",
  "trae-price":
    "Review official TRAE membership plans, billing periods, and published prices.",
  "codebuddy-price":
    "Review official Tencent CodeBuddy and WorkBuddy subscription plans and recurring monthly prices.",
  "sensenova-price":
    "Review the published status and official price information for the SenseNova Token Plan.",
  "deepseek-price":
    "Review official DeepSeek API prices for input, cached input, and output tokens.",
  "doubao-price":
    "Review official billing for Doubao and Volcano Ark models, image, video, and speech services.",
  "hunyuan-price":
    "Review official Tencent Hunyuan API prices for input, output, and cached tokens.",
  "baichuan-price":
    "Review official Baichuan model API prices for input and output tokens.",
  "longcat-price":
    "Review official LongCat model API prices and time-limited discounts from Meituan.",
  "siliconflow-price":
    "Review official SiliconFlow API prices for model input, cached input, and output.",
  "teleai-price":
    "Review published TeleAI model and QPS product prices from China Telecom.",
};

/**
 * Editorial copy is localized at the page boundary. Product names, aliases,
 * provider names, plans, and imported descriptions remain source data.
 */
export function landingCopy(
  page: LandingPageDefinition,
  locale: Locale = DEFAULT_LOCALE,
): LandingPageCopy {
  if (locale !== "en") {
    return {
      title: page.title,
      description: page.description,
      heading: page.heading,
      intro: page.intro,
    };
  }

  if (page.type === "global") {
    const isPlan = Boolean(page.parentSlug);
    return {
      title: isPlan
        ? `${page.name} Global Price Comparison | ${SITE_NAME}`
        : `${page.name} Global Subscription Prices | ${SITE_NAME}`,
      description: `Compare official ${page.name} App Store prices by region, with original amounts, CNY references, billing periods, regional spreads, and source links.`,
      heading: isPlan
        ? `${page.name} global price comparison`
        : `${page.name} global subscription price comparison`,
      intro: englishLandingIntros[page.slug]!,
    };
  }

  const hasSubscription = Boolean(
    page.providerIds["china-subscription"]?.length,
  );
  const hasApi = Boolean(page.providerIds.api?.length);
  const focus =
    hasSubscription && hasApi
      ? `${page.name} subscription and API prices`
      : hasSubscription
        ? `${page.name} subscription prices`
        : `${page.name} API prices`;
  return {
    title: `${focus} | ${SITE_NAME}`,
    description:
      hasSubscription && hasApi
        ? `Compare official ${page.name} subscription plans and API prices, including billing periods, units, verification times, and traceable sources.`
        : hasSubscription
          ? `Compare official ${page.name} subscription plans, including billing periods, included quotas, verification times, and traceable sources.`
          : `Compare official ${page.name} API prices, including billing units, verification times, and traceable sources.`,
    heading: focus,
    intro: englishLandingIntros[page.slug]!,
  };
}

export function landingPagePath(
  page: LandingPageDefinition,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return localizedPath(locale, `/${page.slug}`);
}

export function metadataForLandingPage(
  page: LandingPageDefinition,
  indexable = true,
  locale: Locale = DEFAULT_LOCALE,
): Metadata {
  const path = landingPagePath(page, locale);
  const imageUrl = absoluteUrl("/og.png");
  const isEnglish = locale === "en";
  const copy = landingCopy(page, locale);
  const title = truncateMetadata(copy.title, LANDING_TITLE_MAX_LENGTH);
  const description = landingMetadataDescription(copy.description, locale);
  return {
    title: { absolute: title },
    description,
    keywords: isEnglish
      ? [page.name, ...page.aliases, "AI price", "official price"]
      : [page.name, ...page.aliases, "价格", "官方价格"],
    alternates: {
      canonical: path,
      languages: {
        "zh-CN": landingPagePath(page, "zh-CN"),
        en: landingPagePath(page, "en"),
        "x-default": landingPagePath(page, "zh-CN"),
      },
    },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: "article",
      locale: isEnglish ? "en_US" : "zh_CN",
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: imageUrl, width: 1731, height: 909, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function childLandingPages(
  page: LandingPageDefinition,
): LandingPageDefinition[] {
  return landingPages.filter((candidate) => candidate.parentSlug === page.slug);
}

export function relatedLandingPages(
  page: LandingPageDefinition,
): LandingPageDefinition[] {
  if (page.parentSlug) {
    return landingPages.filter(
      (candidate) =>
        candidate.slug === page.parentSlug ||
        (candidate.parentSlug === page.parentSlug &&
          candidate.slug !== page.slug),
    );
  }
  const children = childLandingPages(page);
  if (children.length > 0) return children;
  return [];
}

export function landingPagesForMode(mode: PriceMode): LandingPageDefinition[] {
  if (mode === "global") {
    return landingPages.filter(
      (page) => page.type === "global" && !page.parentSlug,
    );
  }
  return landingPages.filter((page) => page.providerIds[mode]?.length);
}

export function providersForLandingPage(
  page: LandingPageDefinition,
): Array<{ mode: PriceMode; id: string }> {
  return (
    Object.entries(page.providerIds) as Array<[PriceMode, string[]]>
  ).flatMap(([mode, ids]) => ids.map((id) => ({ mode, id })));
}
