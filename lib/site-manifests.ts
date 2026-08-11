import type { MetadataRoute } from "next";

const shared: Pick<
  MetadataRoute.Manifest,
  "short_name" | "display" | "background_color" | "theme_color" | "icons"
> = {
  short_name: "Low Price Radar",
  display: "standalone",
  background_color: "#f6f5f2",
  theme_color: "#f6f5f2",
  icons: [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ],
};

export const chineseManifest: MetadataRoute.Manifest = {
  ...shared,
  name: "Low Price Radar · AI订阅全球比价",
  description:
    "ChatGPT、Claude、Gemini、Grok 与国内 AI 的官方订阅及 API 价格参考。",
  start_url: "/",
  lang: "zh-CN",
};

export const englishManifest: MetadataRoute.Manifest = {
  ...shared,
  name: "Low Price Radar · Global AI Price Comparison",
  description:
    "Compare official subscription and API prices for ChatGPT, Claude, Gemini, Grok, and popular AI products.",
  start_url: "/en",
  lang: "en",
};
