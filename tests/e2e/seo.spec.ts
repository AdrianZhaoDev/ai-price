import { expect, test } from "@playwright/test";

const publicPages = [
  {
    path: "/",
    title: "AI 订阅全球价格对比",
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
});
