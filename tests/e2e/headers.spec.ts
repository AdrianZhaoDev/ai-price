import { expect, test } from "@playwright/test";

test("serves security headers and does not cache private routes", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "Response headers are device-independent.");

  const publicResponse = await request.get("/");

  expect(publicResponse.ok()).toBe(true);
  expect(publicResponse.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(publicResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect(publicResponse.headers()["x-frame-options"]).toBe("DENY");
  expect(publicResponse.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );

  const adminResponse = await request.get("/admin", { maxRedirects: 0 });
  expect(adminResponse.headers()["cache-control"]).toMatch(
    /(?:no-store|no-cache)/,
  );
  expect(adminResponse.headers()["x-robots-tag"]).toContain("noindex");

  const apiResponse = await request.get("/api/admin/session");
  expect(apiResponse.headers()["cache-control"]).toMatch(
    /(?:no-store|no-cache)/,
  );
  expect(apiResponse.headers()["x-robots-tag"]).toContain("noindex");

  const apiPricingResponse = await request.get("/api-pricing");
  expect(apiPricingResponse.ok()).toBe(true);
  expect(apiPricingResponse.headers()["x-robots-tag"]).toBeUndefined();

  const pricingDataResponse = await request.get("/pricing-data/chatgpt?v=e2e");
  expect(pricingDataResponse.ok()).toBe(true);
  expect(pricingDataResponse.headers()["cache-control"]).toContain(
    "s-maxage=900",
  );
  expect(pricingDataResponse.headers()["x-robots-tag"]).toContain("noindex");
});
