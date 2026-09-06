import { expect, test } from "@playwright/test";

test.describe("public channel and API transit directories", () => {
  test("keeps attributed monitoring evidence readable on small and landscape screens", async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.EXPECT_PUBLIC_MONITORING_FIXTURE !== "true",
      "Requires an isolated database with explicitly synthetic monitoring samples.",
    );
    const body = await (await request.get("/api/v1/transit?limit=1")).json();
    const slug = body.items[0].slug;
    for (const locale of ["", "/en"]) {
      for (const viewport of [
        { width: 375, height: 812 },
        { width: 812, height: 375 },
      ]) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${locale}/api-transit/${slug}`);
        const evidence = page.locator("[data-availability-evidence]").first();
        await expect(evidence).toBeVisible();
        await expect(evidence).toContainText(
          locale ? "Synthetic sample" : "演示样本",
        );
        await expect(evidence.locator("time")).toContainText("UTC");
        await expect(evidence.getByRole("link")).toHaveAttribute(
          "rel",
          "nofollow noopener noreferrer",
        );
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
    }
  });
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

    await page.goto("/en/channels?limit=1");
    const offerPages = page.getByRole("navigation", { name: "Offer pages" });
    if (await offerPages.count()) {
      await offerPages.getByRole("link", { name: "Next page" }).click();
      await expect(page).toHaveURL(/offset=1/);
      await page
        .getByRole("navigation", { name: "Offer pages" })
        .getByRole("link", { name: "Previous page" })
        .click();
      await expect(page).toHaveURL(/offset=0/);
    }

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
    if (process.env.EXPECT_PUBLIC_DIRECT_DATA === "true")
      expect(response.status()).toBe(200);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.apiVersion).toBe(1);
      expect(body.policy.requestTimeCollection).toBe(false);
      expect(body.query.includeUnpublished).toBe(false);
      stationSlug = body.items[0]?.slug;
      if (process.env.EXPECT_PUBLIC_DIRECT_DATA === "true") {
        expect(body.isSynthetic).toBe(false);
        expect(body.total).toBe(2);
        expect(stationSlug).toBeTruthy();
      }
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
      if (process.env.EXPECT_PUBLIC_DIRECT_DATA === "true") {
        await expect(page.getByText(/输入:.*CNY/).first()).toBeVisible();
        await expect(page.getByText(/输出:.*CNY/).first()).toBeVisible();
      }
      await page.goto(`/en/api-transit/${stationSlug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
});
