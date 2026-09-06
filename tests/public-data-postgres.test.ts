// @vitest-environment node
import { readFile } from "node:fs/promises";
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
import { isOfferAvailable } from "@/lib/channels/ranking";

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
});
