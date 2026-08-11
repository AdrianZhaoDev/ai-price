import {
  getMessages,
  localeFromAcceptLanguage,
  localizedHref,
  localizedPath,
  resolvePreferredLocale,
  switchLocaleHref,
} from "@/lib/i18n";
import {
  landingPages,
  landingPageBySlug,
  landingCopy,
  landingPagePath,
  metadataForLandingPage,
} from "@/lib/landing-pages";
import { modelDetailPath, modelIdFromPath } from "@/lib/model-catalog/paths";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { formatCny, formatPeriod } from "@/lib/pricing/format";
import { metadataForMode } from "@/lib/seo";
import { describe, expect, it } from "vitest";

describe("locale resolution and localized paths", () => {
  it("uses the highest-quality supported browser language and falls back to Chinese", () => {
    expect(localeFromAcceptLanguage("fr-CA, en-US;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("ja-JP, zh-TW;q=0.8")).toBe("zh-CN");
    expect(localeFromAcceptLanguage("de-DE")).toBe("zh-CN");
    expect(localeFromAcceptLanguage(undefined)).toBe("zh-CN");
    expect(
      resolvePreferredLocale({ cookie: "invalid", acceptLanguage: "en-US" }),
    ).toBe("en");
    expect(
      resolvePreferredLocale({ cookie: "zh-CN", acceptLanguage: "en-US" }),
    ).toBe("zh-CN");
  });

  it("preserves the current page, model ID, query, and hash when switching", () => {
    expect(localizedPath("en", "/api-pricing")).toBe("/en/api-pricing");
    expect(localizedPath("zh-CN", "/en/api-pricing")).toBe("/api-pricing");
    expect(
      localizedHref("en", "/api-pricing?provider=openai&model=gpt-5#row"),
    ).toBe("/en/api-pricing?provider=openai&model=gpt-5#row");
    expect(
      switchLocaleHref("/en/models/openai/gpt-5", "?provider=openai"),
    ).toBe("/models/openai/gpt-5?provider=openai");
    expect(modelDetailPath("openai/gpt-5", "en")).toBe(
      "/en/models/openai/gpt-5",
    );
    expect(landingPagePath(landingPages[0]!, "en")).toBe("/en/chatgpt-price");
    expect(modelIdFromPath(["provider", "model%name"])).toBe(
      "provider/model%name",
    );
  });

  it("never redirects root static assets through the English locale prefix", () => {
    for (const path of [
      "/icon.svg",
      "/og.png",
      "/a73d0c70889247afad00e059e00716e8.txt",
    ]) {
      const response = middleware(
        new NextRequest(`https://lowpriceradar.com${path}`, {
          headers: { "accept-language": "en-US" },
        }),
      );
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
});

describe("localized SEO and formatting", () => {
  it("publishes bilingual alternates and localized metadata", () => {
    const metadata = metadataForMode("api", "en");
    expect(metadata.alternates?.canonical).toBe("/en/api-pricing");
    expect(metadata.alternates?.languages).toMatchObject({
      "zh-CN": "/api-pricing",
      en: "/en/api-pricing",
      "x-default": "/api-pricing",
    });
    expect(metadata.openGraph?.locale).toBe("en_US");
    expect(
      metadataForLandingPage(landingPages[0]!, true, "en").alternates
        ?.canonical,
    ).toBe("/en/chatgpt-price");
  });

  it("uses locale-aware dates, amounts, and billing periods without changing source names", () => {
    expect(formatPeriod("month", "zh-CN")).toBe("/月");
    expect(formatPeriod("month", "en")).toBe("/month");
    expect(formatCny(12.5, "en")).toContain("12.5");
    expect(getMessages("en").apiCatalog.columns.model).toBe("Model");
    expect(getMessages("zh-CN").apiCatalog.columns.model).toBe("模型");
  });

  it("uses page-specific English landing copy without inventing product types", () => {
    const deepseek = landingPageBySlug.get("deepseek-price")!;
    const comate = landingPageBySlug.get("comate-price")!;
    const kimi = landingPageBySlug.get("kimi-price")!;

    expect(landingCopy(deepseek, "en").description).toContain("API prices");
    expect(landingCopy(deepseek, "en").description).not.toContain(
      "subscription",
    );
    expect(landingCopy(comate, "en").description).toContain(
      "subscription plans",
    );
    expect(landingCopy(comate, "en").description).not.toContain("API prices");
    expect(landingCopy(kimi, "en").description).toContain(
      "subscription plans and API prices",
    );
    expect(landingPages.every((page) => landingCopy(page, "en").intro)).toBe(
      true,
    );
  });
});
