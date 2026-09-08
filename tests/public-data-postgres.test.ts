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
import { PUBLIC_DATA_LIMITS } from "@/lib/public-data/limits";
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
let generationClock = Date.parse(now);
// Ordinary replacement tests represent distinct, ordered upstream batches.
// Timestamp/replay tests call the real publishers directly instead.
function nextGeneration<T extends { generatedAt: string }>(snapshot: T): T {
  snapshot.generatedAt = new Date(++generationClock).toISOString();
  return snapshot;
}
const publishNextChannelSnapshot = (
  snapshot: Parameters<typeof publishChannelSnapshot>[0],
) => publishChannelSnapshot(nextGeneration(snapshot));
const publishNextTransitSnapshot = (
  snapshot: Parameters<typeof publishTransitSnapshot>[0],
) => publishTransitSnapshot(nextGeneration(snapshot));
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
    const [lineageColumn] =
      await connection.client`select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='channel_public_offers' and column_name='first_seen_at'`;
    if (!lineageColumn.count) {
      const migration = await readFile(
        new URL(
          "../drizzle/0013_channel_first_seen_lineage.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await connection.client.unsafe(statement);
    }
    const [baselineTable] =
      await connection.client`select to_regclass('public.public_offer_baselines') as name`;
    if (!baselineTable.name) {
      const migration = await readFile(
        new URL("../drizzle/0014_public_offer_baselines.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await connection.client.unsafe(statement);
    }
    const [sourceVersionsColumn] =
      await connection.client`select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='public_data_generations' and column_name='source_versions'`;
    if (!sourceVersionsColumn.count) {
      const migration = await readFile(
        new URL(
          "../drizzle/0015_source_versions_and_product_identities.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await connection.client.unsafe(statement);
    }
  });
  beforeEach(async () => {
    await connection.client`truncate public_offer_baselines, channel_offer_observations, channel_public_offers, channel_products, channel_merchants, transit_availability_samples, transit_offers, transit_stations, public_data_generations`;
  });
  afterAll(async () => {
    await closeDatabase();
    await connection?.client.end({ timeout: 5 });
    vi.unstubAllEnvs();
  });

  it("keeps per-source generations independent and unchanged polls idempotent", async () => {
    const snapshot = transit();
    snapshot.availabilitySamples = [];
    snapshot.stations.push({
      ...snapshot.stations[0],
      id: "second",
      slug: "second",
    });
    snapshot.offers.push({
      ...snapshot.offers[0],
      id: "second-offer",
      stationId: "second",
    });
    snapshot.sourceGenerations = snapshot.stations.map((station) => ({
      stationId: station.id,
      generatedAt: now,
    }));
    const first = await publishTransitSnapshot(snapshot);
    const poll = structuredClone(snapshot);
    poll.stations.forEach((station) => {
      station.lastCollectedAt = new Date(Date.parse(now) + 1000).toISOString();
    });
    expect((await publishTransitSnapshot(poll)).published).toBe(false);
    poll.stations.reverse();
    poll.offers.reverse();
    poll.sourceGenerations!.reverse();
    expect((await publishTransitSnapshot(poll)).generationId).toBe(
      first.generationId,
    );
    const newer = structuredClone(snapshot);
    newer.sourceGenerations![1].generatedAt = new Date(
      Date.parse(now) + 60000,
    ).toISOString();
    newer.stations[1].lastUpdatedAt = newer.sourceGenerations![1].generatedAt;
    newer.offers[1].lastVerifiedAt = newer.sourceGenerations![1].generatedAt;
    newer.offers[1].modelMultiplier = 2.1;
    const advanced = await publishTransitSnapshot(newer);
    expect(advanced.published).toBe(true);
    expect(advanced.generatedAt).toBe(now);
    await expect(publishTransitSnapshot(snapshot)).rejects.toThrow("regressed");
    const conflict = structuredClone(newer);
    conflict.offers[1].modelMultiplier = 2.2;
    await expect(publishTransitSnapshot(conflict)).rejects.toThrow("same time");
    await expect(
      publishTransitSnapshot({ ...newer, sourceGenerations: undefined }),
    ).rejects.toThrow("mode changed");
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.generationId).toBe(advanced.generationId);
  });
  it("retains product classification after removal and keeps pending-only products unpublished", async () => {
    const first = channels();
    first.products.push({
      ...first.products[0],
      id: "anchor-product",
      slug: "anchor-product",
    });
    first.offers.push({
      ...first.offers[0],
      id: "anchor",
      productId: "anchor-product",
      offerUrl: "https://example.com/anchor",
    });
    await publishNextChannelSnapshot(first);
    await publishNextChannelSnapshot({
      ...first,
      products: [first.products[1]],
      offers: [first.offers[1]],
    });
    const changed = structuredClone(first);
    changed.products[0].platform = "reassigned";
    await expect(publishNextChannelSnapshot(changed)).rejects.toThrow(
      "product identity changed",
    );
    changed.products[0] = first.products[0];
    changed.offers[0].status = "pending_review";
    await publishNextChannelSnapshot(changed);
    const read = await loadChannelSnapshotFromDatabase(connection.database);
    expect(
      read?.products?.find((product) => product.id === "product")?.reviewStatus,
    ).toBe("pending_review");
    expect(
      read?.products?.find((product) => product.id === "anchor-product")
        ?.reviewStatus,
    ).toBe("published");
  });
  it("rejects duplicate transit stable identities even with different offer IDs", async () => {
    const snapshot = transit();
    snapshot.offers.push({ ...snapshot.offers[0], id: "duplicate" });
    await expect(publishTransitSnapshot(snapshot)).rejects.toThrow(
      "Duplicate stable transit",
    );
    snapshot.offers[1].groupName = "different-group";
    await publishTransitSnapshot(snapshot);
  });

  it.each([
    "merchant-origin",
    "merchant-host",
    "product-platform",
    "product-type",
  ])("rejects channel entity reassignment: %s", async (field) => {
    const first = channels();
    const published = await publishNextChannelSnapshot(first);
    const changed = structuredClone(first);
    if (field === "merchant-origin")
      changed.merchants[0].websiteUrl = "https://another.example.org";
    if (field === "merchant-host")
      changed.merchants[0].host = "another.example.org";
    if (field === "product-platform")
      changed.products[0].platform = "another-platform";
    if (field === "product-type") changed.products[0].productType = "account";
    await expect(publishNextChannelSnapshot(changed)).rejects.toThrow(
      /Channel (merchant|product) identity changed/,
    );
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(published.generationId);
    const corrected = structuredClone(first);
    corrected.merchants[0].websiteUrl = "https://example.com/corrected-path";
    corrected.products[0].displayName = "Corrected display name";
    await publishNextChannelSnapshot(corrected);
  });
  it("rejects equal-time different-content conflicts while preserving exact replay", async () => {
    const channel = channels();
    const station = transit();
    const channelResult = await publishChannelSnapshot(channel);
    const transitResult = await publishTransitSnapshot(station);
    expect((await publishChannelSnapshot(channel)).published).toBe(false);
    expect((await publishTransitSnapshot(station)).published).toBe(false);
    const changedChannel = structuredClone(channel);
    changedChannel.offers[0].priceMinor = 1000;
    const changedTransit = structuredClone(station);
    changedTransit.offers[0].modelMultiplier = 2.1;
    await expect(publishChannelSnapshot(changedChannel)).rejects.toThrow(
      "same time",
    );
    await expect(publishTransitSnapshot(changedTransit)).rejects.toThrow(
      "same time",
    );
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(channelResult.generationId);
    expect(
      normalizeTransitDatabaseSnapshot(
        await loadTransitSnapshotFromDatabase(connection.database),
      )?.generationId,
    ).toBe(transitResult.generationId);
    await publishNextChannelSnapshot(changedChannel);
    await publishNextTransitSnapshot(changedTransit);
    await expect(publishChannelSnapshot(channel)).rejects.toThrow("older than");
    await expect(publishTransitSnapshot(station)).rejects.toThrow("older than");
  });

  it("retains immutable offer history through replacement, removal, and later republication", async () => {
    const a = channels();
    a.offers[0].id = "history-offer";
    a.offers[0].observedAt = new Date(Date.parse(now) - 3600000).toISOString();
    const first = await publishNextChannelSnapshot(a);
    const b = channels();
    b.offers[0].id = "history-offer";
    b.offers[0].priceMinor = 1290;
    await publishNextChannelSnapshot(b);
    const refreshed = await loadChannelSnapshotFromDatabase(
      connection.database,
    );
    expect(refreshed?.offers[0].firstSeenAt).toBe(a.offers[0].observedAt);
    expect(refreshed?.offers[0].observedAt).toBe(b.offers[0].observedAt);
    expect(refreshed?.merchants?.[0].lastReviewedAt ?? null).toBeNull();
    await publishNextChannelSnapshot(a);
    const replacement = channels();
    replacement.offers[0].id = "replacement-offer";
    await publishNextChannelSnapshot(replacement);
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
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(23001|23503)$/) });
    expect(
      await connection.client`select id from channel_offer_observations where offer_id='history-offer'`,
    ).toHaveLength(2);
  });
  it("preserves first-seen lineage across repeated accepted rekeys and reappearance", async () => {
    const first = channels();
    first.offers[0].observedAt = new Date(
      Date.parse(now) - 3600000,
    ).toISOString();
    await publishNextChannelSnapshot(first);
    for (const id of ["rekey-one", "rekey-two", "offer"]) {
      const next = channels();
      next.offers[0].id = id;
      await publishNextChannelSnapshot(next);
      const result = await loadChannelSnapshotFromDatabase(connection.database);
      expect(result?.offers[0].firstSeenAt).toBe(first.offers[0].observedAt);
      expect(result?.offers[0].observedAt).toBe(now);
    }
    const current = channels();
    current.offers.push({
      ...current.offers[0],
      id: "anchor",
      offerUrl: "https://example.com/anchor",
    });
    await publishNextChannelSnapshot(current);
    await publishNextChannelSnapshot({
      ...current,
      offers: [current.offers[1]],
    });
    // The old ID has no current predecessor; recover its retained lineage.
    await publishNextChannelSnapshot(current);
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))?.offers.find(
        (offer) => offer.id === "offer",
      )?.firstSeenAt,
    ).toBe(first.offers[0].observedAt);
  });
  it("recovers absent offers under new IDs using historical stable identity", async () => {
    const first = channels();
    first.offers[0].observedAt = new Date(
      Date.parse(now) - 3600000,
    ).toISOString();
    first.offers.push({
      ...first.offers[0],
      id: "anchor",
      offerUrl: "https://example.com/anchor",
    });
    await publishNextChannelSnapshot(first);
    await publishNextChannelSnapshot({ ...first, offers: [first.offers[1]] });
    const returned = channels();
    returned.offers[0].id = "new-returned-id";
    returned.offers.push(first.offers[1]);
    await publishNextChannelSnapshot(returned);
    const result = await loadChannelSnapshotFromDatabase(connection.database);
    expect(
      result?.offers.find((offer) => offer.id === "new-returned-id")
        ?.firstSeenAt,
    ).toBe(first.offers[0].observedAt);
  });
  it.each(["price", "currency", "bulk"])(
    "rejects returning channel %s anomalies using retained evidence",
    async (kind) => {
      const first = channels();
      first.offers[0].bulkPricingTiers = [
        { minQuantity: 2, priceMinor: 900, currency: "CNY" },
      ];
      first.offers.push({
        ...first.offers[0],
        id: "anchor",
        offerUrl: "https://example.com/anchor",
      });
      await publishNextChannelSnapshot(first);
      await publishNextChannelSnapshot({ ...first, offers: [first.offers[1]] });
      const returned = structuredClone(first);
      returned.offers[0].id = "returned-new-id";
      if (kind === "price") returned.offers[0].priceMinor = 99900;
      if (kind === "currency") returned.offers[0].currency = "USD";
      if (kind === "bulk")
        returned.offers[0].bulkPricingTiers[0].priceMinor = 99900;
      await expect(publishNextChannelSnapshot(returned)).rejects.toThrow(
        /price|currency/i,
      );
      expect(
