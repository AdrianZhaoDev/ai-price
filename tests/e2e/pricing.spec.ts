import { expect, test } from "@playwright/test";

test("switches modes, providers and theme", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop navigation is covered separately.");
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "同一份订阅，不同的地区价格",
    }),
  ).toBeVisible();
  expect(
    await page
      .locator(".provider-rail-global .provider-button")
      .allTextContents(),
  ).toEqual(["ChatGPT", "Claude / Code", "Gemini", "Grok"]);
  await page.getByRole("button", { name: "国内订阅" }).click();
  await expect(
    page.getByRole("heading", { name: "国内 AI 会员，直接看官方价" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "智谱 GLM 资源包" }),
  ).toBeVisible();
  await expect(
    page.locator(".provider-rail .provider-button").first(),
  ).toContainText("智谱资源包");
  await page.getByRole("button", { name: "MiniMax" }).click();
  await expect(page.getByRole("heading", { name: "MiniMax" })).toBeVisible();

  await page.getByRole("button", { name: "切换深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
});

test("opens the price alert sheet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "关注价格" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await page.getByRole("button", { name: "关闭价格订阅" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("shows ranked RMB prices without duplicate or status-only plans", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop price table assertions.");
  await page.goto("/");

  await expect(
    page.locator(".plan-button").filter({ hasText: "ChatGPT Plus" }),
  ).toHaveCount(1);
  const planMinimums = (
    await page.locator(".plan-button .plan-minimum").allTextContents()
  ).map((value) => Number(value.replace(/[^\d.]/g, "")));
  expect(planMinimums).toHaveLength(4);
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
  await expect(page.locator(".converted-price[data-rank]")).toHaveCount(3);
  await expect(
    page.locator('.converted-price[data-rank="1"] strong'),
  ).toHaveCSS("color", "rgb(0, 214, 111)");

  await page
    .getByRole("button", {
      name: "当前低价优先，点击改为高价优先",
    })
    .click();
  const descending = (
    await page.locator(".converted-price strong").allTextContents()
  ).map((value) => Number(value.replace(/[^\d.]/g, "")));
  expect(descending).toEqual([...descending].sort((a, b) => b - a));

  await page
    .getByRole("button", { name: "API 价格排行榜", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "API 价格排行榜", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Kimi API", exact: true }).click();
  await expect(page.locator('.official-price[data-rank="1"] strong')).toHaveCSS(
    "color",
    "rgb(0, 214, 111)",
  );
});

test("mobile navigation and sheet remain usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile-only navigation.");
  await page.goto("/");
  await expect(page.locator(".mobile-global-details").first()).toBeVisible();
  await page.getByRole("button", { name: "打开价格模式菜单" }).click();
  await page
    .getByRole("navigation", { name: "移动端价格模式" })
    .getByRole("button", { name: /API 价格排行榜/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "模型调用成本，按官方单位列清楚",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关注价格" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("small phone and landscape layouts do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "打开价格模式菜单" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 812, height: 375 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "同一份订阅，不同的地区价格",
    }),
  ).toBeVisible();
});
