import { expect, test } from "@playwright/test";

async function waitForPricingHydration(page: import("@playwright/test").Page) {
  await expect(page.locator('.app-shell[data-hydrated="true"]')).toBeVisible();
}

type CapturedTrafficEvent = {
  event: string;
  properties?: Record<string, string>;
};

async function captureTrafficEvents(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __trafficEvents?: CapturedTrafficEvent[];
    };
    target.__trafficEvents = [];
    window.zaraz = {
      track: (event, properties) => {
        target.__trafficEvents?.push({ event, properties });
      },
    };
  });
}

async function readTrafficEvents(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = window as typeof window & {
      __trafficEvents?: CapturedTrafficEvent[];
    };
    return target.__trafficEvents ?? [];
  });
}

test("switches modes, providers and theme", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop navigation is covered separately.");
  await page.goto("/");
  await waitForPricingHydration(page);
  await expect(page.locator("h1.sr-only")).toHaveText("AI订阅全球价格对比");
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

test("deduplicates repeated deferred-provider loads", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Request behavior is device-independent.");
  let requestCount = 0;
  await page.route("**/pricing-data/minimax-token-plan?*", async (route) => {
    requestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });

  await page.goto("/china-ai-subscriptions");
  await waitForPricingHydration(page);
  const provider = page.locator(
    '.provider-button[data-provider-id="minimax-token-plan"]',
  );
  await provider.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect(page.getByRole("heading", { name: "MiniMax" })).toBeVisible();
  expect(requestCount).toBe(1);
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

test("tracks an anonymous pricing-to-subscription conversion", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Event payloads are device-independent.");
  await captureTrafficEvents(page);
  await page.route("**/api/subscriptions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "private@example.com",
        message: "您已订阅成功！",
      }),
    }),
  );

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.locator('.provider-button[data-provider-id="chatgpt"]').click();
  await page
    .getByRole("button", { name: "当前低价优先，点击改为高价优先" })
    .click();
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("private@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();
  await expect(
    page.getByRole("heading", { name: "您已订阅成功！" }),
  ).toBeVisible();

  const events = await readTrafficEvents(page);
  expect(events.map((entry) => entry.event)).toEqual([
    "pricing_provider_selected",
    "pricing_sort_changed",
    "subscription_sheet_opened",
    "subscription_submit_succeeded",
  ]);
  expect(events.at(-1)?.properties).toMatchObject({
    mode: "global",
    provider_id: "chatgpt",
    subscription_type: "price",
    plan_scope: "plan",
    result: "subscribed",
  });
  expect(JSON.stringify(events)).not.toContain("private@example.com");
});

test("tracks subscription failures without the email or error text", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Event payloads are device-independent.");
  await captureTrafficEvents(page);
  await page.route("**/api/subscriptions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "private backend diagnostic" }),
    }),
  );

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("private@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();
  await expect(page.locator("#subscription-error")).toBeVisible();

  const events = await readTrafficEvents(page);
  expect(events.at(-1)).toEqual({
    event: "subscription_submit_failed",
    properties: {
      mode: "global",
      provider_id: "chatgpt",
      subscription_type: "price",
      plan_scope: "plan",
      failure_kind: "http",
    },
  });
  expect(JSON.stringify(events)).not.toContain("private@example.com");
  expect(JSON.stringify(events)).not.toContain("private backend diagnostic");
});

test("shows the remaining cooldown measured from the previous accepted click", async ({
  page,
}) => {
  await page.route("**/api/subscriptions", async (route) => {
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "251" },
      contentType: "application/json",
      body: JSON.stringify({
        message: "同时更换关注和邮箱时需间隔 300 秒，请在 251 秒后再试。",
      }),
    });
  });

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("reader@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();

  await expect(page.locator("#subscription-error")).toHaveText(
    "同时更换关注和邮箱时需间隔 300 秒，请在 251 秒后再试。",
  );
  await expect(page.getByRole("button", { name: "立即订阅" })).toBeEnabled();
});

test("offers one-click ranking fallback and reuses the entered email", async ({
  page,
}) => {
  await captureTrafficEvents(page);
  const payloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/subscriptions", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    payloads.push(payload);
    const isFallback = payload.rankingFallback === true;
    await route.fulfill({
      status: isFallback ? 200 : 429,
      headers: isFallback ? {} : { "Retry-After": "1200" },
      contentType: "application/json",
      body: JSON.stringify(
        isFallback
          ? { status: "subscribed", message: "您已订阅成功！" }
          : {
              message: "您近期提交了较多订阅。",
              code: "subscription_limit",
              retryAfterSeconds: 1200,
              rankingFallbackAllowed: true,
            },
      ),
    });
  });

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("reader@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();

  await expect(
    page.getByRole("heading", { name: "订阅次数有点多" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认订阅排行榜" }).click();
  await expect(
    page.getByRole("heading", { name: "您已订阅成功！" }),
  ).toBeVisible();
  expect(payloads[1]).toEqual({
    subscriptionType: "api_ranking",
    email: "reader@example.com",
    rankingFallback: true,
  });
  const events = await readTrafficEvents(page);
  expect(events.map((entry) => entry.event)).toEqual([
    "subscription_sheet_opened",
    "subscription_submit_failed",
    "subscription_submit_succeeded",
  ]);
  expect(events[1]?.properties).toMatchObject({
    failure_kind: "fallback_available",
  });
  expect(events[2]?.properties).toMatchObject({
    result: "fallback_subscribed",
  });
  expect(JSON.stringify(events)).not.toContain("reader@example.com");
});

test("classifies an invalid subscription response without exposing it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Event payloads are device-independent.");
  await captureTrafficEvents(page);
  await page.route("**/api/subscriptions", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<p>private upstream response</p>",
    }),
  );

  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("private@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();
  await expect(page.locator("#subscription-error")).toBeVisible();

  const events = await readTrafficEvents(page);
  expect(events.at(-1)?.properties).toMatchObject({
    failure_kind: "invalid_response",
  });
  expect(JSON.stringify(events)).not.toContain("private@example.com");
  expect(JSON.stringify(events)).not.toContain("private upstream response");
});

test("submits the regular ranking subscription", async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/subscriptions", async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "subscribed",
        message: "您已订阅成功！",
      }),
    });
  });
  await page.goto("/api-pricing");
  await waitForPricingHydration(page);
  await page
    .getByRole("button", { name: "订阅排行榜变动" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "订阅 API 价格排行榜" }),
  ).toBeVisible();
  await page.getByLabel("邮箱").fill("ranking@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();
  await expect(
    page.getByRole("heading", { name: "您已订阅成功！" }),
  ).toBeVisible();
  expect(payload).toEqual({
    subscriptionType: "api_ranking",
    email: "ranking@example.com",
    rankingFallback: false,
  });
});

test("closes the ranking fallback when the user declines", async ({ page }) => {
  await page.route("**/api/subscriptions", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        message: "您近期提交了较多订阅。",
        code: "subscription_limit",
        retryAfterSeconds: 1200,
        rankingFallbackAllowed: true,
      }),
    });
  });
  await page.goto("/");
  await waitForPricingHydration(page);
  await page.getByRole("button", { name: "关注价格" }).click();
  await page.getByLabel("邮箱").fill("reader@example.com");
  await page.getByRole("button", { name: "立即订阅" }).click();
  await page.getByRole("button", { name: "暂不订阅" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
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

test("uses provider query links for landing-page handoff", async ({ page }) => {
  await page.goto("/glm-price");
  await expect(
    page.getByRole("heading", { name: "智谱 GLM 订阅与 API 价格" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /比较 智谱 GLM 的订阅价格/ })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/china-ai-subscriptions\?provider=glm-resource-package$/,
  );
  await waitForPricingHydration(page);
  await expect(
    page.locator('.provider-button[data-provider-id="glm-resource-package"]'),
  ).toHaveAttribute("aria-pressed", "true");
});

test("uses stable model query links for API landing-page handoff", async ({
  page,
}) => {
  await page.goto("/deepseek-price");
  const modelLink = page.locator(".landing-model-link").first();
  if ((await modelLink.count()) === 0) {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex,\s*follow/,
    );
    return;
  }
  await expect(modelLink).toBeVisible();
  const href = await modelLink.getAttribute("href");
  expect(href).toMatch(
    /^\/api-pricing\?provider=deepseek-api&model=[a-z0-9-]+$/,
  );
  await modelLink.click();
  await expect(page).toHaveURL(
    /\/api-pricing\?provider=deepseek-api&model=[a-z0-9-]+$/,
  );
  await waitForPricingHydration(page);
  await expect(
    page.locator('.provider-button[data-provider-id="deepseek-api"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.price-row[data-highlighted="true"]')).toHaveCount(
    1,
  );
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
  const secondPlan = page.locator(".plan-button").nth(1);
  const secondPlanId = await secondPlan.getAttribute("data-plan-id");
  expect(secondPlanId).toBeTruthy();
  await secondPlan.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("plan"))
    .toBe(secondPlanId);
  await page.reload();
  await waitForPricingHydration(page);
  await expect(
    page.locator(`.plan-button[data-plan-id="${secondPlanId}"]`),
  ).toHaveAttribute("data-active", "true");
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

  const geminiButton = page.locator(
    '.provider-button[data-provider-id="gemini-api"]',
  );
  await geminiButton.click();
  await expect(
    page.locator(
      '.api-ranking-desktop .api-ranking-entry[data-highlighted="true"][data-provider-id="gemini-api"]',
    ),
  ).toBeInViewport();
  await expect(page.locator(".provider-large-mark svg path")).toHaveAttribute(
    "fill",
    "#756AF6",
  );

  const outputMetric = page
    .locator(".api-ranking-desktop .api-ranking-switch")
    .getByRole("button", { name: "输出" });
  await outputMetric.click();
  await geminiButton.click();
  await expect(outputMetric).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(
      '.api-ranking-desktop .api-ranking-entry[data-highlighted="true"]',
    ),
  ).toHaveCount(1);
  await page.waitForTimeout(3_100);
  await page
    .locator(".api-ranking-desktop .api-ranking-switch")
    .getByRole("button", { name: "非缓存输入" })
    .click();
  await expect(
    page.locator(
      '.api-ranking-desktop .api-ranking-entry[data-highlighted="true"]',
    ),
  ).toHaveCount(0);

  const firstRankingEntry = page
    .locator(
      '.api-ranking-desktop .api-ranking-entry[data-provider-id="openai-api"]',
    )
    .first();
  const targetProviderId =
    await firstRankingEntry.getAttribute("data-provider-id");
  const targetOfferId = await firstRankingEntry.getAttribute("data-offer-id");
  const targetModelSlug =
    await firstRankingEntry.getAttribute("data-model-slug");
  expect(targetProviderId).toBeTruthy();
  expect(targetOfferId).toBeTruthy();
  expect(targetModelSlug).toBeTruthy();
  await firstRankingEntry.click();
  await expect(
    page.locator(`.provider-button[data-provider-id="${targetProviderId}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  const targetRow = page
    .locator(
      `.price-row[data-highlighted="true"][data-offer-id="${targetOfferId}"]`,
    )
    .first();
  await expect(targetRow).toBeVisible();
  await expect(targetRow).toBeInViewport();

  const targetRowModelSlug = await targetRow.getAttribute("data-model-slug");
  expect(targetRowModelSlug).toBeTruthy();
  await targetRow.click();
  const highlightedRankingEntry = page.locator(
    `.api-ranking-desktop .api-ranking-entry[data-highlighted="true"][data-provider-id="${targetProviderId}"][data-model-slug="${targetRowModelSlug}"]`,
  );
  await expect(highlightedRankingEntry).toBeVisible();
  await expect(highlightedRankingEntry).toBeInViewport();

  await expect(page.getByRole("heading", { name: "OpenAI API" })).toBeVisible();
  const openAiRow = page.locator(".price-list > .price-row").first();
  await expect(openAiRow.locator(".official-price strong")).toContainText("¥");
  await expect(openAiRow.locator(".official-price small")).toContainText("$");
  await expect(openAiRow.locator(".official-price small")).toContainText(
    "1 USD ≈ ¥",
  );
  await expect(openAiRow.locator(".official-price small")).toContainText(
    "汇率 2026-07-31",
  );
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
  const globalRankingEntry = page
    .locator(
      '.api-ranking-mobile .api-ranking-entry[data-provider-id="openai-api"]',
    )
    .first();
  await expect(globalRankingEntry).toBeVisible();
  await globalRankingEntry.click();
  await expect(
    page.locator('.provider-button[data-provider-id="openai-api"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.price-row[data-model-slug="gpt-5-6-sol"]').first(),
  ).toBeInViewport();
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
              const visibleLabel =
                item.querySelector(".nav-label-compact") ?? item;
              const style = getComputedStyle(visibleLabel);
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
        await page
          .locator(".desktop-nav .nav-item")
          .evaluateAll((items) =>
            items.map((item) => item.getAttribute("aria-label")),
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
