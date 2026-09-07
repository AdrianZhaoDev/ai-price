import { expect, test } from "@playwright/test";

test("public directories are primary tabs with localized active states", async ({
  page,
}) => {
  for (const prefix of ["", "/en"]) {
    await page.goto(`${prefix}/channels`);
    const nav = page.locator("header nav");
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(5);
    expect(
      await links.evaluateAll((items) =>
        items.map((a) => a.getAttribute("href")),
      ),
    ).toEqual([
      prefix || "/",
      `${prefix}/china-ai-subscriptions`,
      `${prefix}/api-pricing`,
      `${prefix}/channels`,
      `${prefix}/api-transit`,
    ]);
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute(
      "data-mode",
      "channels",
    );
    await expect(
      page.locator(
        '[aria-label="Public directories"], [aria-label="公开目录导航"]',
      ),
    ).toHaveCount(0);
    await nav.locator('[data-mode="api-transit"]').click();
    await expect(page).toHaveURL(`${prefix}/api-transit`);
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute(
      "data-mode",
      "api-transit",
    );
    await expect(
      page.locator(
        '[aria-label="Public directories"], [aria-label="公开目录导航"]',
      ),
    ).toHaveCount(0);
    await nav.locator('[data-mode="api"]').click();
    await expect(page).toHaveURL(`${prefix}/api-pricing`);
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute(
      "data-mode",
      "api",
    );
  }
});

test("five header tabs fit phone, landscape, tablet and desktop widths", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Explicit responsive sizes are covered once.");
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const prefix of ["", "/en"]) {
    await page.goto(`${prefix}/channels`);
    for (const width of [320, 375, 620, 621, 812, 1180, 1181, 1440]) {
      await page.setViewportSize({ width, height: width === 812 ? 375 : 900 });
      const metrics = await page.locator("header nav").evaluate((nav) => ({
        fits:
          document.documentElement.scrollWidth <= innerWidth &&
          nav.scrollWidth <= nav.clientWidth,
        itemsFit: [...nav.querySelectorAll("a")].every((link) => {
          const rect = link.getBoundingClientRect();
          return (
            link.scrollWidth <= link.clientWidth &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.height >= 44
          );
        }),
      }));
      expect(metrics, `${prefix || "zh"} at ${width}px`).toEqual({
        fits: true,
        itemsFit: true,
      });
    }
  }
});
