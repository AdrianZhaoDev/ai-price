import { expect, test } from "@playwright/test";

const publicPages = [
  {
    path: "/",
    title: "AI 订阅价格对比",
    canonical: "https://lowpriceradar.com",
    sitemapUrl: "https://lowpriceradar.com/",
  },
  {
    path: "/china-ai-subscriptions",
    title: "国内 AI 会员订阅价格",
    canonical: "https://lowpriceradar.com/china-ai-subscriptions",
    sitemapUrl: "https://lowpriceradar.com/china-ai-subscriptions",
  },
  {
    path: "/api-pricing",
    title: "AI API 价格排行榜",
    canonical: "https://lowpriceradar.com/api-pricing",
    sitemapUrl: "https://lowpriceradar.com/api-pricing",
  },
] as const;

test("publishes distinct indexable pricing pages and structured data", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "SEO output is device-independent.");

  for (const entry of publicPages) {
    const response = await page.goto(entry.path);

    expect(response?.ok()).toBe(true);
    expect((await response?.body())?.byteLength).toBeLessThan(2_000_000);
    await expect(page).toHaveTitle(new RegExp(entry.title));
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.+/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      entry.canonical,
    );

    const structuredData = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    ).flatMap((value) => {
      const parsed = JSON.parse(value) as
        Record<string, unknown> | Record<string, unknown>[];
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    expect(structuredData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "@type": "Dataset" }),
        expect.objectContaining({ "@type": "ItemList" }),
      ]),
    );
  }
});

test("publishes complete metadata on trust and policy pages", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "SEO output is device-independent.");

  for (const path of ["/methodology", "/privacy"]) {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{70,}/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:description"]')).toHaveCount(
      1,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  }
});

test("publishes crawler controls without blocking the API pricing page", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "Crawler controls are device-independent.");

  const robotsResponse = await request.get("/robots.txt");
  const robots = await robotsResponse.text();
  expect(robotsResponse.ok()).toBe(true);
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /pricing-data/");
  expect(robots).not.toContain("Disallow: /api-pricing");

  const sitemapResponse = await request.get("/sitemap.xml");
  const sitemap = await sitemapResponse.text();
  expect(sitemapResponse.ok()).toBe(true);
  for (const entry of publicPages) {
    expect(sitemap).toContain(`<loc>${entry.sitemapUrl}</loc>`);
  }

  const socialCardResponse = await request.get("/og.png");
  expect(socialCardResponse.ok()).toBe(true);
  expect(socialCardResponse.headers()["content-type"]).toContain("image/png");

  const faviconResponse = await request.get("/favicon.ico", {
    maxRedirects: 0,
  });
  expect(faviconResponse.ok()).toBe(true);
  expect(faviconResponse.headers()["content-type"]).toContain("image/svg+xml");
});
