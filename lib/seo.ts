import type { Metadata } from "next";
import type { PriceMode } from "@/lib/pricing/types";
import { DEFAULT_LOCALE, localizedPath, type Locale } from "@/lib/i18n";

export const SITE_ORIGIN = "https://lowpriceradar.com";
export const SITE_NAME = "Low Price Radar";
export const SITE_POSITIONING = "AI订阅全球比价";

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
        "比较 ChatGPT、Claude、Gemini、Grok 在不同 App Store 地区的官方订阅价格、人民币换算和最低价，查看核验时间、地区价差与官方来源。",
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
      title: "国内 AI 会员订阅价格",
      description:
        "集中比较 Kimi、智谱清言、通义千问、MiniMax 等国内 AI 产品的官方会员、开发者套餐和 Token Plan 价格，查看月付、年付、套餐额度、更新时间与可核验的官方价格来源，帮助比较不同订阅周期的实际成本、额度差异、适用人群和购买决策。",
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
        "查看 AI 模型 API 价格排行榜，比较 models.dev 收录模型的实验室、上下文、最大输出、输入模态、最低输入与输出价格、提供商来源、发布日期和更新时间。",
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
      title:
        "Compare Global AI Subscription Prices: ChatGPT, Claude, Gemini, Grok | Low Price Radar",
      description:
        "Compare official ChatGPT, Claude, Gemini, and Grok subscription prices across App Store regions, with CNY references, regional spreads, verification times, and traceable sources.",
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
        "Compare official plans from Kimi, Zhipu, Qwen, MiniMax, and other China AI products, including billing periods, credits, update times, and traceable price sources.",
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
        "Browse the models.dev catalog and compare Lab, Context, maximum output, input modalities, lowest input and output prices, release dates, and update times.",
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

  return {
    title: { absolute: seo.title },
    description: seo.description,
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
      description: seo.description,
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
      description: seo.description,
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
  const keywords =
    input.keywords ??
    (isEnglish
      ? ["AI price methodology", "official AI price sources", "privacy"]
      : ["AI 价格方法", "官方价格来源", "隐私说明"]);

  return {
    title: input.title,
    description: input.description,
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
      description: input.description,
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
      description: input.description,
      images: [imageUrl],
    },
  };
}
