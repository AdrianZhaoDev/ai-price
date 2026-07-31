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
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://127.0.0.1:3100/api/pricing/revalidate",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer collector-secret" },
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
});
