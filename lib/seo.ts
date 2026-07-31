import type { Metadata } from "next";
import type { PriceMode } from "@/lib/pricing/types";

export const SITE_ORIGIN = "https://lowpriceradar.com";
export const SITE_NAME = "Low Price Radar · AI 价签";

type ModeSeo = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
};

export const modeSeo: Record<PriceMode, ModeSeo> = {
  global: {
    path: "/",
    title: "AI 订阅价格对比：ChatGPT、Claude、Gemini、Grok 全球区价",
    description:
      "比较 ChatGPT、Claude、Gemini 与 Grok 等热门 AI 产品的 App Store 官方订阅价格、不同国家与地区的价差、月付与年付方案及人民币参考价，数据定时采集并保留官方来源链接。",
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
    title: "AI API 价格排行榜",
    description:
      "比较 DeepSeek、豆包、通义千问、Kimi 等平台的官方 AI API 价格，按缓存输入、非缓存输入和输出成本查看每百万 Tokens 报价、模型差异、更新时间及官方计费来源，用于估算模型调用预算、比较输入输出成本并选择更合适的服务平台。",
    keywords: [
      "AI API 价格",
      "大模型 API 价格",
      "Token 价格",
      "DeepSeek API 价格",
      "模型调用成本",
    ],
  },
};

export function modeHref(mode: PriceMode): string {
  return modeSeo[mode].path;
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_ORIGIN).toString();
}

export function metadataForMode(mode: PriceMode): Metadata {
  const seo = modeSeo[mode];
  const imageUrl = absoluteUrl("/og.png");

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: {
      canonical: seo.path,
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: seo.path,
      siteName: SITE_NAME,
      title: `${seo.title}｜${SITE_NAME}`,
      description: seo.description,
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: "Low Price Radar · AI 价签官方价格参考",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${seo.title}｜${SITE_NAME}`,
      description: seo.description,
      images: [imageUrl],
    },
  };
}

export function metadataForDocument(input: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  const imageUrl = absoluteUrl("/og.png");

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: input.path,
    },
    openGraph: {
      type: "article",
      locale: "zh_CN",
      url: input.path,
      siteName: SITE_NAME,
      title: `${input.title}｜${SITE_NAME}`,
      description: input.description,
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: "Low Price Radar · AI 价签官方价格参考",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${input.title}｜${SITE_NAME}`,
      description: input.description,
      images: [imageUrl],
    },
  };
}
