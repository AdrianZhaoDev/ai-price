import type { Metadata } from "next";
import { localizedPath, type Locale } from "@/lib/i18n";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const MODEL_RELEASE_WATCH_PATH = "/ai-model-release-watch";
export const MODEL_RELEASE_WATCH_UPDATED_AT = "2026-08-13T00:00:00.000Z";

type LocalizedText = Record<Locale, string>;

export type HotModelRelease = {
  key: "deepseek-v4-pro-0813" | "grok-4-6";
  name: string;
  modelId: string;
  labName: string;
  status: LocalizedText;
  summary: LocalizedText;
  context: string;
  priceSnapshot: LocalizedText;
  sourceLinks: Array<{
    label: LocalizedText;
    url: string;
  }>;
  internalPath: string;
};

export const hotModelReleases: readonly HotModelRelease[] = [
  {
    key: "deepseek-v4-pro-0813",
    name: "DeepSeek-V4-Pro-0813",
    modelId: "deepseek-v4-pro",
    labName: "DeepSeek",
    status: {
      "zh-CN":
        "版本核验：DeepSeek 官方 API 价格页当前显示 DeepSeek-V4-Pro-0813；官网同时提示 V4-Pro 暂未变动。",
      en: "Version check: DeepSeek's official API pricing page currently shows DeepSeek-V4-Pro-0813; its homepage also says V4-Pro has not otherwise changed.",
    },
    summary: {
      "zh-CN":
        "这是一个应当持续观察的官方版本标记，适合用价格页和模型目录核对实际可用的 provider、上下文和计费，不把版本标记直接当成独立发布公告。",
      en: "This is an official version label worth tracking. Use the pricing page and model catalog to verify live providers, context, and billing instead of treating the label alone as a separate launch announcement.",
    },
    context: "1M tokens",
    priceSnapshot: {
      "zh-CN":
        "每百万 tokens：缓存命中 $0.003625，输入 $0.435，输出 $0.87（官方价格页当前值）。",
      en: "Per 1M tokens: $0.003625 cached input, $0.435 input, and $0.87 output on the current official pricing page.",
    },
    sourceLinks: [
      {
        label: {
          "zh-CN": "DeepSeek API 价格页",
          en: "DeepSeek API pricing",
        },
        url: "https://api-docs.deepseek.com/quick_start/pricing/",
      },
      {
        label: {
          "zh-CN": "DeepSeek 官网提示",
          en: "DeepSeek homepage notice",
        },
        url: "https://www.deepseek.com/",
      },
    ],
    internalPath: "/deepseek-price",
  },
  {
    key: "grok-4-6",
    name: "Grok 4.6",
    modelId: "grok-4.6",
    labName: "xAI / SpaceXAI",
    status: {
      "zh-CN":
        "正式发布：xAI 官方公告确认 Grok 4.6 于 2026-08-12 发布，现已通过 API、Grok Build 和 Cursor 等入口提供。",
      en: "Official release: xAI announced Grok 4.6 on August 12, 2026, with access through the API, Grok Build, Cursor, and other partners.",
    },
    summary: {
      "zh-CN":
        "Grok 4.6 的官方定位集中在长流程 Agent、代码、知识工作以及交互和视觉任务，价格和上下文可直接按官方模型文档核对。",
      en: "Grok 4.6 is positioned for long-running agents, coding, knowledge work, and interactive or visual tasks; verify price and context directly against the official model docs.",
    },
    context: "500K tokens",
    priceSnapshot: {
      "zh-CN":
        "每百万 tokens：缓存输入 $0.50，输入 $2，输出 $6（官方模型文档当前值）。",
      en: "Per 1M tokens: $0.50 cached input, $2 input, and $6 output on the current official model docs.",
    },
    sourceLinks: [
      {
        label: {
          "zh-CN": "Grok 4.6 官方发布公告",
          en: "Official Grok 4.6 announcement",
        },
        url: "https://x.ai/news/grok-4-6",
      },
      {
        label: {
          "zh-CN": "Grok 4.6 API 文档",
          en: "Grok 4.6 API docs",
        },
        url: "https://docs.x.ai/developers/models/grok-4.6",
      },
    ],
    internalPath: "/grok-price",
  },
];

export function modelReleaseWatchPath(locale: Locale = "zh-CN"): string {
  return localizedPath(locale, MODEL_RELEASE_WATCH_PATH);
}

export function modelReleaseWatchMetadata(locale: Locale = "zh-CN"): Metadata {
  const isEnglish = locale === "en";
  const path = modelReleaseWatchPath(locale);
  const title = isEnglish
    ? "DeepSeek V4 Pro-0813 vs Grok 4.6 API Prices"
    : "DeepSeek V4 Pro-0813 与 Grok 4.6 API 价格对比";
  const description = isEnglish
    ? "Track DeepSeek V4 Pro-0813 and Grok 4.6 API prices, context windows, release status, and official sources, then compare current provider offers."
    : "跟踪 DeepSeek V4 Pro-0813 与 Grok 4.6 的官方 API 价格、上下文、发布状态和来源，区分版本更新与正式公告，并比较当前提供商报价。";
  const imageUrl = absoluteUrl("/og.png");

  return {
    title: { absolute: title },
    description,
    keywords: isEnglish
      ? [
          "DeepSeek V4 Pro-0813 price",
          "Grok 4.6 API price",
          "DeepSeek V4 Pro vs Grok 4.6",
          "AI model release tracker",
        ]
      : [
          "DeepSeek V4 Pro-0813 价格",
          "Grok 4.6 API 价格",
          "DeepSeek V4 Pro 与 Grok 4.6 对比",
          "AI 模型发布追踪",
        ],
    alternates: {
      canonical: path,
      languages: {
        "zh-CN": modelReleaseWatchPath("zh-CN"),
        en: modelReleaseWatchPath("en"),
        "x-default": modelReleaseWatchPath("zh-CN"),
      },
    },
    openGraph: {
      type: "article",
      locale: isEnglish ? "en_US" : "zh_CN",
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      publishedTime: MODEL_RELEASE_WATCH_UPDATED_AT,
      modifiedTime: MODEL_RELEASE_WATCH_UPDATED_AT,
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: title,
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

export function modelReleaseWatchCopy(locale: Locale = "zh-CN") {
  return locale === "en"
    ? {
        eyebrow: "AI MODEL RELEASE WATCH",
        heading:
          "DeepSeek V4 Pro-0813 and Grok 4.6: release and API price watch",
        lead: "Two major model updates landed close together. This page keeps the currently verifiable versions, prices, context windows, availability, and official sources together—and separates a version label from a confirmed launch.",
        lastChecked: "Last checked: August 13, 2026 (Asia/Shanghai)",
        back: "Back to AI model API prices",
        statusLabel: "Status",
        contextLabel: "Context",
        priceLabel: "Price snapshot",
        sourcesLabel: "Official sources",
        catalogLink: "Open the live API price catalog",
        brandLink: "Compare the provider price page",
        releaseSection: "Release notes",
        methodologyHeading: "How to read this update",
        methodology:
          "Release-day search demand moves faster than a price catalog. The entries above are timestamped editorial notes: official pages remain authoritative, while Low Price Radar is used to compare provider offers and surface later price changes.",
      }
    : {
        eyebrow: "AI 模型发布追踪",
        heading: "DeepSeek V4 Pro-0813 与 Grok 4.6：最新发布与 API 价格",
        lead: "两波模型更新几乎前后脚出现。本页把官方页面当前可核验的版本、价格、上下文、可用性和来源放在一起，并明确区分版本标记与正式发布公告。",
        lastChecked: "最后核验：2026-08-13（北京时间）",
        back: "返回 AI 模型 API 价格",
        statusLabel: "状态",
        contextLabel: "上下文",
        priceLabel: "价格快照",
        sourcesLabel: "官方来源",
        catalogLink: "打开实时 API 模型价格目录",
        brandLink: "查看提供商价格页",
        releaseSection: "发布核验",
        methodologyHeading: "如何阅读这次更新",
        methodology:
          "发布日的搜索需求往往先于价格目录变化。上面的内容是带时间戳的编辑记录：官方页面仍是最终依据，Low Price Radar 负责比较提供商报价并继续追踪后续价格变化。",
      };
}

export function hotModelReleaseFor(input: {
  id?: string;
  name?: string;
  labName?: string;
}): HotModelRelease | undefined {
  const normalized =
    `${input.id ?? ""} ${input.name ?? ""} ${input.labName ?? ""}`
      .toLowerCase()
      .replace(/[._-]+/g, " ");

  if (
    normalized.includes("deepseek") &&
    normalized.includes("v4") &&
    normalized.includes("pro")
  ) {
    return hotModelReleases[0];
  }

  if (normalized.includes("grok 4 6") || normalized.includes("grok46")) {
    return hotModelReleases[1];
  }

  return undefined;
}
