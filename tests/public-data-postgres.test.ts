// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    await connection.client`truncate channel_offer_observations, channel_public_offers, channel_products, channel_merchants, transit_availability_samples, transit_offers, transit_stations, public_data_generations`;
  });
  afterAll(async () => {
    await closeDatabase();
    await connection?.client.end({ timeout: 5 });
    vi.unstubAllEnvs();
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

  it("retains original-source rows when a later catalogue collapses", async () => {
    const snapshot = transit();
    snapshot.stations[0].payload.adapterVersion = "sub2api-public-v1";
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
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.stations[0].offers).toHaveLength(10);
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
