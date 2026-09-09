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
    await expect(page.locator("main input")).toHaveCount(2);
    await expect(page.locator("main select")).toHaveCount(0);
    await page.route("**/api/transit/submissions", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        url: "https://ai.lowpriceradar.com/",
        description: "An AI API gateway.",
      });
      await route.fulfill({ status: 200, json: { code: "submitted" } });
    });
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
  await page.route("**/api/transit/submissions", (route) =>
    route.fulfill({ status: 503, json: { code: "unavailable" } }),
  );
  await page.getByLabel("网站链接").fill("https://ai.lowpriceradar.com/");
  await page.getByLabel("一句话介绍").fill("AI API 网关。");
  await page.getByRole("button", { name: "提交申请" }).click();
  await expect(page.getByRole("status")).toContainText("提交失败");
  await expect(page.getByLabel("网站链接")).toHaveValue(
    "https://ai.lowpriceradar.com/",
  );
  await expect(page.getByRole("button", { name: "提交申请" })).toBeEnabled();
});
