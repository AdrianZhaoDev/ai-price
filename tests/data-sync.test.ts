import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataSyncConfig } from "@/lib/sync/config";
import { runConfiguredDataSync } from "@/lib/sync";

const counts = {
  providers: 1,
  products: 2,
  plans: 3,
  sources: 4,
  collectionRuns: 5,
  fxRates: 6,
  priceObservations: 7,
  priceChangeCandidates: 8,
  priceChangeEvents: 9,
  apiRankingState: 10,
  apiRankingEvents: 11,
  modelCatalogImports: 12,
  modelLabs: 13,
  modelCatalogProviders: 14,
  modelCatalogModels: 15,
  modelProviderOfferings: 16,
  modelCatalogEvents: 17,
  collectionErrors: 18,
};

describe("configured data sync", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled by default", async () => {
    expect(getDataSyncConfig({})).toBeNull();
    expect(
      await runConfiguredDataSync({
        syncPostgresqlData: vi.fn(),
      }),
    ).toBeNull();
  });

  it("validates required channel, target and URL", () => {
    expect(() =>
      getDataSyncConfig({
        DATA_SYNC_ENABLED: "true",
        DATA_SYNC_CHANNEL: "s3",
        DATA_SYNC_TARGET: "backup",
        DATA_SYNC_TARGET_URL: "postgresql://example",
      }),
    ).toThrow(/DATA_SYNC_CHANNEL/);

    expect(() =>
      getDataSyncConfig({
        DATA_SYNC_ENABLED: "true",
        DATA_SYNC_CHANNEL: "neon",
        DATA_SYNC_TARGET: "not a valid target",
        DATA_SYNC_TARGET_URL: "postgresql://example",
      }),
    ).toThrow(/DATA_SYNC_TARGET/);
  });

  it("routes the Neon channel through PostgreSQL sync", async () => {
    vi.stubEnv("DATA_SYNC_ENABLED", "true");
    vi.stubEnv("DATA_SYNC_CHANNEL", "neon");
    vi.stubEnv("DATA_SYNC_TARGET", "neondb");
    vi.stubEnv("DATA_SYNC_TARGET_URL", "postgresql://remote.example/db");
    const syncPostgresqlData = vi.fn().mockResolvedValue(counts);

    const result = await runConfiguredDataSync({ syncPostgresqlData });

    expect(syncPostgresqlData).toHaveBeenCalledWith(
      "postgresql://remote.example/db",
    );
    expect(result).toMatchObject({
      channel: "neon",
      target: "neondb",
      counts,
    });
  });
});
