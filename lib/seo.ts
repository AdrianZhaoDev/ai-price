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
    title: "AI 订阅全球价格对比",
    description:
      "比较 ChatGPT、Claude、Gemini 与 Grok 的 App Store 官方订阅价格、地区差价和人民币参考价。",
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
      "集中比较国内 AI 产品官方会员、开发者套餐和 Token Plan 的月付、年付与套餐价格。",
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
      "比较各平台官方 AI API 价格，按缓存输入、非缓存输入和输出成本查看每百万 Tokens 报价。",
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
