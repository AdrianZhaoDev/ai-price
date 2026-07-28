import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 价签｜国内外 AI 官方价格参考",
  description:
    "查看 ChatGPT、Gemini、Claude、Grok 与国内热门 AI 的官方订阅和 API 价格，订阅价格变化通知。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="atelier" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
