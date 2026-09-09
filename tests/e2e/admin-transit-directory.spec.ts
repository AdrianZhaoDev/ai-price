import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createAdminSession } from "../../lib/admin/auth";

loadEnvConfig(process.cwd());

test("administrator can edit and rank the transit directory", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "ai_price_admin_session",
      value: createAdminSession(),
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto("/admin/transit-submissions");

  await expect(page.getByRole("heading", { name: "中转站申请" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公开列表" })).toBeVisible();
  const entry = page
    .locator('form[action^="/api/admin/transit-directory/"]')
    .first();
  await expect(entry.getByLabel("网站标题")).toHaveValue("Low Price Radar API");
  await expect(entry.getByLabel("排名（数字越小越靠前）")).toHaveValue("10");

  let submittedBody = "";
  await page.route("**/api/admin/transit-directory/*", async (route) => {
    submittedBody = route.request().postData() ?? "";
    await route.fulfill({
      status: 303,
      headers: { location: "/admin/transit-submissions?message=updated" },
    });
  });
  await entry.getByLabel("网站标题").fill("Low Price Radar Gateway");
  await entry.getByLabel("排名（数字越小越靠前）").fill("5");
  await entry.getByRole("button", { name: "保存修改" }).click();
  await expect
    .poll(() => submittedBody)
    .toContain("name=Low+Price+Radar+Gateway");
  expect(submittedBody).toContain("rank=5");
  expect(submittedBody).toContain("published=on");

  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
