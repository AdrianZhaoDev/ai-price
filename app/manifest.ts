import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Low Price Radar · AI订阅全球比价",
    short_name: "Low Price Radar",
    description:
      "ChatGPT、Claude、Gemini、Grok 与国内 AI 的官方订阅及 API 价格参考。",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
