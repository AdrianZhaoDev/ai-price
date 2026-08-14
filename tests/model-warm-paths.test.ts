import { landingPagePath, landingPages } from "@/lib/landing-pages";
import { buildModelWarmPaths } from "@/lib/model-catalog/warm-paths";
import { describe, expect, it } from "vitest";

describe("model page warm paths", () => {
  it("warms canonical public pages, every localized landing page, and model details", () => {
    const paths = buildModelWarmPaths([
      { id: "google/gemini-2.5-flash" },
      { id: "deepseek/deepseek-v3.2" },
    ]);

    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/en",
        "/china-ai-subscriptions",
        "/en/china-ai-subscriptions",
        "/api-pricing",
        "/en/api-pricing",
        "/ai-model-release-watch",
        "/en/ai-model-release-watch",
        "/sitemap.xml",
        "/models/google/gemini-2.5-flash",
        "/en/models/google/gemini-2.5-flash",
      ]),
    );
    for (const page of landingPages) {
      expect(paths).toContain(landingPagePath(page, "zh-CN"));
      expect(paths).toContain(landingPagePath(page, "en"));
    }
    expect(new Set(paths).size).toBe(paths.length);
  });
});
