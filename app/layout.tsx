import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { StructuredData } from "@/components/structured-data";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/lib/i18n";
import {
  absoluteUrl,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_POSITIONING,
} from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: {
    default:
      "AI订阅全球价格对比：ChatGPT、Claude、Gemini、Grok | Low Price Radar",
    template: "%s | Low Price Radar",
  },
  description:
    "查看 ChatGPT、Gemini、Claude、Grok 与国内热门 AI 的官方订阅和 API 价格，比较地区价差、模型成本并订阅价格变化通知。",
  category: "technology",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestLocale = (await headers()).get("x-ai-price-locale");
  const locale: Locale = requestLocale === "en" ? "en" : DEFAULT_LOCALE;
  const messages = getMessages(locale);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: SITE_NAME,
      alternateName: [
        locale === "en" ? messages.brand.tagline : SITE_POSITIONING,
        "lowpriceradar.com",
      ],
      url: SITE_ORIGIN,
      logo: absoluteUrl("/icon.svg"),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      alternateName: [
        locale === "en" ? messages.brand.tagline : SITE_POSITIONING,
        "lowpriceradar.com",
      ],
      url: SITE_ORIGIN,
      inLanguage: locale === "en" ? "en" : "zh-CN",
      publisher: {
        "@id": `${SITE_ORIGIN}/#organization`,
      },
    },
  ];

  return (
    <html
      lang={locale === "en" ? "en" : "zh-CN"}
      data-theme="atelier"
      suppressHydrationWarning
    >
      <body>
        <StructuredData data={structuredData} />
        {children}
      </body>
    </html>
  );
}
