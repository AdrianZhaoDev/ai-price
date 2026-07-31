import { expect, test } from "@playwright/test";

async function waitForPricingHydration(page: import("@playwright/test").Page) {
  await expect(page.locator('.app-shell[data-hydrated="true"]')).toBeVisible();
}

test("switches modes, providers and theme", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop navigation is covered separately.");
  await page.goto("/");
  await waitForPricingHydration(page);
  await expect(page.locator("h1.sr-only")).toHaveText(
    "同一份订阅，不同的地区价格",
  );
  await expect(page.locator(".workspace-heading")).toHaveCount(0);
  await expect(page.locator(".section-meta .freshness-block")).toBeVisible();
  await expect(page.locator(".official-source-count")).toContainText(
    "个官方来源",
  );
  expect(
    await page
      .locator(".provider-rail-global .provider-button")
      .allTextContents(),
  ).toEqual(["ChatGPT", "Claude / Code", "Gemini", "Grok"]);
  await page.getByRole("link", { name: "国内订阅", exact: true }).click();
  await expect(page).toHaveURL(/\/china-ai-subscriptions$/);
  await expect(page.locator("h1.sr-only")).toHaveText(
    "国内 AI 会员，直接看官方价",
  );
  await expect(
    page.getByRole("heading", { name: "智谱 GLM 资源包" }),
  ).toBeVisible();
  await expect(
    page.locator(".provider-rail .provider-button").first(),
  ).toContainText("智谱资源包");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "MiniMax" }).click();
  await expect(page.getByRole("heading", { name: "MiniMax" })).toBeVisible();

  await page.getByRole("button", { name: "切换深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
});

test("pricing navigation uses one clear active state and marks API as hot", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop navigation is covered separately.");
  await page.goto("/");
  await waitForPricingHydration(page);
  const navigation = page.getByRole("navigation", { name: "价格模式" });
  const links = navigation.locator(".nav-item");
  const hotBadge = navigation.locator(".nav-hot-badge");

  await expect(links).toHaveCount(3);
  await expect(hotBadge).toHaveCount(1);
  await expect(hotBadge).toBeVisible();
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.locator('[data-mode="api"]')).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );

  const readNavStyles = () =>
    navigation.locator(".nav-item").evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          active: item.getAttribute("aria-current") === "page",
        };
      }),
    );

  const atelierStyles = await readNavStyles();
  const atelierActive = atelierStyles.find((item) => item.active);
  expect(atelierActive).toMatchObject({
    backgroundColor: "rgb(0, 102, 204)",
    color: "rgb(255, 255, 255)",
  });
  expect(
    atelierStyles
      .filter((item) => !item.active)
      .map((item) => item.backgroundColor),
  ).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);

  await page.getByRole("button", { name: "切换深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  const midnightStyles = await readNavStyles();
  const midnightActive = midnightStyles.find((item) => item.active);
  expect(midnightActive).toMatchObject({
    backgroundColor: "rgb(0, 102, 204)",
    color: "rgb(255, 255, 255)",
  });

  await navigation
    .getByRole("link", { name: "API 价格排行榜", exact: true })
    .click();
  await expect(page).toHaveURL(/\/api-pricing$/);
  await expect(navigation.locator('[data-mode="api"]')).toHaveCSS(
    "background-color",
    "rgb(0, 102, 204)",
  );
  await expect(navigation.locator(".nav-hot-badge")).toBeVisible();
});

test("opens the price alert sheet", async ({ page }) => {
  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await page.getByRole("button", { name: "关闭价格订阅" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("submits a real subscription payload without an autofill honeypot", async ({
  page,
}) => {
  let requestPayload: Record<string, unknown> | undefined;
  await page.route("**/api/subscriptions", async (route) => {
    requestPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "subscribed",
        message: "您已订阅成功！",
      }),
    });
  });

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("reader@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();

  await expect(
    page.getByRole("heading", { name: "您已订阅成功！" }),
  ).toBeVisible();
  await expect(page.getByText("无需点击确认")).toBeVisible();
  expect(requestPayload).toMatchObject({
    email: "reader@example.com",
    providerId: "chatgpt",
  });
  expect(requestPayload).not.toHaveProperty("website");
});

test("shows an already-subscribed notice for an identical subscription", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/subscriptions", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "subscribed",
        message: "您已订阅成功！",
      }),
    });
  });

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("reader@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();
  await expect(
    page.getByRole("heading", { name: "您已订阅成功！" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "完成" }).click();

  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("reader@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();

  await expect(
    page.getByRole("heading", { name: "您已订阅，请勿重复订阅。" }),
  ).toBeVisible();
  await expect(page.getByText("无需再次提交")).toBeVisible();
  expect(requestCount).toBe(1);
});

test("shows ranked RMB prices without duplicate or status-only plans", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop price table assertions.");
  await page.goto("/");
  await waitForPricingHydration(page);

  await expect(
    page.locator(".plan-button").filter({ hasText: "ChatGPT Plus" }),
  ).toHaveCount(1);
  const planMinimums = (
    await page.locator(".plan-button .plan-minimum").allTextContents()
  ).map((value) => Number(value.replace(/[^\d.]/g, "")));
  expect(planMinimums.length).toBeGreaterThanOrEqual(3);
  expect(planMinimums).toEqual([...planMinimums].sort((a, b) => a - b));
  await expect(page.locator(".plan-button").first()).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByText("App Store 上架状态")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "状态" })).toHaveCount(0);

  const ascending = (
    await page.locator(".converted-price strong").allTextContents()
  ).map((value) => Number(value.replace(/[^\d.]/g, "")));
  expect(ascending.every((value) => Number.isFinite(value))).toBe(true);
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
  const rankedPrices = page.locator(".converted-price[data-rank]");
  const rankedPriceCount = await rankedPrices.count();
  expect(rankedPriceCount).toBeLessThanOrEqual(Math.min(3, ascending.length));
  if (rankedPriceCount > 0) {
    await expect(
      page.locator('.converted-price[data-rank="1"] strong'),
    ).toHaveCSS("color", "rgb(0, 214, 111)");
  }

  await page
    .getByRole("button", {
      name: "当前低价优先，点击改为高价优先",
    })
    .click();
  const descending = (
    await page.locator(".converted-price strong").allTextContents()
  ).map((value) => Number(value.replace(/[^\d.]/g, "")));
  expect(descending).toEqual([...descending].sort((a, b) => b - a));

  await page.getByRole("link", { name: "API 价格排行榜", exact: true }).click();
  await expect(page).toHaveURL(/\/api-pricing$/);
  await expect(
    page.getByRole("heading", { name: "API 价格排行榜", exact: true }),
  ).toBeVisible();
  await waitForPricingHydration(page);
  const deepSeekButton = page.getByRole("button", {
    name: "DeepSeek",
    exact: true,
  });
  await expect(deepSeekButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".status-chip")).toHaveCount(0);

  const apiRows = page.locator(".price-list > .price-row");
  if ((await apiRows.count()) > 0) {
    await expect(
      apiRows.first().locator(".official-price strong"),
    ).toContainText(/\d/);
    await expect(apiRows.first().locator(".converted-price")).not.toBeEmpty();
  } else {
    await expect(page.locator(".price-summary")).toContainText("0 个价格项目");
  }

  const siliconFlowButton = page.getByRole("button", {
    name: "硅基流动",
    exact: true,
  });
  await siliconFlowButton.click();
  const collapsedApiRowCount = await page
    .locator(".price-list > .price-row")
    .count();
  expect(collapsedApiRowCount).toBeGreaterThan(0);
  expect(collapsedApiRowCount).toBeLessThanOrEqual(10);
  const showAllButton = page.locator(
    '.load-more-prices[aria-expanded="false"]',
  );
  if ((await showAllButton.count()) === 1) {
    await showAllButton.click();
    expect(
      await page.locator(".price-list > .price-row").count(),
    ).toBeGreaterThan(collapsedApiRowCount);
  }

  const firstRankingEntry = page
    .locator(".api-ranking-desktop .api-ranking-entry")
    .first();
  const targetProviderId =
    await firstRankingEntry.getAttribute("data-provider-id");
  const targetOfferId = await firstRankingEntry.getAttribute("data-offer-id");
  expect(targetProviderId).toBeTruthy();
  expect(targetOfferId).toBeTruthy();
  await firstRankingEntry.click();
  await expect(
    page.locator(`.provider-button[data-provider-id="${targetProviderId}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  const targetRow = page.locator(
    `.price-row[data-offer-id="${targetOfferId}"]`,
  );
  await expect(targetRow).toHaveAttribute("data-highlighted", "true");
  await expect(targetRow).toBeInViewport();
});

test("mobile navigation and sheet remain usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile-only navigation.");
  await page.goto("/");
  await waitForPricingHydration(page);
  await expect(page.locator(".mobile-global-details").first()).toBeVisible();
  const modeNavigation = page.getByRole("navigation", { name: "价格模式" });
  await expect(
    modeNavigation.getByRole("link", { name: "全球区价", exact: true }),
  ).toBeVisible();
  await expect(
    modeNavigation.getByRole("link", { name: "国内订阅", exact: true }),
  ).toBeVisible();
  await expect(
    modeNavigation.getByRole("link", {
      name: "API 价格排行榜",
      exact: true,
    }),
  ).toBeVisible();
  await modeNavigation
    .getByRole("link", { name: "API 价格排行榜", exact: true })
    .click();
  await expect(page).toHaveURL(/\/api-pricing$/);
  await expect(page.locator("h1.sr-only")).toHaveText(
    "模型调用成本，按官方单位列清楚",
  );
  await waitForPricingHydration(page);
  const firstRankingEntry = page
    .locator(".api-ranking-mobile .api-ranking-entry")
    .first();
  await expect(firstRankingEntry).toBeVisible();
  const rankingPosition = await page
    .locator(".api-ranking-mobile")
    .evaluate((ranking) => ranking.getBoundingClientRect().top);
  const providerPosition = await page
    .locator(".provider-section")
    .evaluate((provider) => provider.getBoundingClientRect().top);
  expect(rankingPosition).toBeLessThan(providerPosition);
  expect(
    await firstRankingEntry.evaluate(
      (entry) => entry.scrollWidth <= entry.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "关注价格" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate(
        (dialog) => dialog.getBoundingClientRect().right <= window.innerWidth,
      ),
  ).toBe(true);
});

test("all pricing tabs fit common phone widths and use soft navigation", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Explicit phone widths are covered once.");

  const paths = ["/", "/china-ai-subscriptions", "/api-pricing"] as const;
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of paths) {
      await page.goto(path);
      await waitForPricingHydration(page);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect(
        await page.locator(".price-row").evaluateAll((rows) =>
          rows.every((row) => {
            const bounds = row.getBoundingClientRect();
            return (
              row.scrollWidth <= row.clientWidth &&
              bounds.left >= -0.5 &&
              bounds.right <= window.innerWidth + 0.5
            );
          }),
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".api-ranking-mobile .api-ranking-entry:visible")
          .evaluateAll((entries) =>
            entries.every((entry) => {
              const bounds = entry.getBoundingClientRect();
              return (
                entry.scrollWidth <= entry.clientWidth &&
                bounds.left >= -0.5 &&
                bounds.right <= window.innerWidth + 0.5
              );
            }),
          ),
      ).toBe(true);
      expect(
        await page.locator(".desktop-nav").evaluate((navigation) => {
          const items = [...navigation.querySelectorAll(".nav-item")];
          return (
            navigation.scrollWidth <= navigation.clientWidth &&
            items.length === 3 &&
            items.every((item) => {
              const style = getComputedStyle(item);
              return (
                item.scrollWidth <= item.clientWidth &&
                item.getBoundingClientRect().height >= 48 &&
                Number.parseFloat(style.fontSize) >= 12
              );
            })
          );
        }),
      ).toBe(true);
      expect(
        await page.locator(".desktop-nav .nav-item").evaluateAll((items) =>
          items.map((item) =>
            [...item.childNodes]
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent ?? "")
              .join("")
              .trim(),
          ),
        ),
      ).toEqual(["全球区价", "国内订阅", "API 价格排行榜"]);
    }
  }

  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto("/");
  await page.evaluate(() => {
    Object.assign(window, { __pricingNavigationMarker: "retained" });
  });
  await page
    .getByRole("navigation", { name: "价格模式" })
    .getByRole("link", { name: "国内订阅", exact: true })
    .click();
  await expect(page).toHaveURL(/\/china-ai-subscriptions$/);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __pricingNavigationMarker?: string })
          .__pricingNavigationMarker,
    ),
  ).toBe("retained");

  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
