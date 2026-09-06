import { expect, test } from "@playwright/test";

test.describe("public channel and API transit directories", () => {
  test("supports index pages, shareable filters, and bilingual routes", async ({
    page,
    isMobile,
  }) => {
    for (const path of [
      "/channels",
      "/api-transit",
      "/en/channels",
      "/en/api-transit",
    ]) {
      const response = await page.goto(path);
      expect(response?.ok(), `${path} should render`).toBe(true);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const structuredData = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((scripts) =>
          scripts.map((script) => script.textContent ?? ""),
        );
      expect(
        structuredData.filter((value) => value.includes("Dataset")),
      ).toHaveLength(1);
      if (isMobile) {
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
    }

    await page.goto("/channels?q=api&sort=price&limit=1");
    await expect(page).toHaveURL(/\/channels\?q=api&sort=price&limit=1/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/api-transit?q=token&sort=stability&limit=1");
    await expect(page).toHaveURL(
      /\/api-transit\?q=token&sort=stability&limit=1/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("exposes a read-only API contract and follows a station detail link when data exists", async ({
    page,
    request,
  }) => {
    const response = await request.get("/api/v1/transit?limit=1");
    let stationSlug: string | undefined;
    expect([200, 503]).toContain(response.status());
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.apiVersion).toBe(1);
      expect(body.policy.requestTimeCollection).toBe(false);
      expect(body.query.includeUnpublished).toBe(false);
      stationSlug = body.items[0]?.slug;
    } else {
      expect(response.headers()["cache-control"]).toContain("no-store");
    }

    await page.goto("/api-transit");
    if (stationSlug) {
      const detailLink = page.locator(`a[href="/api-transit/${stationSlug}"]`);
      await expect(detailLink.first()).toBeVisible();
      await detailLink.first().click();
      await expect(page).toHaveURL(new RegExp(`/api-transit/${stationSlug}$`), {
        timeout: 30_000,
      });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(/站点详情|Station detail/)).toBeVisible();
      await page.goto(`/en/api-transit/${stationSlug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
});
