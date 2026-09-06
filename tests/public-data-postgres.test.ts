// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDatabase, createDatabaseConnection } from "@/lib/db/client";
import {
  channelSnapshotSchema,
  transitSnapshotSchema,
} from "@/lib/public-data/snapshot";
import {
  publishChannelSnapshot,
  publishTransitSnapshot,
} from "@/lib/public-data/persistence";
import { loadChannelSnapshotFromDatabase } from "@/lib/channels/repository";
import {
  loadTransitSnapshotFromDatabase,
  normalizeTransitDatabaseSnapshot,
} from "@/lib/transit/repository";
import {
  isOfferAvailable,
  isOfferEligibleForLowestPrice,
} from "@/lib/channels/ranking";

const testUrl = process.env.TEST_PUBLIC_DATA_DATABASE_URL;
const now = new Date().toISOString();
const channels = () =>
  channelSnapshotSchema.parse({
    schemaVersion: 1,
    domain: "channels",
    generatedAt: now,
    sourceCount: 1,
    merchants: [
      {
        id: "merchant",
        slug: "merchant",
        name: "Test merchant",
        host: "example.com",
        websiteUrl: "https://example.com",
        status: "active",
      },
    ],
    products: [
      {
        id: "product",
        slug: "product",
        displayName: "Test subscription",
        platform: "test",
        productType: "subscription",
      },
    ],
    offers: [
      {
        id: "offer",
        merchantId: "merchant",
        productId: "product",
        sourceName: "manual snapshot",
        sourceUrl: "https://example.com/pricing",
        title: "Test monthly",
        offerUrl: "https://example.com/buy",
        priceMinor: 990,
        currency: "CNY",
        availability: "in_stock",
        status: "verified",
        observedAt: now,
        lastSeenAt: now,
      },
    ],
  });
const transit = () =>
  transitSnapshotSchema.parse({
    schemaVersion: 1,
    domain: "transit",
    generatedAt: now,
    sourceCount: 1,
    stations: [
      {
        id: "station",
        slug: "station",
        name: "Test station",
        websiteUrl: "https://example.com",
        status: "active",
        dataStatus: "verified",
        commercialRelation: "none",
        sourceType: "manual_snapshot",
        sourceUrl: "https://example.com/pricing",
        lastUpdatedAt: now,
      },
    ],
    offers: [
      {
        id: "model-offer",
        stationId: "station",
        family: "test",
        standardModel: "test-model",
        groupName: "standard",
        billingMode: "token",
        currency: "USD",
        rechargeCoefficient: 0.1,
        modelMultiplier: 2,
        status: "verified",
        priceSourceUrl: "https://example.com/pricing",
        lastVerifiedAt: now,
      },
    ],
    availabilitySamples: [
      {
        id: "sample",
        stationId: "station",
        offerId: "model-offer",
        scope: "offer",
        sourceType: "authorized_probe",
        matchLevel: "exact",
        success: true,
        sampleCount: 1,
        checkedAt: now,
      },
    ],
  });

describe.skipIf(!testUrl)("public snapshots in disposable PostgreSQL", () => {
  let connection: ReturnType<typeof createDatabaseConnection>;
  beforeAll(async () => {
    const url = new URL(testUrl!);
    // Never execute test DDL or cleanup against an application database.
    if (
      url.hostname !== "127.0.0.1" ||
      url.pathname !== "/public_data_test" ||
      url.username !== "public_data_test"
    ) {
      throw new Error(
        "Integration tests require the dedicated loopback public_data_test database and role.",
      );
    }
    connection = createDatabaseConnection(testUrl!);
    vi.stubEnv("PUBLIC_DATA_DATABASE_URL", testUrl!);
    const [existing] =
      await connection.client`select to_regclass('public.public_data_generations') as name`;
    if (!existing.name) {
      const migration = await readFile(
        new URL("../drizzle/0009_white_white_tiger.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await connection.client.unsafe(statement);
      }
    }
    const indexMigration = await readFile(
      new URL("../drizzle/0010_fine_guardian.sql", import.meta.url),
      "utf8",
    );
    for (const statement of indexMigration.split("--> statement-breakpoint")) {
      if (statement.trim()) await connection.client.unsafe(statement);
    }
    const [historyColumn] =
      await connection.client`select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='channel_offer_observations' and column_name='offer_snapshot'`;
    if (!historyColumn.count) {
      const migration = await readFile(
        new URL(
          "../drizzle/0011_preserve_channel_observations.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await connection.client.unsafe(statement);
      }
    }
    const [sourceColumn] =
      await connection.client`select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='channel_public_offers' and column_name='source_type'`;
    if (!sourceColumn.count)
      await connection.client.unsafe(
        await readFile(
          new URL("../drizzle/0012_channel_source_type.sql", import.meta.url),
          "utf8",
        ),
      );
  });
  beforeEach(async () => {
    await connection.client`truncate channel_offer_observations, channel_public_offers, channel_products, channel_merchants, transit_availability_samples, transit_offers, transit_stations, public_data_generations`;
  });
  afterAll(async () => {
    await closeDatabase();
    await connection?.client.end({ timeout: 5 });
    vi.unstubAllEnvs();
  });

  it("retains immutable offer history through replacement, removal, and replay", async () => {
    const a = channels();
    a.offers[0].id = "history-offer";
    a.offers[0].observedAt = new Date(Date.parse(now) - 3600000).toISOString();
    const first = await publishChannelSnapshot(a);
    const b = channels();
    b.offers[0].id = "history-offer";
    b.offers[0].priceMinor = 1290;
    await publishChannelSnapshot(b);
    const refreshed = await loadChannelSnapshotFromDatabase(
      connection.database,
    );
    expect(refreshed?.offers[0].firstSeenAt).toBe(a.offers[0].observedAt);
    expect(refreshed?.offers[0].observedAt).toBe(b.offers[0].observedAt);
    expect(refreshed?.merchants?.[0].lastReviewedAt ?? null).toBeNull();
    await publishChannelSnapshot(a);
    const replacement = channels();
    replacement.offers[0].id = "replacement-offer";
    await publishChannelSnapshot(replacement);
    const current =
      await connection.client`select id from channel_public_offers where id='history-offer'`;
    expect(current).toHaveLength(0);
    const history =
      await connection.client`select price_minor, generation_id, offer_snapshot from channel_offer_observations where offer_id='history-offer' order by price_minor`;
    expect(history).toHaveLength(2);
    expect(history.map((row) => Number(row.price_minor))).toEqual([990, 1290]);
    expect(history[0].generation_id).toBe(first.generationId);
    expect(history[0].offer_snapshot).toMatchObject({
      title: "Test monthly",
      merchantName: "Test merchant",
      productName: "Test subscription",
      offerUrl: "https://example.com/buy",
    });
    await expect(
      connection.client`delete from public_data_generations where id=${first.generationId}`,
    ).rejects.toMatchObject({ code: "23001" });
    expect(
      await connection.client`select id from channel_offer_observations where offer_id='history-offer'`,
    ).toHaveLength(2);
  });

  it("preserves explicit source types independent of source labels", async () => {
    const snapshot = channels();
    snapshot.offers[0].sourceType = "authorized_feed";
    snapshot.offers[0].sourceName = "Capital Market";
    await publishChannelSnapshot(snapshot);
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))?.offers[0]
        .sourceType,
    ).toBe("authorized_feed");
  });

  it("rejects a nonempty partial channel corpus and lost merchant coverage", async () => {
    const snapshot = channels();
    snapshot.offers = Array.from({ length: 10 }, (_, index) => ({
      ...snapshot.offers[0],
      id: `offer-${index}`,
      offerUrl: `https://example.com/buy/${index}`,
    }));
    const initial = await publishChannelSnapshot(snapshot);
    await expect(
      publishChannelSnapshot({
        ...snapshot,
        offers: snapshot.offers.slice(0, 1),
      }),
    ).rejects.toThrow("collapsed");
    const changedMerchant = {
      ...snapshot,
      merchants: [{ ...snapshot.merchants[0], id: "different" }],
      offers: snapshot.offers.map((offer) => ({
        ...offer,
        merchantId: "different",
      })),
    };
    await expect(publishChannelSnapshot(changedMerchant)).rejects.toThrow(
      "collapsed",
    );
    const retained = await loadChannelSnapshotFromDatabase(connection.database);
    expect(retained?.generationId).toBe(initial.generationId);
    expect(retained?.offers).toHaveLength(10);
  });

  it("round-trips nullable channel fields, keeps repeat imports idempotent, and restores A after B", async () => {
    const a = channels();
    const first = await publishChannelSnapshot(a);
    const read = await loadChannelSnapshotFromDatabase(connection.database);
    expect(read?.merchants).toHaveLength(1);
    expect(read?.offers).toHaveLength(1);
    expect(read?.offers[0].priceMinor).toBe(990);
    expect(
      isOfferAvailable(read!.offers[0], { requireHealthySource: true }),
    ).toBe(true);
    expect((await publishChannelSnapshot(a)).published).toBe(false);
    const b = channels();
    b.offers[0].priceMinor = 1290;
    await publishChannelSnapshot(b);
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))?.offers[0]
        .priceMinor,
    ).toBe(1290);
    expect((await publishChannelSnapshot(a)).published).toBe(true);
    const restored = await loadChannelSnapshotFromDatabase(connection.database);
    expect(restored?.generationId).toBe(first.generationId);
    expect(restored?.offers[0].priceMinor).toBe(990);
  });

  it("rolls back a failed replacement after row deletion without corrupting the last snapshot", async () => {
    await publishChannelSnapshot(channels());
    const bad = channels();
    bad.products.push({
      ...bad.products[0],
      displayName: "Duplicate primary key",
    });
    await expect(publishChannelSnapshot(bad)).rejects.toThrow();
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))?.offers[0]
        .priceMinor,
    ).toBe(990);
    await expect(
      publishChannelSnapshot({ ...channels(), offers: [] }),
    ).rejects.toThrow("empty");
  });

  it("stores long non-compressible public search text without B-tree tuple failures", async () => {
    const snapshot = channels();
    snapshot.products[0].summary = randomBytes(1900).toString("hex");
    await expect(publishChannelSnapshot(snapshot)).resolves.toMatchObject({
      published: true,
    });
  });

  it("retains channel rows on invisible or read-incompatible refreshes and supports long source URLs", async () => {
    const snapshot = channels();
    snapshot.offers[0].sourceUrl = `https://example.com/${"a".repeat(1000)}`;
    snapshot.offers[0].offerUrl = `https://example.com/${"b".repeat(1000)}`;
    const published = await publishChannelSnapshot(snapshot);
    const read = await loadChannelSnapshotFromDatabase(connection.database);
    expect(read?.offers).toHaveLength(1);
    expect(read?.offers[0].sourceUrl).toBe(snapshot.offers[0].sourceUrl);
    for (const status of ["pending_review", "suspended"] as const) {
      const bad = channels();
      bad.merchants[0].status = status;
      await expect(publishChannelSnapshot(bad)).rejects.toThrow(
        "no public offers",
      );
      bad.merchants[0].status = "active";
      bad.offers[0].status = status;
      await expect(publishChannelSnapshot(bad)).rejects.toThrow(
        "no public offers",
      );
    }
    const bad = channels();
    bad.merchants[0].name = "a".repeat(161);
    await expect(publishChannelSnapshot(bad)).rejects.toThrow();
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(published.generationId);
  });

  it("round-trips transit prices and samples and restores a previous feed", async () => {
    const a = transit();
    await publishTransitSnapshot(a);
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.stations).toHaveLength(1);
    expect(read?.stations[0].offers[0].combinedRate).toBeCloseTo(0.2);
    expect(read?.stations[0].offers[0].availability.sevenDaySamples).toBe(1);
    expect((await publishTransitSnapshot(a)).published).toBe(false);
    const b = transit();
    b.offers[0].modelMultiplier = 3;
    await publishTransitSnapshot(b);
    expect((await publishTransitSnapshot(a)).published).toBe(true);
    const bad = transit();
    bad.availabilitySamples[0].offerId = "missing";
    await expect(publishTransitSnapshot(bad)).rejects.toThrow("unknown");
    const restored = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(restored?.stations[0].offers[0].combinedRate).toBeCloseTo(0.2);
  });

  it("retains transit rows on invisible or read-incompatible refreshes and parses textual recharge ratios", async () => {
    const snapshot = transit();
    snapshot.offers[0].rechargeCoefficient = null;
    snapshot.offers[0].rechargeRatio = "1:2";
    snapshot.stations[0].status = "unknown";
    const published = await publishTransitSnapshot(snapshot);
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.stations[0].offers[0].rechargeRatio).toBe(0.5);
    expect(read?.stations[0].offers[0].combinedRate).toBe(1);
    for (const bad of [
      {
        ...snapshot,
        stations: [
          { ...snapshot.stations[0], dataStatus: "pending_review" as const },
        ],
      },
      {
        ...snapshot,
        stations: [{ ...snapshot.stations[0], status: "unavailable" as const }],
      },
    ])
      await expect(publishTransitSnapshot(bad)).rejects.toThrow(
        "no public stations",
      );
    const bad = transit();
    bad.stations[0].name = "a".repeat(201);
    await expect(publishTransitSnapshot(bad)).rejects.toThrow();
    const retained = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(retained?.generationId).toBe(published.generationId);
  });

  it.each(["sub2api-public-v1", "imported-feed"])(
    "retains %s rows when a later catalogue collapses or omits a source",
    async (adapterVersion) => {
      const snapshot = transit();
      snapshot.stations[0].payload.adapterVersion = adapterVersion;
      snapshot.availabilitySamples = [];
      snapshot.offers = Array.from({ length: 10 }, (_, index) => ({
        ...snapshot.offers[0],
        id: `native-${index}`,
      }));
      await publishTransitSnapshot(snapshot);
      await expect(
        publishTransitSnapshot({
          ...snapshot,
          offers: snapshot.offers.slice(0, 5),
        }),
      ).rejects.toThrow("collapsed");
      await expect(
        publishTransitSnapshot({ ...snapshot, offers: [] }),
      ).rejects.toThrow("collapsed");
      await expect(
        publishTransitSnapshot({
          ...snapshot,
          stations: [{ ...snapshot.stations[0], id: "other-station" }],
          offers: [],
        }),
      ).rejects.toThrow("collapsed");
      const read = normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      );
      expect(read?.stations[0].offers).toHaveLength(10);
    },
  );
  it("rejects stale imported generations without replacing either domain", async () => {
    const channel = channels();
    const station = transit();
    const channelResult = await publishChannelSnapshot(channel);
    const transitResult = await publishTransitSnapshot(station);
    const generatedAt = new Date(Date.now() - 37 * 3600000).toISOString();
    await expect(
      publishChannelSnapshot({ ...channel, generatedAt }),
    ).rejects.toThrow("stale");
    await expect(
      publishTransitSnapshot({ ...station, generatedAt }),
    ).rejects.toThrow("stale");
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(channelResult.generationId);
    expect(
      normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      )?.generationId,
    ).toBe(transitResult.generationId);
  });
  it("rejects a delayed but recent generation under the publication lock", async () => {
    const channel = channels();
    const station = transit();
    const channelResult = await publishChannelSnapshot(channel);
    const stationResult = await publishTransitSnapshot(station);
    const generatedAt = new Date(Date.parse(now) - 60000).toISOString();
    await expect(
      publishChannelSnapshot({ ...channel, generatedAt }),
    ).rejects.toThrow("older than");
    await expect(
      publishTransitSnapshot({ ...station, generatedAt }),
    ).rejects.toThrow("older than");
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(channelResult.generationId);
    expect(
      normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      )?.generationId,
    ).toBe(stationResult.generationId);
  });
  it("rejects price anomalies and unit changes without replacing current data", async () => {
    const channel = channels();
    const station = transit();
    station.offers[0].inputPrice = 1e-8;
    const channelResult = await publishChannelSnapshot(channel);
    const transitResult = await publishTransitSnapshot(station);
    for (const priceMinor of [0, 1980, null])
      await expect(
        publishChannelSnapshot({
          ...channel,
          offers: [{ ...channel.offers[0], priceMinor }],
        }),
      ).rejects.toThrow("Price anomaly");
    await expect(
      publishChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[0], currency: "USD" }],
      }),
    ).rejects.toThrow("currency changed");
    for (const inputPrice of [0, 2e-8, null])
      await expect(
        publishTransitSnapshot({
          ...station,
          offers: [{ ...station.offers[0], inputPrice }],
        }),
      ).rejects.toThrow("Price anomaly");
    await expect(
      publishTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], modelMultiplier: 4 }],
      }),
    ).rejects.toThrow("Price anomaly");
    await expect(
      publishTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], currency: "CNY" }],
      }),
    ).rejects.toThrow("units changed");
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(channelResult.generationId);
    expect(
      normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      )?.generationId,
    ).toBe(transitResult.generationId);
    await expect(
      publishChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[0], priceMinor: 1485 }],
      }),
    ).resolves.toMatchObject({ published: true });
    await expect(
      publishTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], modelMultiplier: 3 }],
      }),
    ).resolves.toMatchObject({ published: true });
  });
  it("keeps anomaly checks across ID changes and rejects wholesale identity churn", async () => {
    const channel = channels();
    const station = transit();
    const channelResult = await publishChannelSnapshot(channel);
    const transitResult = await publishTransitSnapshot(station);
    await expect(
      publishChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[0], id: "new-id", priceMinor: 9000 }],
      }),
    ).rejects.toThrow("Price anomaly");
    await expect(
      publishTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], id: "new-id", modelMultiplier: 20 }],
        availabilitySamples: [],
      }),
    ).rejects.toThrow("Price anomaly");
    await expect(
      publishChannelSnapshot({
        ...channel,
        offers: [
          {
            ...channel.offers[0],
            id: "new-id",
            offerUrl: "https://example.com/different",
            priceMinor: 9000,
          },
        ],
      }),
    ).rejects.toThrow("identity overlap");
    await expect(
      publishTransitSnapshot({
        ...station,
        offers: [
          {
            ...station.offers[0],
            id: "new-id",
            standardModel: "renamed-model",
            modelMultiplier: 20,
          },
        ],
        availabilitySamples: [],
      }),
    ).rejects.toThrow("identity overlap");
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(channelResult.generationId);
    expect(
      normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      )?.generationId,
    ).toBe(transitResult.generationId);
  });
  it("validates bulk-tier changes even with an unchanged headline price", async () => {
    const snapshot = channels();
    snapshot.offers[0].bulkPricingTiers = [
      { minQuantity: 10, priceMinor: 900, currency: "CNY" },
    ];
    const initial = await publishChannelSnapshot(snapshot);
    for (const tier of [
      { minQuantity: 10, priceMinor: 9000, currency: "CNY" },
      { minQuantity: 10, priceMinor: 900, currency: "USD" },
      { minQuantity: 20, priceMinor: 9000, currency: "CNY" },
    ])
      await expect(
        publishChannelSnapshot({
          ...snapshot,
          offers: [{ ...snapshot.offers[0], bulkPricingTiers: [tier] }],
        }),
      ).rejects.toThrow();
    await expect(
      publishChannelSnapshot({
        ...snapshot,
        offers: [
          {
            ...snapshot.offers[0],
            bulkPricingTiers: [
              ...snapshot.offers[0].bulkPricingTiers,
              ...snapshot.offers[0].bulkPricingTiers,
            ],
          },
        ],
      }),
    ).rejects.toThrow("unique");
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(initial.generationId);
  });
  it("rejects disappearance of publishable offers even when raw counts stay constant", async () => {
    const snapshot = transit();
    snapshot.availabilitySamples = [];
    const initial = await publishTransitSnapshot(snapshot);
    for (const status of ["pending_review", "unknown", "unavailable"] as const)
      await expect(
        publishTransitSnapshot({
          ...snapshot,
          offers: [{ ...snapshot.offers[0], status }],
        }),
      ).rejects.toThrow("collapsed");
    for (const lastVerifiedAt of [
      null,
      new Date(Date.now() - 40 * 3600000).toISOString(),
    ])
      await expect(
        publishTransitSnapshot({
          ...snapshot,
          offers: [{ ...snapshot.offers[0], lastVerifiedAt }],
        }),
      ).rejects.toThrow("collapsed");
    expect(
      normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      )?.generationId,
    ).toBe(initial.generationId);
    const channel = channels();
    channel.offers = Array.from({ length: 10 }, (_, index) => ({
      ...channel.offers[0],
      id: `offer-${index}`,
    }));
    await publishChannelSnapshot(channel);
    await expect(
      publishChannelSnapshot({
        ...channel,
        offers: channel.offers.map((offer, index) => ({
          ...offer,
          status: index ? "pending_review" : "verified",
        })),
      }),
    ).rejects.toThrow("collapsed");
  });
  it("keeps stale channel observations out of current lowest-price rankings", async () => {
    const snapshot = channels();
    snapshot.offers[0].lastSeenAt = new Date(
      Date.now() - 40 * 24 * 3600000,
    ).toISOString();
    snapshot.offers[0].observedAt = snapshot.offers[0].lastSeenAt;
    const published = await publishChannelSnapshot(snapshot);
    const read = await loadChannelSnapshotFromDatabase(connection.database);
    expect(read?.offers[0].sourceHealth).toBe("unknown");
    expect(isOfferEligibleForLowestPrice(read!.offers[0])).toBe(false);
    snapshot.generatedAt = new Date(Date.now() + 3600000).toISOString();
    await expect(publishChannelSnapshot(snapshot)).rejects.toThrow();
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(published.generationId);
    const futureTransit = transit();
    futureTransit.generatedAt = snapshot.generatedAt;
    await expect(publishTransitSnapshot(futureTransit)).rejects.toThrow();
  });
  it("rejects computed or textual ratios that would round to zero before replacement", async () => {
    const prior = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    const tiny = transit();
    tiny.offers[0].rechargeCoefficient = 1e-8;
    tiny.offers[0].modelMultiplier = 1e-8;
    await expect(publishTransitSnapshot(tiny)).rejects.toThrow();
    tiny.offers[0].rechargeRatio = "1:10000000000";
    await expect(publishTransitSnapshot(tiny)).rejects.toThrow();
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.generationId).toBe(prior?.generationId);
  });
});
