import { describe, expect, it } from "vitest";
import {
  createTransitRepository,
  getTransitStationBySlug,
  normalizeTransitAvailability,
  normalizeTransitDatabaseSnapshot,
  normalizeTransitOffer,
  resetDefaultTransitRepository,
} from "@/lib/transit/repository";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";

describe("transit repository", () => {
  it("keeps structured matches visible when free text matches a different offer", async () => {
    const station = getSyntheticTransitStations()[0];
    const now = new Date();
    station.dataStatus = "verified";
    station.offers = Array.from({ length: 7 }, (_, index) => ({
      ...station.offers[0],
      id: `mixed-${index}`,
      status: "verified" as const,
      standardModelId:
        index === 0
          ? "text-match"
          : index === 6
            ? "structured-match"
            : `unrelated-${index}`,
      standardModelLabel:
        index === 0
          ? "text-match"
          : index === 6
            ? "structured-match"
            : `unrelated-${index}`,
      lastVerifiedAt: now.toISOString(),
    }));
    const repository = createTransitRepository({
      loader: async () => ({
        generatedAt: now.toISOString(),
        stations: [station],
      }),
      now: () => now,
    });
    const result = await repository.list({
      q: "text-match",
      model: "structured-match",
    });
    expect(result.items[0].offers).toHaveLength(5);
    expect(result.items[0].offers[0].standardModelId).toBe("structured-match");
  });
  it("does not blend a partial aggregate with another source's evidence", () => {
    const fallback = normalizeTransitAvailability({
      sevenDayRate: 0.75,
      sevenDaySamples: 4,
      sourceType: "authorized_probe",
      sourceLabel: "Independent probe",
      lastCheckedAt: "2026-09-06T00:00:00Z",
    });
    const partial = normalizeTransitAvailability(
      { sourceType: "merchant_reported" },
      fallback,
    );
    expect(partial.sevenDayRate).toBeNull();
    expect(partial.sevenDaySamples).toBe(0);
    expect(partial.sourceLabel).toBeNull();
    const station = getSyntheticTransitStations()[0];
    const offer = normalizeTransitOffer(
      {
        ...station.offers[0],
        availability: { sourceType: "merchant_reported" },
      },
      station.id,
      fallback,
      new Date("2026-09-06T01:00:00Z"),
    );
    expect(offer?.availability).toMatchObject({
      sevenDayRate: 0.75,
      sevenDaySamples: 4,
      sourceType: "authorized_probe",
      sourceLabel: "Independent probe",
    });
  });
  it("expires embedded aggregates on successful reads and uses fresh sample evidence", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    const station = getSyntheticTransitStations()[0];
    const expired = {
      ...station.availability,
      sevenDayRate: 1,
      sevenDaySamples: 10,
      firstCheckedAt: "2026-09-06T00:00:00Z",
      lastCheckedAt: "2026-09-06T00:00:00Z",
      expiresAt: "2026-09-06T01:00:00Z",
    };
    station.availability = expired;
    station.offers = [{ ...station.offers[0], availability: expired }];
    const empty = normalizeTransitDatabaseSnapshot(
      { generatedAt: now.toISOString(), stations: [station] },
      { now },
    );
    expect(empty?.stations[0].availability.sevenDaySamples).toBe(0);
    expect(empty?.stations[0].offers[0].availability.sevenDaySamples).toBe(0);
    const fallback = normalizeTransitAvailability({
      ...expired,
      sevenDayRate: 0.5,
      sevenDaySamples: 2,
      expiresAt: "2026-09-06T13:00:00Z",
    });
    const offer = normalizeTransitOffer(
      station.offers[0],
      station.id,
      fallback,
      now,
    );
    expect(offer?.availability.sevenDayRate).toBe(0.5);
    expect(offer?.availability.sevenDaySamples).toBe(2);
  });
  it("preserves availability counts for the complete accepted sample corpus", () => {
    expect(
      normalizeTransitAvailability({ sevenDayRate: 1, sevenDaySamples: 100001 })
        .sevenDaySamples,
    ).toBe(100001);
    expect(
      normalizeTransitAvailability({
        sevenDayRate: 1,
        sevenDaySamples: 1000000,
      }).sevenDaySamples,
    ).toBe(1000000);
  });
  it("demotes a verified offer without any verification timestamp", () => {
    const station = getSyntheticTransitStations()[0];
    const result = normalizeTransitOffer(
      { ...station.offers[0], status: "verified", lastVerifiedAt: null },
      station.id,
    );
    expect(result?.status).toBe("unknown");
  });
  it.each([undefined, null, "", "verifed", "published"])(
    "does not publish an unrecognized offer status %s",
    async (status) => {
      const station = getSyntheticTransitStations()[0];
      const now = new Date();
      station.dataStatus = "verified";
      const raw = {
        ...station,
        offers: [
          { ...station.offers[0], status, lastVerifiedAt: now.toISOString() },
        ],
      };
      const repository = createTransitRepository({
        loader: async () => ({
          generatedAt: now.toISOString(),
          stations: [raw],
        }),
        now: () => now,
      });
      expect((await repository.load()).stations[0].offers[0].status).toBe(
        "unknown",
      );
      expect((await repository.list()).items[0].offers).toEqual([]);
      expect((await repository.getBySlug(station.slug))?.offers).toEqual([]);
    },
  );
  it("sorts structured comparisons using only matching offer evidence", async () => {
    const template = getSyntheticTransitStations()[0];
    const now = Date.now();
    const goodOffer = {
      ...template.offers[0],
      id: "good-match",
      standardModelId: "selected",
      combinedRate: 1,
      lastVerifiedAt: new Date(now - 3600000).toISOString(),
      availability: {
        ...template.offers[0].availability,
        sevenDayRate: 0.8,
        sevenDaySamples: 10,
      },
    };
    const badOffer = {
      ...goodOffer,
      id: "bad-match",
      combinedRate: 10,
      lastVerifiedAt: new Date(now - 7200000).toISOString(),
      availability: { ...goodOffer.availability, sevenDayRate: 0.2 },
    };
    const unrelated = {
      ...goodOffer,
      id: "unrelated",
      standardModelId: "other",
      combinedRate: 0.001,
      lastVerifiedAt: new Date(now).toISOString(),
      availability: { ...goodOffer.availability, sevenDayRate: 1 },
    };
    const stations = [
      {
        ...template,
        id: "bad",
        slug: "bad",
        name: "A bad",
        lastUpdatedAt: unrelated.lastVerifiedAt,
        offers: [unrelated, badOffer],
        prices: [unrelated, badOffer],
      },
      {
        ...template,
        id: "good",
        slug: "good",
        name: "Z good",
        offers: [goodOffer],
        prices: [goodOffer],
      },
    ];
    const repository = createTransitRepository({ fixture: stations });
    for (const sort of ["rate", "stability", "updated", "overall"]) {
      const result = await repository.list({ model: "selected", sort });
      expect(result.items[0].id).toBe("good");
      expect(result.items[1].offerCount).toBe(2);
    }
  });
  it("does not refresh old offer verification just by rebuilding its generation", () => {
    const now = new Date();
    const station = getSyntheticTransitStations()[0];
    station.dataStatus = "verified";
    station.offers = [
      {
        ...station.offers[0],
        lastVerifiedAt: new Date(
          now.getTime() - 40 * 24 * 3600000,
        ).toISOString(),
      },
    ];
    station.prices = station.offers;
    const model = normalizeTransitDatabaseSnapshot(
      { stations: [station], generatedAt: now.toISOString() },
      { now },
    );
    expect(model?.stations[0].offers[0].status).toBe("unknown");
  });
  it("bounds list previews while preserving full detail catalogues and matching offers", async () => {
    const station = getSyntheticTransitStations()[0];
    station.offers = Array.from({ length: 100 }, (_, index) => ({
      ...station.offers[0],
      id: `offer-${index}`,
      standardModelId: `model-${index}`,
      standardModelLabel: `Model ${index}`,
    }));
    station.prices = station.offers;
    const repository = createTransitRepository({ fixture: [station] });
    const list = await repository.list();
    expect(list.items[0].offers).toHaveLength(5);
    expect(list.items[0].prices).toHaveLength(5);
    expect(list.items[0].offerCount).toBe(100);
    expect(list.items[0].offersTruncated).toBe(true);
    expect((await repository.getBySlug(station.slug))?.offers).toHaveLength(
      100,
    );
    expect(
      (await repository.list({ model: "model-99" })).items[0].offers[0].id,
    ).toBe("offer-99");
    expect(
      (await repository.list({ q: station.name, model: "model-99" })).items[0]
        .offers[0].id,
    ).toBe("offer-99");
  });
  it("retains explicit degraded status and independently marks old generations stale", () => {
    const stations = [
      { ...getSyntheticTransitStations()[0], dataStatus: "verified" },
    ];
    const now = new Date();
    for (const input of [
      { stations, generatedAt: now.toISOString(), dataStatus: "degraded" },
      {
        stations,
        generatedAt: new Date(now.getTime() - 37 * 3600000).toISOString(),
        dataStatus: "verified",
      },
    ]) {
      const model = normalizeTransitDatabaseSnapshot(input, { now });
      expect(model?.dataStatus).toBe("degraded");
      expect(model?.degraded).toBe(true);
      expect(model?.warning).toContain("outdated");
    }
  });
  it("keeps station ID and slug namespaces separate", () => {
    const template = getSyntheticTransitStations()[0];
    const model = normalizeTransitDatabaseSnapshot({
      stations: [
        {
          ...template,
          id: "alpha",
          slug: "first",
          dataStatus: "pending_review",
        },
        { ...template, id: "second", slug: "alpha", dataStatus: "verified" },
      ],
    });
    expect(model?.stations).toHaveLength(2);
    expect(model?.stations[1].slug).toBe("alpha");
  });
  it("indexes availability scopes in linear passes instead of scanning every sample per offer", () => {
    const checkedAt = new Date().toISOString();
    let stationKeyReads = 0;
    const template = getSyntheticTransitStations()[0];
    const stations = Array.from({ length: 200 }, (_, index) => ({
      ...template,
      id: `station-${index}`,
      slug: `station-${index}`,
      offers: [],
      prices: [],
    }));
    const offers = stations.map((station, index) => ({
      ...template.offers[0],
      id: `offer-${index}`,
      stationId: station.id,
      availability: undefined,
    }));
    const availabilitySamples = stations.map((station, index) => ({
      get stationId() {
        stationKeyReads++;
        return station.id;
      },
      offerId: `offer-${index}`,
      scope: "offer",
      matchLevel: "exact",
      success: true,
      checkedAt,
      sourceType: "authorized_probe",
      sourceUrl: "https://example.com/status",
    }));
    const model = normalizeTransitDatabaseSnapshot({
      stations,
      offers,
      availabilitySamples,
    });
    expect(model?.stations).toHaveLength(200);
    expect(model?.stations[199].offers[0].availability.sevenDaySamples).toBe(1);
    expect(stationKeyReads).toBeLessThan(1000);
  });
  it("returns an explicitly marked synthetic fixture without a loader", async () => {
    const repository = createTransitRepository({
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });
    const snapshot = await repository.load();
    expect(snapshot.origin).toBe("synthetic_fixture");
    expect(snapshot.isSynthetic).toBe(true);
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.stations).toHaveLength(3);
    const result = await repository.list({ limit: 10 });
    expect(result.items.map((station) => station.slug)).toEqual([
      "synthetic-token",
      "synthetic-fixed",
    ]);
    expect(result.total).toBe(2);
  });

  it("hydrates a future DB adapter shape and aggregates availability samples", async () => {
    const loaded = {
      generation_id: "db-generation-1",
      generated_at: "2026-02-01T00:00:00Z",
      data_status: "verified",
      stations: [
        {
          id: "db-station",
          slug: "db-station",
          name: "DB Station",
          website_url: "https://db.example.test",
          status: "active",
          source_type: "manual_snapshot",
          data_status: "verified",
          channel_types: ["official_api"],
          account_pools: ["official_api"],
          risk_labels: [],
          summary: "Loaded from injected adapter",
          last_updated_at: "2026-02-01T00:00:00Z",
          offers: [
            {
              id: "db-offer",
              family: "gpt",
              standard_model_id: "gpt-demo",
              standard_model_label: "Demo GPT",
              group_name: "default",
              billing_mode: "token",
              recharge_ratio: "1:2",
              model_multiplier: "0.5",
              currency: "CNY",
              account_pool: "official_api",
              channel_type: "official_api",
              price_source_url: "https://db.example.test/pricing",
              last_verified_at: "2026-02-01T00:00:00Z",
            },
          ],
        },
      ],
      availability_samples: [
        {
          station_id: "db-station",
          offer_id: "db-offer",
          success: true,
          latency_ms: 100,
          checked_at: "2026-01-31T00:00:00Z",
          source_type: "manual_snapshot",
          source_url: "https://db.example.test/status",
        },
        {
          station_id: "db-station",
          offer_id: "db-offer",
          success: false,
          latency_ms: 200,
          checked_at: "2026-02-01T00:00:00Z",
          source_type: "manual_snapshot",
          source_url: "https://db.example.test/status",
        },
      ],
    };
    const repository = createTransitRepository({
      databaseLoader: async () => loaded,
      now: () => new Date("2026-02-01T00:00:00Z"),
    });
    const snapshot = await repository.load();
    expect(snapshot.origin).toBe("database");
    expect(snapshot.generationId).toBe("db-generation-1");
    expect(snapshot.stations[0].offers[0].combinedRate).toBeCloseTo(0.25);
    expect(
      snapshot.stations[0].offers[0].availability.sevenDayRate,
    ).toBeCloseTo(0.5);
    expect(snapshot.stations[0].offers[0].availability.sevenDaySamples).toBe(2);
    expect((await repository.getBySlug("db-station"))?.name).toBe("DB Station");
  });

  it("accepts the public-data snapshot naming and keeps station samples scoped", () => {
    const model = normalizeTransitDatabaseSnapshot({
      schemaVersion: 1,
      domain: "transit",
      generatedAt: "2026-02-01T00:00:00Z",
      sourceCount: 1,
      stations: [
        {
          id: "snapshot-station",
          slug: "snapshot-station",
          name: "Snapshot Station",
          websiteUrl: "https://snapshot.example.test",
          status: "active",
          dataStatus: "verified",
          stationSystem: "new_api",
          operatorType: "company",
          commercialRelation: "none",
          summary: "Public snapshot shape",
          channelTypes: ["official_api"],
          accountPools: ["official_api"],
          paymentMethods: [],
          riskLabels: [],
          usageAdvice: ["cautious"],
          sourceType: "manual_snapshot",
          sourceUrl: "https://snapshot.example.test/source",
          lastUpdatedAt: "2026-02-01T00:00:00Z",
        },
      ],
      offers: [
        {
          id: "snapshot-offer",
          stationId: "snapshot-station",
          family: "gpt",
          standardModel: "gpt-demo",
          groupName: "default",
          billingMode: "token",
          currency: "CNY",
          rechargeRatio: 0.5,
          modelMultiplier: 0.4,
          accountPool: "official_api",
          channelType: "official_api",
          priceSourceUrl: "https://snapshot.example.test/pricing",
          status: "verified",
          availability: {},
        },
      ],
      availabilitySamples: [
        {
          id: "snapshot-sample",
          stationId: "snapshot-station",
          offerId: "snapshot-offer",
          scope: "offer",
          standardModel: "gpt-demo",
          groupName: "default",
          sourceType: "authorized_probe",
          sourceUrl: "https://snapshot.example.test/status",
          matchLevel: "exact",
          success: true,
          latencyMs: 100,
          sampleCount: 1,
          checkedAt: "2026-02-01T00:00:00Z",
        },
      ],
    });
    expect(model?.stations[0].usageAdvice).toBe("cautious");
    expect(model?.stations[0].offers[0].standardModelId).toBe("gpt-demo");
    expect(model?.stations[0].offers[0].rechargeCoefficient).toBe(0.5);
    expect(model?.stations[0].offers[0].combinedRate).toBeCloseTo(0.2);
    // This historical sample is outside the rolling seven-day window.
    expect(model?.stations[0].offers[0].availability.sevenDayRate).toBeNull();
    expect(model?.stations[0].availability.sevenDaySamples).toBe(0);
  });

  it("keeps the last good generation when a later DB refresh fails or is empty", async () => {
    let calls = 0;
    const good = {
      stations: [
        {
          ...getSyntheticTransitStations()[0],
          synthetic: false,
          sourceType: "manual_snapshot",
          dataStatus: "verified",
        },
      ],
      generationId: "good-generation",
      generatedAt: "2026-02-01T00:00:00Z",
      dataStatus: "verified",
    };
    const repository = createTransitRepository({
      cacheTtlMs: 0,
      databaseLoader: async () => {
        calls += 1;
        if (calls === 1) return good;
        if (calls === 2) return { stations: [] };
        throw new Error("table does not exist");
      },
    });
    const first = await repository.load();
    expect(first.origin).toBe("database");
    const empty = await repository.load();
    expect(empty.generationId).toBe("good-generation");
    expect(empty.degraded).toBe(true);
    expect(empty.dataStatus).toBe("degraded");
    expect(empty.fallbackReason).toBe("database_empty");
    const failed = await repository.load({ forceRefresh: true });
    expect(failed.generationId).toBe("good-generation");
    expect(failed.fallbackReason).toBe("database_unavailable");
  });

  it("expires verification in last-good fallbacks during prolonged outages", async () => {
    let now = new Date("2026-09-06T00:00:00Z");
    let unavailable = false;
    const station = getSyntheticTransitStations()[0];
    station.synthetic = false;
    station.dataStatus = "verified";
    station.offers = [
      {
        ...station.offers[0],
        status: "verified",
        lastVerifiedAt: now.toISOString(),
      },
    ];
    const repository = createTransitRepository({
      cacheTtlMs: 0,
      now: () => now,
      databaseLoader: async () => {
        if (unavailable) throw new Error("offline");
        return { generatedAt: now.toISOString(), stations: [station] };
      },
    });
    expect((await repository.load()).stations[0].offers[0].status).toBe(
      "verified",
    );
    unavailable = true;
    now = new Date("2026-09-08T00:00:00Z");
    const fallback = await repository.load();
    expect(fallback.degraded).toBe(true);
    expect(fallback.stations[0].offers[0].status).toBe("unknown");
    expect((await repository.list()).items[0].offers).toEqual([]);
  });

  it.each(["window", "explicit"])(
    "expires station and nested availability at the %s boundary",
    async (boundary) => {
      let now = new Date("2026-09-06T00:00:00Z");
      const sampleAt = new Date(
        now.getTime() -
          (boundary === "window" ? 7 * 86400000 - 3600000 : 60000),
      ).toISOString();
      let unavailable = false;
      const station = getSyntheticTransitStations()[0];
      station.synthetic = false;
      station.dataStatus = "verified";
      station.availability = {
        ...station.availability,
        sevenDayRate: 1,
        sevenDaySamples: 1,
        firstCheckedAt: sampleAt,
        lastCheckedAt: sampleAt,
        expiresAt:
          boundary === "explicit"
            ? new Date(now.getTime() + 3600000).toISOString()
            : null,
        recentSamples: [{ ok: true, checkedAt: sampleAt, latencyMs: 100 }],
      };
      station.offers = [
        {
          ...station.offers[0],
          status: "verified",
          lastVerifiedAt: now.toISOString(),
          availability: {
            ...station.availability,
            scope: "offer",
            matchLevel: "exact",
          },
        },
      ];
      const repository = createTransitRepository({
        cacheTtlMs: 0,
        now: () => now,
        databaseLoader: async () => {
          if (unavailable) throw new Error("offline");
          return { generatedAt: now.toISOString(), stations: [station] };
        },
      });
      const first = await repository.load();
      expect(first.stations[0].availability.sevenDaySamples).toBe(1);
      expect(first.stations[0].offers[0].availability.sevenDaySamples).toBe(1);
      unavailable = true;
      now = new Date(now.getTime() + 2 * 3600000);
      const fallback = await repository.load();
      expect(fallback.stations[0].offers[0].status).toBe("verified");
      for (const evidence of [
        fallback.stations[0].availability,
        fallback.stations[0].offers[0].availability,
      ]) {
        expect(evidence.sevenDayRate).toBeNull();
        expect(evidence.sevenDaySamples).toBe(0);
        expect(evidence.recentSamples).toEqual([]);
      }
    },
  );

  it("can disable synthetic fallback for a production-only route", async () => {
    const repository = createTransitRepository({
      allowSyntheticFixture: false,
      databaseLoader: async () => ({ stations: [] }),
    });
    const snapshot = await repository.load();
    expect(snapshot.stations).toEqual([]);
    expect(snapshot.isSynthetic).toBe(false);
    expect(snapshot.degraded).toBe(true);
    expect((await repository.list()).items).toEqual([]);
  });

  it("normalizes individual rows and rejects unsafe URLs without throwing", () => {
    const availability = normalizeTransitAvailability({
      seven_day_rate: 96,
      seven_day_samples: "10",
      checked_at: "2026-02-01T00:00:00Z",
      source_type: "manual_snapshot",
      source_url: "https://example.test/status",
    });
    expect(availability.sevenDayRate).toBeCloseTo(0.96);
    expect(
      normalizeTransitOffer(
        {
          standard_model_id: "demo",
          billing_mode: "fixed",
          fixed_price: 1,
          fixed_price_unit: "request",
          currency: "CNY",
          price_source_url: "javascript:alert(1)",
        },
        "station",
      )?.combinedRate,
    ).toBeNull();
    expect(
      normalizeTransitDatabaseSnapshot({
        stations: [{ id: "bad", name: "Bad", website_url: "file:///tmp/x" }],
      }),
    ).toBeNull();
  });

  it("exposes a safe module-level detail helper and can reset it", async () => {
    resetDefaultTransitRepository();
    expect(await getTransitStationBySlug("synthetic-token")).not.toBeNull();
    resetDefaultTransitRepository();
    expect(await getTransitStationBySlug("missing")).toBeNull();
  });
});
