import { expect, test, type Page } from "@playwright/test";
import { providerCatalog } from "../../lib/data/catalog";

async function openComparison(page: Page) {
  const provider = providerCatalog.find((item) => item.id === "claude")!;
  const base = provider.offers.find(
    (offer) => offer.billingPeriod === "month",
  )!;
  const offers = [
    {
      ...base,
      id: "comparison-us",
      regionCode: "US",
      currency: "USD",
      amountMinor: 2000,
      convertedCny: 140,
      displayPrice: "$20.00/月",
      status: "verified",
      lastCheckedAt: "2026-09-04T00:00:00Z",
      fxRateObservedAt: "2026-09-04T00:00:00Z",
    },
    {
      ...base,
      id: "comparison-jp",
      regionCode: "JP",
      regionName: "日本",
      currency: "JPY",
      amountMinor: 3000,
      convertedCny: 150,
      displayPrice: "¥3,000/月",
      status: "verified",
      lastCheckedAt: "2026-09-04T00:00:00Z",
      fxRateObservedAt: "2026-09-04T00:00:00Z",
    },
    {
      ...base,
      id: "comparison-ca",
      regionCode: "CA",
      regionName: "加拿大",
      currency: "CAD",
      amountMinor: 2500,
      convertedCny: 130,
      displayPrice: "$25.00/月",
      status: "stale",
      lastCheckedAt: "2026-08-29T00:00:00Z",
      fxRateObservedAt: "2026-08-29T00:00:00Z",
    },
  ];
  await page.route("**/pricing-data/claude?*", (route) =>
    route.fulfill({ json: { provider: { ...provider, offers } } }),
  );
  await page.goto("/");
  await expect(page.locator('.app-shell[data-hydrated="true"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Claude / Code", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "算一算，两地差多少" }),
  ).toBeVisible();
  return base.planId;
}

test("compares equal billing periods, shares region selection and distinguishes failed history", async ({
  page,
  context,
}) => {
  const planId = await openComparison(page);
  await page.getByLabel("地区 B", { exact: true }).selectOption("JP");
  await expect(page.locator(".comparison-result")).toContainText("¥120.00");
  await expect(page.locator(".comparison-result")).toContainText("非年付报价");
  await expect(
    page.getByRole("link", { name: "结果链接", exact: true }),
  ).toHaveAttribute(
    "href",
    `/?provider=claude&plan=${planId}#compare?from=US&to=JP`,
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "复制比较结果", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已复制" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "from=US&to=JP",
  );
  await page.getByLabel("地区 A", { exact: true }).selectOption("CA");
  await expect(page.locator("#compare")).toContainText("更新延迟");
  await expect(page.locator("#compare")).toContainText("汇率日期不同");
  let failHistory = true;
  await page.route("**/pricing-data/history/claude", (route) =>
    route.fulfill(
      failHistory
        ? { status: 503, body: "unavailable" }
        : { json: { available: true, limit: 100, events: [] } },
    ),
  );
  await page.getByRole("button", { name: "查看已确认的价格历史" }).click();
  await expect(page.locator(".subscription-history")).toContainText(
    "历史暂时不可用",
  );
  failHistory = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".subscription-history")).toContainText(
    "不代表价格从未变化",
  );
  await page.getByRole("button", { name: "关注本套餐变化" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("comparison controls fit narrow screens and price-change pages expose canonical data links", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Explicit widths covered once");
  await openComparison(page);
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    for (const label of ["地区 A", "地区 B"]) {
      const box = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    if (width === 375 || width === 1440)
      await page
        .locator("#compare")
        .screenshot({ path: `test-results/comparison-${width}.png` });
  }
  await page.goto("/price-changes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "AI 订阅价格变化",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lowpriceradar.com/price-changes",
  );
  await expect(
    page.getByRole("link", { name: "RSS", exact: true }),
  ).toHaveAttribute("href", "/pricing-data/changes/feed.xml");
  await page.goto("/en/price-changes");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lowpriceradar.com/en/price-changes",
  );
});
