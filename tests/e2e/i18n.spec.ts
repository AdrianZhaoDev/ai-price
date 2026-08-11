import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

test("redirects an English browser to /en when there is no manual preference", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("button", { name: "Switch to Chinese" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Compare Global AI Subscription Prices/);
});

test("switches only the locale prefix and preserves filters and model query", async ({
  page,
}) => {
  await page.goto("/en/api-pricing?lab=google&model=gemini-2.5-flash");

  const switcher = page.getByRole("button", { name: "Switch to Chinese" });
  await expect(switcher).toBeVisible();
  await switcher.click();

  await expect(page).toHaveURL(
    /\/api-pricing\?lab=google&model=gemini-2\.5-flash$/,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("button", { name: "切换至英文" })).toBeVisible();
  await expect(page.context().cookies()).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "ai-price-locale", value: "zh-CN" }),
    ]),
  );
});

test("manual Chinese selection overrides a later English browser header", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole("button", { name: "Switch to Chinese" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("keeps a visible 44px language target and avoids mobile overflow", async ({
  page,
}) => {
  await page.goto("/en");
  const switcher = page.getByRole("button", { name: "Switch to Chinese" });
  await expect(switcher).toBeVisible();
  const box = await switcher.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("exposes the language switcher on every public page family", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/chatgpt-price",
    "/api-pricing",
    "/models/google/gemini-2.5-flash",
    "/methodology",
    "/privacy",
    "/subscription/result?status=confirmed",
  ]) {
    await page.goto(path);
    await expect(page.locator(".language-switcher")).toBeVisible();
  }
});

test("publishes English canonical, alternates, and structured language metadata", async ({
  page,
}) => {
  await page.goto("/en/api-pricing");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/en\/api-pricing$/,
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="zh-CN"]'),
  ).toHaveAttribute("href", /\/api-pricing$/);
  await expect(
    page.locator('link[rel="alternate"][hreflang="en"]'),
  ).toHaveAttribute("href", /\/en\/api-pricing$/);
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(jsonLd.some((value) => value.includes('"inLanguage":"en"'))).toBe(
    true,
  );
  expect(jsonLd.some((value) => value.includes("官方来源"))).toBe(false);
});

test("keeps public assets, document anchors, and privacy copy localized", async ({
  page,
  request,
}) => {
  for (const path of [
    "/icon.svg",
    "/og.png",
    "/a73d0c70889247afad00e059e00716e8.txt",
  ]) {
    const response = await request.get(path, {
      headers: { "Accept-Language": "en-US" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  }

  await page.goto("/en/methodology#data-corrections");
  await expect(page.locator("#data-corrections")).toBeVisible();

  await page.goto("/en/privacy");
  await expect(page.locator("footer")).toContainText(
    "Only alert-related subscription data is retained",
  );
  await expect(page.locator("footer")).not.toContainText(
    "community-aggregated prices",
  );
});

test("hides the model catalog background while the subscription dialog is open", async ({
  page,
}) => {
  await page.goto("/en/api-pricing");
  await page.getByRole("button", { name: "Subscribe to new models" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("header.site-header")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator("main#main-content")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator("footer")).toHaveAttribute("aria-hidden", "true");
});
