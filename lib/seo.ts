import type { Metadata } from "next";
import type { PriceMode } from "@/lib/pricing/types";
import { DEFAULT_LOCALE, localizedPath, type Locale } from "@/lib/i18n";

export const SITE_ORIGIN = "https://lowpriceradar.com";
export const SITE_NAME = "Low Price Radar";
export const SITE_POSITIONING = "AI订阅全球比价";
export const SEO_DESCRIPTION_MIN_LENGTH = 100;
export const SEO_DESCRIPTION_MAX_LENGTH = 155;

export function normalizeSeoDescription(
  value: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const additions =
    locale === "en"
      ? [
          " It includes official sources, recent verification details, pricing scope, and comparison context.",
          " Changes should be checked against the latest official source page.",
          " Use the cited records to confirm current availability and limitations.",
        ]
      : [
          "同时展示官方来源、最近核验时间、价格口径、适用范围和继续复核所需的数据说明。",
          "相关信息发生变化时，应以来源页面最新公开内容为准。",
          "读者可以据此理解页面边界，并核对对应的官方记录。",
        ];
  let expanded = value.trim();
  for (const addition of additions) {
    if (expanded.length >= SEO_DESCRIPTION_MIN_LENGTH) break;
    expanded += addition;
  }
  if (expanded.length < SEO_DESCRIPTION_MIN_LENGTH) {
    expanded +=
      locale === "en"
        ? " See official sources for updates."
        : "请继续查看官方来源的最新更新。";
  }
  if (expanded.length <= SEO_DESCRIPTION_MAX_LENGTH) return expanded;
  return `${expanded.slice(0, SEO_DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`;
}

type ModeSeo = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
};

export const modeSeoByLocale: Record<Locale, Record<PriceMode, ModeSeo>> = {
  "zh-CN": {
    global: {
      path: "/",
      title:
        "AI订阅全球价格对比：ChatGPT、Claude、Gemini、Grok | Low Price Radar",
      description:
        "比较 ChatGPT、Claude、Gemini、Grok 在全球 App Store 地区的官方订阅价格、人民币换算、最低价与地区价差，并查看套餐周期、价格核验时间和可追溯官方来源，帮助选择更合适的订阅地区和方案。",
      keywords: [
        "AI 订阅价格",
        "ChatGPT 价格",
        "Claude 价格",
        "Gemini 价格",
        "Grok 价格",
        "App Store 区价",
      ],
    },
    "china-subscription": {
      path: "/china-ai-subscriptions",
      title:
        "国内 AI 订阅价格对比：Kimi、智谱、通义、MiniMax | Low Price Radar",
      description:
        "比较 Kimi、智谱清言、通义千问、MiniMax 等国内 AI 产品的官方会员、开发者套餐与 Token Plan 价格，查看月付、年付、套餐额度、更新时间、适用人群及可核验的官方来源，帮助判断不同订阅周期和资源包的实际成本。",
      keywords: [
        "国内 AI 会员价格",
        "AI 订阅价格",
        "Token Plan",
        "Kimi 会员",
        "MiniMax 价格",
      ],
    },
    api: {
      path: "/api-pricing",
      title: "AI 模型 API 价格与规格排行榜",
      description:
        "比较 models.dev 收录的 AI 模型 API 价格与规格，查看实验室、上下文、最大输出、输入模态、各提供商最低非零输入和输出价格、发布日期、更新时间及来源说明，快速评估不同模型与渠道的调用成本。",
      keywords: [
        "AI API 价格",
        "大模型 API 价格",
        "Token 价格",
        "DeepSeek API 价格",
        "模型调用成本",
      ],
    },
  },
  en: {
    global: {
      path: "/en",
      title: "Global AI Subscription Prices | Low Price Radar",
      description:
        "Compare ChatGPT, Claude, Gemini, and Grok prices across App Store regions, with CNY references, regional spreads, verification times, and source links.",
      keywords: [
        "AI subscription prices",
        "ChatGPT price",
        "Claude price",
        "Gemini price",
        "Grok price",
        "App Store price comparison",
      ],
    },
    "china-subscription": {
      path: "/en/china-ai-subscriptions",
      title: "China AI Subscription Prices | Low Price Radar",
      description:
        "Compare Kimi, Zhipu, Qwen, MiniMax, and other China AI subscriptions, including billing periods, quotas, update times, and traceable official price sources.",
      keywords: [
        "China AI subscription prices",
        "AI plan comparison",
        "Token Plan prices",
        "Kimi membership",
        "MiniMax price",
      ],
    },
    api: {
      path: "/en/api-pricing",
      title: "AI Model API Prices and Specifications | Low Price Radar",
      description:
        "Compare AI model API prices and specifications from models.dev, including context, output limits, modalities, providers, release dates, and update times.",
      keywords: [
        "AI API prices",
        "LLM API price comparison",
        "Token prices",
        "DeepSeek API price",
        "model inference cost",
      ],
    },
  },
};

export const modeSeo = modeSeoByLocale[DEFAULT_LOCALE];

function alternateLanguagePaths(path: string): Record<string, string> {
  const basePath = path.replace(/^\/en(?=\/|$)/, "") || "/";
  return {
    "zh-CN": localizedPath("zh-CN", basePath),
    en: localizedPath("en", basePath),
    "x-default": localizedPath("zh-CN", basePath),
  };
}

export function modeHref(
  mode: PriceMode,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return modeSeoByLocale[locale][mode].path;
}

export function absoluteUrl(path = "/"): string {
  if (path === "/") return SITE_ORIGIN;
  return new URL(path, SITE_ORIGIN).toString();
}

export function metadataForMode(
  mode: PriceMode,
  locale: Locale = DEFAULT_LOCALE,
): Metadata {
  const seo = modeSeoByLocale[locale][mode];
  const imageUrl = absoluteUrl("/og.png");
  const isEnglish = locale === "en";
  const description = normalizeSeoDescription(seo.description, locale);

  return {
    title: { absolute: seo.title },
    description,
    keywords: seo.keywords,
    alternates: {
      canonical: seo.path === "/" ? SITE_ORIGIN : seo.path,
      languages: alternateLanguagePaths(seo.path),
    },
    openGraph: {
      type: "website",
      locale: isEnglish ? "en_US" : "zh_CN",
      url: seo.path,
      siteName: SITE_NAME,
      title: seo.title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: isEnglish
            ? "Low Price Radar official AI price references"
            : "Low Price Radar AI 订阅官方价格参考",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description,
      images: [imageUrl],
    },
  };
}

export function metadataForDocument(input: {
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  locale?: Locale;
}): Metadata {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const path = localizedPath(locale, input.path);
  const imageUrl = absoluteUrl("/og.png");
  const isEnglish = locale === "en";
  const title = `${input.title} | ${SITE_NAME}`;
  const description = normalizeSeoDescription(input.description, locale);
  const keywords =
    input.keywords ??
    (isEnglish
      ? ["AI price methodology", "official AI price sources", "privacy"]
      : ["AI 价格方法", "官方价格来源", "隐私说明"]);

  return {
    title: input.title,
    description,
    keywords,
    alternates: {
      canonical: path,
      languages: alternateLanguagePaths(path),
    },
    openGraph: {
      type: "article",
      locale: isEnglish ? "en_US" : "zh_CN",
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: isEnglish
            ? "Low Price Radar official AI price references"
            : "Low Price Radar AI 订阅官方价格参考",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
