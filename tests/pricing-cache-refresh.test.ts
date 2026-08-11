import { refreshPricingCacheAfterCollection } from "@/lib/pricing/cache-refresh";
import { describe, expect, it, vi } from "vitest";

describe("pricing cache refresh", () => {
  it("does not call the web service outside production", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(
      refreshPricingCacheAfterCollection({
        environment: "test",
        fetchImplementation,
      }),
    ).resolves.toEqual({ refreshed: false, reason: "not-production" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("authenticates the production refresh without exposing the secret", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      refreshPricingCacheAfterCollection({
        environment: "production",
        secret: "collector-secret",
        refreshUrl: "http://127.0.0.1:3100/api/pricing/revalidate",
        fetchImplementation,
      }),
    ).resolves.toEqual({ refreshed: true });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3100/api/pricing/revalidate",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer collector-secret",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }),
    );
  });

  it("fails the collection run when production refresh cannot complete", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Unavailable", { status: 503 }));

    await expect(
      refreshPricingCacheAfterCollection({
        environment: "production",
        secret: "collector-secret",
        fetchImplementation,
      }),
    ).rejects.toThrow("HTTP 503");
  });

  it("chunks catalogs larger than the protected endpoint limit", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const changedModelIds = Array.from(
      { length: 1001 },
      (_, index) => `lab/model-${index}`,
    );

    await refreshPricingCacheAfterCollection({
      environment: "production",
      secret: "collector-secret",
      catalogChanged: true,
      changedModelIds,
      fetchImplementation,
    });

    const refreshCalls = fetchImplementation.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(refreshCalls).toHaveLength(2);
    expect(JSON.parse(String(refreshCalls[0][1]?.body))).toMatchObject({
      catalogChanged: true,
      changedModelIds: changedModelIds.slice(0, 1000),
    });
    expect(JSON.parse(String(refreshCalls[1][1]?.body))).toMatchObject({
      catalogChanged: false,
      changedModelIds: changedModelIds.slice(1000),
    });
  });

  it("warms both localized catalog and model paths", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await refreshPricingCacheAfterCollection({
      environment: "production",
      secret: "collector-secret",
      catalogChanged: true,
      changedModelIds: ["openai/gpt-5"],
      fetchImplementation,
      warmBaseUrl: "https://lowpriceradar.com",
    });

    const warmedPaths = fetchImplementation.mock.calls
      .filter(([, init]) => init?.method !== "POST")
      .map(([url]) => new URL(String(url)).pathname);
    expect(warmedPaths).toEqual([
      "/models/openai/gpt-5",
      "/en/models/openai/gpt-5",
      "/api-pricing",
      "/en/api-pricing",
      "/sitemap.xml",
    ]);
  });
});
