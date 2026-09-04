import { beforeEach, describe, expect, it, vi } from "vitest";
import { providerCatalog } from "@/lib/data/catalog";

const { loadMode, loadProvider } = vi.hoisted(() => ({
  loadMode: vi.fn(),
  loadProvider: vi.fn(),
}));
vi.mock("@/lib/pricing/page-cache", () => ({
  loadCachedPricingPageData: loadMode,
  loadCachedProviderCatalog: loadProvider,
}));
import { loadLandingCatalogSnapshot } from "@/lib/landing-page-data";

describe("landing catalog bulk snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMode.mockImplementation(async (mode: string) => ({
      providers: providerCatalog.filter((provider) => provider.mode === mode),
    }));
  });

  it("loads only three mode snapshots while preserving all catalog offers", async () => {
    const snapshot = await loadLandingCatalogSnapshot();
    expect(loadMode).toHaveBeenCalledTimes(3);
    expect(loadProvider).not.toHaveBeenCalled();
    expect(Object.values(snapshot).flat()).toEqual(providerCatalog);
  });

  it("propagates a failed mode read so a partial sitemap is never cached", async () => {
    loadMode.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(loadLandingCatalogSnapshot()).rejects.toThrow(
      "database unavailable",
    );
  });
});
