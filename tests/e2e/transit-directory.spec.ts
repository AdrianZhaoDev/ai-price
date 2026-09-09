import { expect, test } from "@playwright/test";

for (const locale of ["", "/en"]) {
  test(`clickable transit directory ${locale || "Chinese"}`, async ({
    page,
  }) => {
    await page.goto(`${locale}/api-transit`);
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByRole("link").first()).toHaveAttribute(
      "href",
      "https://ai.lowpriceradar.com/",
    );
    await expect(table).not.toContainText("https://");
    await expect(table.getByRole("columnheader")).toHaveCount(2);
    await page
      .context()
      .route("https://ai.lowpriceradar.com/", (route) =>
        route.fulfill({ status: 200, body: "Station" }),
      );
    const row = table.getByRole("row").nth(1);
    const box = await row.boundingBox();
    const opened = page.waitForEvent("popup");
    await row.click({ position: { x: box!.width - 16, y: box!.height / 2 } });
    const popup = await opened;
    await popup.waitForLoadState();
    expect(popup.url()).toBe("https://ai.lowpriceradar.com/");
    await popup.close();
    await expect(page.locator("main input")).toHaveCount(3);
    await expect(page.locator("main select")).toHaveCount(0);
    await page.route(
      "**/api/transit/submissions/verification",
      async (route) => {
        const payload = route.request().postDataJSON();
        if (route.request().method() === "POST") {
          expect(payload).toEqual({
            email: "owner@example.com",
            locale: locale ? "en" : "zh-CN",
          });
          await route.fulfill({
            status: 200,
            json: { code: "code_sent", verificationId: "verification-id" },
          });
          return;
        }
        expect(payload).toEqual({
          email: "owner@example.com",
          verificationId: "verification-id",
          code: "123456",
        });
        await route.fulfill({ status: 200, json: { code: "verified" } });
      },
    );
    await page.route("**/api/transit/submissions", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        email: "owner@example.com",
        verificationId: "verification-id",
        url: "https://ai.lowpriceradar.com/",
        description: "An AI API gateway.",
      });
      await route.fulfill({ status: 200, json: { code: "submitted" } });
    });
    await page
      .getByLabel(locale ? "Email" : "邮箱", { exact: true })
      .fill("owner@example.com");
    await page
      .getByRole("button", {
        name: locale ? "Send code" : "发送验证码",
      })
      .click();
    await page
      .getByLabel(locale ? "Verification code" : "邮箱验证码")
      .fill("123456");
    await page
      .getByRole("button", { name: locale ? "Verify" : "验证邮箱" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      locale ? "Email verified" : "邮箱验证成功",
    );
    await page
      .getByLabel(locale ? "Website link" : "网站链接")
      .fill("https://ai.lowpriceradar.com/");
    await page
      .getByLabel(locale ? "One-sentence introduction" : "一句话介绍")
      .fill("An AI API gateway.");
    await page
      .getByRole("button", {
        name: locale ? "Submit" : "提交申请",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      locale ? "Submitted for review" : "已提交",
    );
    for (const input of await page.locator("main input").all())
      await expect(input).toHaveValue("");
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 812, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
  });
}

test("failed submissions preserve the URL for retry", async ({ page }) => {
  await page.goto("/api-transit");
  await page.route("**/api/transit/submissions/verification", (route) =>
    route.fulfill({
      status: 200,
      json:
        route.request().method() === "POST"
          ? { code: "code_sent", verificationId: "verification-id" }
          : { code: "verified" },
    }),
  );
  await page.route("**/api/transit/submissions", (route) =>
    route.fulfill({ status: 503, json: { code: "unavailable" } }),
  );
  await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("邮箱验证码").fill("123456");
  await page.getByRole("button", { name: "验证邮箱" }).click();
  await page.getByLabel("网站链接").fill("https://ai.lowpriceradar.com/");
  await page.getByLabel("一句话介绍").fill("AI API 网关。");
  await page.getByRole("button", { name: "提交申请" }).click();
  await expect(page.getByRole("status")).toContainText("提交失败");
  await expect(page.getByLabel("网站链接")).toHaveValue(
    "https://ai.lowpriceradar.com/",
  );
  await expect(page.getByRole("button", { name: "提交申请" })).toBeEnabled();
});

test("duplicate submissions show the administrator contact", async ({
  page,
}) => {
  await page.goto("/api-transit");
  await page.route("**/api/transit/submissions/verification", (route) =>
    route.fulfill({
      status: 200,
      json:
        route.request().method() === "POST"
          ? { code: "code_sent", verificationId: "verification-id" }
          : { code: "verified" },
    }),
  );
  await page.route("**/api/transit/submissions", (route) =>
    route.fulfill({
      status: 200,
      json: { code: "duplicate", contact: "contact@example.com" },
    }),
  );
  await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("邮箱验证码").fill("123456");
  await page.getByRole("button", { name: "验证邮箱" }).click();
  await page.getByLabel("网站链接").fill("https://ai.lowpriceradar.com/");
  await page.getByLabel("一句话介绍").fill("AI API 网关。");
  await page.getByRole("button", { name: "提交申请" }).click();
  await expect(page.getByRole("status")).toContainText(
    "该网站已有提交。若尚未显示，请耐心等待，或联系 contact@example.com。",
  );
});

test("expired verification unlocks the email and code controls", async ({
  page,
}) => {
  await page.goto("/api-transit");
  await page.route("**/api/transit/submissions/verification", (route) =>
    route.fulfill({
      status: 200,
      json:
        route.request().method() === "POST"
          ? { code: "code_sent", verificationId: "verification-id" }
          : { code: "verified" },
    }),
  );
  await page.route("**/api/transit/submissions", (route) =>
    route.fulfill({
      status: 400,
      json: { code: "verification_required" },
    }),
  );
  await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("邮箱验证码").fill("123456");
  await page.getByRole("button", { name: "验证邮箱" }).click();
  await page.getByLabel("网站链接").fill("https://ai.lowpriceradar.com/");
  await page.getByLabel("一句话介绍").fill("AI API 网关。");
  await page.getByRole("button", { name: "提交申请" }).click();
  await expect(page.getByLabel("邮箱", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "发送验证码" })).toBeEnabled();
  await expect(page.getByLabel("邮箱验证码")).toHaveCount(0);
});

test("confirmation rate limits show a retry-later message", async ({
  page,
}) => {
  await page.goto("/api-transit");
  await page.route("**/api/transit/submissions/verification", (route) =>
    route.fulfill({
      status: route.request().method() === "POST" ? 200 : 429,
      json:
        route.request().method() === "POST"
          ? { code: "code_sent", verificationId: "verification-id" }
          : { code: "rate_limited" },
    }),
  );
  await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByLabel("邮箱验证码").fill("123456");
  await page.getByRole("button", { name: "验证邮箱" }).click();
  await expect(page.getByRole("status")).toContainText(
    "验证码尝试过于频繁，请稍后再试。",
  );
});
