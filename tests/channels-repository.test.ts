import { describe, expect, it } from "vitest";
import {
  ChannelRepository,
  createChannelRepository,
  loadChannelSnapshot,
} from "@/lib/channels/repository";
import { syntheticChannelOffers } from "@/lib/channels/fixture";

describe("ChannelRepository", () => {
  it("reloads with zero TTL even when the clock has not advanced", async () => {
    let calls = 0;
    const now = new Date();
    const repository = new ChannelRepository({
      cacheTtlMs: 0,
      now: () => now,
      loadPublishedOffers: async () => {
        calls++;
        if (calls === 2) throw new Error("offline");
        return {
          generatedAt: now.toISOString(),
          offers: [syntheticChannelOffers[0]],
        };
      },
    });
    await repository.load();
    expect((await repository.load()).dataStatus).toBe("degraded");
    expect(calls).toBe(2);
  });
  it("ages cached last-good offer health during a prolonged database outage", async () => {
    let now = new Date("2026-09-06T00:00:00Z");
    let unavailable = false;
    const repository = new ChannelRepository({
      cacheTtlMs: 0,
      now: () => now,
      loadPublishedOffers: async () => {
        if (unavailable) throw new Error("offline");
        return {
          generatedAt: now.toISOString(),
          offers: [
            {
              ...syntheticChannelOffers[0],
              lastSeenAt: now.toISOString(),
              sourceHealth: "healthy",
            },
          ],
        };
      },
    });
    expect((await repository.load()).offers[0].sourceHealth).toBe("healthy");
    unavailable = true;
    now = new Date("2026-09-08T00:00:00Z");
    const fallback = await repository.load();
    expect(fallback.dataStatus).toBe("degraded");
    expect(fallback.offers[0].sourceHealth).toBe("unknown");
  });
  it("returns a clearly labelled synthetic snapshot without a database", async () => {
    const repository = new ChannelRepository({ databaseConfigured: false });
    const snapshot = await repository.getSnapshot();
    expect(snapshot.dataStatus).toBe("synthetic");
    expect(snapshot.dataSource).toBe("synthetic");
    expect(snapshot.warning).toMatch(/synthetic fixture/i);
    expect(snapshot.offers.length).toBeGreaterThan(0);

    snapshot.offers[0].labels.push("local-only");
    const second = await repository.getSnapshot();
    expect(second.offers[0].labels).not.toContain("local-only");
  });

  it("uses an injected reader, validates rows and deduplicates the published view", async () => {
    const repository = createChannelRepository({
      now: () => new Date("2026-09-06T01:00:00.000Z"),
      databaseConfigured: true,
      loadPublishedOffers: async ({ domain }) => {
        expect(domain).toBe("channels");
        return {
          generationId: "generation-1",
          generatedAt: "2026-09-06T00:00:00.000Z",
          offers: [
            syntheticChannelOffers[1],
            syntheticChannelOffers[0],
            { id: "invalid", priceMinor: -1 },
          ],
        };
      },
    });
    const snapshot = await repository.getSnapshot();
    expect(snapshot.dataStatus).toBe("published");
    expect(snapshot.dataSource).toBe("database");
    expect(snapshot.generationId).toBe("generation-1");
    expect(snapshot.offers).toHaveLength(1);
    expect(snapshot.offers[0].id).toBe("synthetic-offer-basic-alpha-api");
    expect(snapshot.warning).toMatch(/rejected/i);
  });

  it("does not expose synthetic prices when a configured database reader is absent", async () => {
    const snapshot = await loadChannelSnapshot({ databaseConfigured: true });
    expect(snapshot.dataStatus).toBe("degraded");
    expect(snapshot.dataSource).toBe("database");
    expect(snapshot.offers).toEqual([]);
    expect(snapshot.warning).toMatch(/reader is wired/i);
  });

  it("degrades safely on reader errors and supports list helpers", async () => {
    const repository = new ChannelRepository({
      databaseConfigured: true,
      loadPublishedOffers: () => {
        throw new Error("connection refused");
      },
    });
    const snapshot = await repository.getSnapshot();
    expect(snapshot.dataStatus).toBe("degraded");
    expect(snapshot.offers).toEqual([]);
    expect(snapshot.warning).toMatch(/connection refused/);

    const injected = new ChannelRepository({
      databaseConfigured: false,
      loadPublishedOffers: () => syntheticChannelOffers,
    });
    const offers = await injected.listOffers({
      availability: "in_stock",
      limit: 1,
    });
    expect(offers).toHaveLength(1);
    expect((await injected.listProducts()).length).toBe(2);
    expect((await injected.listMerchants()).length).toBe(2);
  });

  it("uses a custom synthetic snapshot factory without sharing mutable rows", async () => {
    const snapshot = await loadChannelSnapshot({
      databaseConfigured: false,
      syntheticSnapshot: () => ({
        domain: "channels",
        generatedAt: "2026-09-06T00:00:00.000Z",
        dataStatus: "synthetic",
        dataSource: "synthetic",
        offers: [syntheticChannelOffers[0]],
      }),
    });
    expect(snapshot.offers).toHaveLength(1);
    snapshot.offers[0].tiers.push({
      minQuantity: 2,
      priceMinor: 900,
      currency: "CNY",
    });
    const again = await loadChannelSnapshot({
      databaseConfigured: false,
      syntheticSnapshot: () => ({
        domain: "channels",
        generatedAt: "2026-09-06T00:00:00.000Z",
        dataStatus: "synthetic",
        dataSource: "synthetic",
        offers: [syntheticChannelOffers[0]],
      }),
    });
    expect(again.offers[0].tiers).toHaveLength(0);
  });
});
