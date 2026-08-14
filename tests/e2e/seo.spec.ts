import { expect, test } from "@playwright/test";

const publicPages = [
  {
    path: "/",
    title: "AI订阅全球价格对比",
    canonical: "https://lowpriceradar.com",
    sitemapUrl: "https://lowpriceradar.com",
  },
  {
    path: "/china-ai-subscriptions",
    title: "国内 AI 订阅价格对比",
    canonical: "https://lowpriceradar.com/china-ai-subscriptions",
    sitemapUrl: "https://lowpriceradar.com/china-ai-subscriptions",
  },
  {
    path: "/api-pricing",
    title: "AI 模型 API 价格与规格排行榜",
    canonical: "https://lowpriceradar.com/api-pricing",
    sitemapUrl: "https://lowpriceradar.com/api-pricing",
  },
] as const;

const landingPaths = [
  "/chatgpt-price",
  "/claude-price",
  "/gemini-price",
  "/grok-price",
  "/chatgpt-plus-price",
  "/chatgpt-go-price",
  "/chatgpt-pro-price",
  "/claude-pro-price",
  "/claude-max-price",
  "/gemini-pro-price",
  "/glm-price",
  "/kimi-price",
  "/stepfun-price",
  "/minimax-price",
  "/qwen-price",
  "/baidu-qianfan-price",
  "/spark-price",
  "/mimo-price",
  "/huawei-maas-price",
  "/comate-price",
  "/qoder-price",
  "/trae-price",
  "/codebuddy-price",
  "/sensenova-price",
  "/deepseek-price",
  "/doubao-price",
  "/hunyuan-price",
  "/baichuan-price",
  "/longcat-price",
  "/siliconflow-price",
  "/teleai-price",
] as const;

const crawlablePaths = [
  ...publicPages.map((entry) => entry.path),
  ...landingPaths,
  "/ai-model-release-watch",
  "/methodology",
  "/privacy",
] as const;

function internalPath(href: string): string | undefined {
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return undefined;
  }
  const url = new URL(href, "http://127.0.0.1");
  return url.origin === "http://127.0.0.1"
    ? `${url.pathname}${url.search}`
    : undefined;
}

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
    if (entry.path === "/api-pricing") {
      await expect(page.locator(".model-catalog-table")).toBeVisible();
      await expect(page.locator('a[href="/deepseek-price"]')).toBeVisible();
    } else {
      await expect(page.locator(".price-index")).toBeVisible();
      await expect(
        page.locator(".price-index-links a").first(),
      ).toHaveAttribute("href", /.+-price|china-ai-subscriptions|api-pricing/);
      if (entry.path === "/") {
        await expect(
          page.locator('.price-index-links a[href="/gemini-pro-price"]'),
        ).toBeVisible();
      }
    }
  }
});

test("publishes the bilingual hot model release watch page", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "SEO output is device-independent.");

  const response = await page.goto("/ai-model-release-watch");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(
    /DeepSeek V4 Pro-0813 与 Grok 4\.6 API 价格对比/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /.{100,}/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lowpriceradar.com/ai-model-release-watch",
  );
  await expect(
    page.getByRole("heading", { name: /DeepSeek V4 Pro-0813/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "DeepSeek-V4-Pro-0813",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Grok 4.6").first()).toBeVisible();
  await expect(page.locator('a[href="/api-pricing?q=grok-4.6"]')).toBeVisible();
  await expect(
    page.locator('a[href="/api-pricing?q=grok-4.6"]'),
  ).toHaveAttribute("rel", "nofollow");
  await expect(page.locator('a[href="/deepseek-price"]')).not.toHaveAttribute(
    "rel",
    "nofollow",
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
      expect.objectContaining({ "@type": "Article" }),
      expect.objectContaining({ "@type": "BreadcrumbList" }),
    ]),
  );

  await page.goto("/api-pricing");
  const releaseWatchLink = page.locator(
    '.model-release-watch-link[href="/ai-model-release-watch"]',
  );
  await expect(releaseWatchLink).toBeVisible();
  await releaseWatchLink.click();
  await expect(page).toHaveURL(/\/ai-model-release-watch$/);
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

test("publishes the complete provider landing page matrix", async ({
  page,
  request,
  isMobile,
}) => {
  test.setTimeout(120_000);
  test.skip(isMobile, "SEO output is device-independent.");
  const sitemap = await (await request.get("/sitemap.xml")).text();

  for (const path of landingPaths) {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    expect((await response?.body())?.byteLength).toBeLessThan(2_000_000);
    await expect(page).toHaveTitle(/Low Price Radar/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{50,}/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://lowpriceradar.com${path}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "先看这组数据说明了什么" }),
    ).toBeVisible();
    await expect(
      page.locator(".landing-summary-copy > p").last(),
    ).toContainText(/收录|覆盖|报价|模型|数据/);
    await expect(page.locator(".landing-cta-link").first()).toBeVisible();
    const robots =
      (await page
        .locator('meta[name="robots"]')
        .first()
        .getAttribute("content")) ?? "";
    expect(
      sitemap.includes(`<loc>https://lowpriceradar.com${path}</loc>`),
    ).toBe(!robots.includes("noindex"));
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
        expect.objectContaining({ "@type": "BreadcrumbList" }),
      ]),
    );
  }
});

test("landing pages fit common phone widths and expose crawlable links", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Explicit phone widths are covered once.");

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of [
      "/chatgpt-price",
      "/chatgpt-plus-price",
      "/glm-price",
      "/deepseek-price",
    ]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await expect(page.locator(".landing-cta-link").first()).toBeVisible();
      expect(
        await page
          .locator(".landing-cta-link")
          .first()
          .evaluate((link) => link.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(48);
      expect(
        await page
          .locator(".landing-related a")
          .evaluateAll((links) =>
            links.every((link) => Boolean(link.getAttribute("href"))),
          ),
      ).toBe(true);
    }
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
  expect(sitemap).toContain("<loc>https://lowpriceradar.com/models/");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  );
  expect(new Set(sitemapUrls).size).toBe(sitemapUrls.length);

  const socialCardResponse = await request.get("/og.png");
  expect(socialCardResponse.ok()).toBe(true);
  expect(socialCardResponse.headers()["content-type"]).toContain("image/png");

  const faviconResponse = await request.get("/favicon.ico", {
    maxRedirects: 0,
  });
  expect(faviconResponse.ok()).toBe(true);
  expect(faviconResponse.headers()["content-type"]).toContain("image/svg+xml");
});

test("model pages publish canonical metadata, breadcrumbs, 404s, and filtered noindex", async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(isMobile, "SEO output is device-independent.");
  await page.goto("/models/google/gemini-2.5-flash");
  await expect(page).toHaveTitle(
    /Gemini 2.5 Flash · google\/gemini-2\.5-flash API 价格/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lowpriceradar.com/models/google/gemini-2.5-flash",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /.{100,}/,
  );
  await expect(
    page.locator('.model-provider-table a[href*="?provider="]').first(),
  ).toHaveAttribute("rel", "nofollow");
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(
    page.locator('meta[property="article:modified_time"]'),
  ).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  const detailStructuredData = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  ).flatMap((value) => {
    const parsed = JSON.parse(value) as
      Record<string, unknown> | Record<string, unknown>[];
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  expect(detailStructuredData).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ "@type": "BreadcrumbList" }),
    ]),
  );
  const dataset = detailStructuredData.find(
    (entry) => entry["@type"] === "Dataset",
  );
  expect(dataset).toMatchObject({
    isPartOf: "https://lowpriceradar.com/api-pricing",
  });
  expect(String(dataset?.description).length).toBeGreaterThanOrEqual(50);
  expect(String(dataset?.description).length).toBeLessThanOrEqual(155);

  const missing = await request.get("/models/unknown/does-not-exist");
  expect(missing.status()).toBe(404);
  await page.goto("/api-pricing?lab=google");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex,\s*follow/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lowpriceradar.com/api-pricing",
  );
  await page.goto("/api-pricing?hideZero=0");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex,\s*follow/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lowpriceradar.com/api-pricing",
  );
});

test("all public pages expose valid internal link targets", async ({
  page,
  request,
  isMobile,
}) => {
  test.setTimeout(180_000);
  test.skip(isMobile, "The link graph is device-independent.");
  const targets = new Set<string>();

  for (const path of crawlablePaths) {
    const response = await page.goto(path);
    expect(response?.ok(), `page ${path} should load`).toBe(true);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
    for (const href of hrefs) {
      expect(href, `${path} contains an empty link`).not.toBe("");
      expect(href, `${path} contains a JavaScript link`).not.toMatch(
        /^javascript:/i,
      );
      const target = internalPath(href);
      if (target) targets.add(target);
    }
  }

  for (const target of targets) {
    const response = await request.get(target);
    expect(
      response.status(),
      `internal link target ${target} should return a non-error response`,
    ).toBeLessThan(400);
  }
});

test("repeated navigation components perform real browser navigation", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  test.skip(isMobile, "Desktop covers the shared link components.");

  await page.goto("/");
  const priceIndexLink = page.locator(".price-index-links a").first();
  const priceIndexTarget = await priceIndexLink.getAttribute("href");
  expect(priceIndexTarget).toBeTruthy();
  let releaseNavigation: (() => void) | undefined;
  const navigationGate = new Promise<void>((resolve) => {
    releaseNavigation = resolve;
  });
  await page.route(`**${priceIndexTarget}`, async (route) => {
    await navigationGate;
    await route.continue();
  });
  const documentRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === priceIndexTarget &&
      request.resourceType() === "document",
  );
  await priceIndexLink.evaluate((element) =>
    (element as HTMLAnchorElement).click(),
  );
  await expect(priceIndexLink).toHaveAttribute("aria-busy", "true");
  await expect(priceIndexLink).toContainText("正在打开价格页面");
  expect((await documentRequest).resourceType()).toBe("document");
  releaseNavigation?.();
  await expect(page).toHaveURL(new RegExp(`${priceIndexTarget}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator(".price-index-links a").first(),
  ).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".price-index-links a").first()).not.toContainText(
    "正在打开价格页面",
  );

  await page.goto("/chatgpt-plus-price");
  const relatedLink = page.locator(".landing-related-links a").first();
  const relatedTarget = await relatedLink.getAttribute("href");
  expect(relatedTarget).toBeTruthy();
  await relatedLink.click();
  await expect(page).toHaveURL(new RegExp(`${relatedTarget}$`));

  await page.goto("/deepseek-price");
  const ctaLink = page.locator(".landing-cta-link").first();
  const ctaTarget = await ctaLink.getAttribute("href");
  expect(ctaTarget).toBeTruthy();
  await expect(ctaLink).toHaveAttribute("rel", "nofollow");
  await ctaLink.click();
  await expect(page).toHaveURL(new RegExp(ctaTarget!.replace("?", "\\?")));
  await expect(page.getByLabel("提供商")).toHaveValue("deepseek");

  await page.goto("/methodology");
  await page.locator(".document-back").click();
  await expect(page).toHaveURL(/\/$/);

  await page.locator('.footer-links a[href="/privacy"]').click();
  await expect(page).toHaveURL(/\/privacy$/);
});
