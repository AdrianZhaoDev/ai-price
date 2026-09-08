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
    ).rejects.toMatchObject({ code: "23503" });
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
        (
          await loadChannelSnapshotFromDatabase(connection.database)
        )?.offers.map((offer) => offer.id),
      ).toEqual(["anchor"]);
    },
  );
  it.each(["price", "currency", "multiplier"])(
    "rejects returning transit %s anomalies using retained evidence",
    async (kind) => {
      const first = transit();
      first.availabilitySamples = [];
      first.offers[0].inputPrice = 1;
      first.offers.push({
        ...first.offers[0],
        id: "anchor",
        standardModel: "anchor",
      });
      await publishNextTransitSnapshot(first);
      await publishNextTransitSnapshot({ ...first, offers: [first.offers[1]] });
      const returned = structuredClone(first);
      returned.offers[0].id = "returned-new-id";
      if (kind === "price") returned.offers[0].inputPrice = 99;
      if (kind === "currency") returned.offers[0].currency = "CNY";
      if (kind === "multiplier") returned.offers[0].modelMultiplier = 99;
      await expect(publishNextTransitSnapshot(returned)).rejects.toThrow(
        /price|units/i,
      );
      const [count] =
        await connection.client`select count(*)::int as count from transit_offers`;
      expect(count.count).toBe(1);
      await publishNextTransitSnapshot({
        ...returned,
        offers: [
          { ...first.offers[0], id: "returned-new-id" },
          first.offers[1],
        ],
      });
    },
  );
  it("rejects same-ID channel and transit identity reassignment before baselines can be overwritten", async () => {
    const first = channels();
    first.offers.push({
      ...first.offers[0],
      id: "anchor",
      offerUrl: "https://example.com/anchor",
    });
    await publishNextChannelSnapshot(first);
    const changed = structuredClone(first);
    changed.offers[0].offerUrl = "https://example.com/changed";
    await expect(publishNextChannelSnapshot(changed)).rejects.toThrow(
      /stable identity changed/,
    );
    await publishNextChannelSnapshot({ ...first, offers: [first.offers[1]] });
    await expect(publishNextChannelSnapshot(changed)).rejects.toThrow(
      /stable identity changed/,
    );
    changed.offers[0] = {
      ...first.offers[0],
      id: "new-return",
      priceMinor: 99900,
    };
    await expect(publishNextChannelSnapshot(changed)).rejects.toThrow(
      /price anomaly/i,
    );
    const model = transit();
    model.availabilitySamples = [];
    model.offers.push({
      ...model.offers[0],
      id: "anchor-model",
      standardModel: "anchor",
    });
    await publishNextTransitSnapshot(model);
    const moved = structuredClone(model);
    moved.offers[0].groupName = "moved-group";
    await expect(publishNextTransitSnapshot(moved)).rejects.toThrow(
      /stable identity changed/,
    );
    await publishNextTransitSnapshot({ ...model, offers: [model.offers[1]] });
    await expect(publishNextTransitSnapshot(moved)).rejects.toThrow(
      /stable identity changed/,
    );
    moved.offers[0] = {
      ...model.offers[0],
      id: "new-return",
      modelMultiplier: 999,
    };
    await expect(publishNextTransitSnapshot(moved)).rejects.toThrow(
      /price anomaly/i,
    );
  });
  it("rejects historical IDs reused by stable-key matches in both domains", async () => {
    const channel = channels();
    channel.offers.push({
      ...channel.offers[0],
      id: "anchor",
      offerUrl: "https://example.com/anchor",
    });
    await publishNextChannelSnapshot(channel);
    await publishNextChannelSnapshot({
      ...channel,
      offers: [channel.offers[1]],
    });
    const channelBaseline =
      await connection.client`select identity, payload from public_offer_baselines where domain='channels' and offer_id='offer'`;
    await expect(
      publishNextChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[1], id: "offer" }],
      }),
    ).rejects.toThrow(/stable identity changed/);
    expect(
      await connection.client`select identity, payload from public_offer_baselines where domain='channels' and offer_id='offer'`,
    ).toEqual(channelBaseline);

    const model = transit();
    model.availabilitySamples = [];
    model.offers.push({
      ...model.offers[0],
      id: "anchor",
      standardModel: "anchor",
    });
    await publishNextTransitSnapshot(model);
    await publishNextTransitSnapshot({ ...model, offers: [model.offers[1]] });
    const transitBaseline =
      await connection.client`select identity, payload from public_offer_baselines where domain='transit' and offer_id='model-offer'`;
    await expect(
      publishNextTransitSnapshot({
        ...model,
        offers: [{ ...model.offers[1], id: "model-offer" }],
      }),
    ).rejects.toThrow(/stable identity changed/);
    expect(
      await connection.client`select identity, payload from public_offer_baselines where domain='transit' and offer_id='model-offer'`,
    ).toEqual(transitBaseline);
  });
  it.each(["websiteUrl", "sourceUrl", "apiBaseUrl"] as const)(
    "pins station %s origins while allowing same-origin path corrections",
    async (field) => {
      const first = transit();
      first.stations[0].apiBaseUrl = "https://example.com/v1";
      await publishNextTransitSnapshot(first);
      const moved = structuredClone(first);
      moved.stations[0][field] = "https://another.example.org/pricing";
      await expect(publishNextTransitSnapshot(moved)).rejects.toThrow(
        /station source identity changed/i,
      );
      const [retained] =
        await connection.client`select website_url, source_url, api_base_url from transit_stations where id='station'`;
      expect(retained).toMatchObject({
        website_url: first.stations[0].websiteUrl,
        source_url: first.stations[0].sourceUrl,
        api_base_url: first.stations[0].apiBaseUrl,
      });
      moved.stations[0][field] = "https://example.com/corrected-path";
      await publishNextTransitSnapshot(moved);
    },
  );
  it("rejects oversized generations before publication or full hydration", async () => {
    const channel = channels();
    const oversizedChannel = {
      ...channel,
      offers: Array(PUBLIC_DATA_LIMITS.channelOffers + 1).fill(
        channel.offers[0],
      ),
    };
    expect(channelSnapshotSchema.safeParse(oversizedChannel).success).toBe(
      false,
    );
    const model = transit();
    expect(
      transitSnapshotSchema.safeParse({
        ...model,
        availabilitySamples: Array(PUBLIC_DATA_LIMITS.samples + 1).fill(
          model.availabilitySamples[0],
        ),
      }).success,
    ).toBe(false);
    await publishNextChannelSnapshot(channel);
    await publishNextTransitSnapshot(model);
    await connection.client`insert into channel_public_offers select (jsonb_populate_record(null::channel_public_offers, to_jsonb(o) || jsonb_build_object('id', 'extra-' || n))).* from channel_public_offers o cross join generate_series(1, ${PUBLIC_DATA_LIMITS.channelOffers}) n where o.id='offer'`;
    await connection.client`insert into transit_offers select (jsonb_populate_record(null::transit_offers, to_jsonb(o) || jsonb_build_object('id', 'extra-' || n))).* from transit_offers o cross join generate_series(1, ${PUBLIC_DATA_LIMITS.transitOffers}) n where o.id='model-offer'`;
    await expect(
      loadChannelSnapshotFromDatabase(connection.database),
    ).rejects.toThrow(/capacity exceeded/);
    await expect(
      loadTransitSnapshotFromDatabase(connection.database),
    ).rejects.toThrow(/capacity exceeded/);
  }, 30000);
  it("backfills retained baselines for absent channel offers and current transit offers", async () => {
    const first = channels();
    first.offers.push({
      ...first.offers[0],
      id: "anchor",
      offerUrl: "https://example.com/anchor",
    });
    await publishNextChannelSnapshot(first);
    await publishNextChannelSnapshot({ ...first, offers: [first.offers[1]] });
    await publishNextTransitSnapshot(transit());
    const migration = await readFile(
      new URL("../drizzle/0014_public_offer_baselines.sql", import.meta.url),
      "utf8",
    );
    await connection.client.begin(async (tx) => {
      await tx`drop table public_offer_baselines`;
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.unsafe(statement);
      const rows =
        await tx`select domain, offer_id, payload from public_offer_baselines order by domain, offer_id`;
      expect(rows).toHaveLength(3);
      expect(
        rows.find((row) => row.offer_id === "offer")?.payload.priceMinor,
      ).toBe(990);
      expect(
        rows.find((row) => row.domain === "transit")?.payload
          .combinedMultiplier,
      ).toBe(0.2);
    });
  });
  it("backfills first-seen from pre-migration stable-identity history", async () => {
    const first = channels();
    first.offers[0].observedAt = new Date(
      Date.parse(now) - 3600000,
    ).toISOString();
    await publishNextChannelSnapshot(first);
    const next = channels();
    next.offers[0].id = "migrated-rekey";
    await publishNextChannelSnapshot(next);
    const migration = await readFile(
      new URL(
        "../drizzle/0013_channel_first_seen_lineage.sql",
        import.meta.url,
      ),
      "utf8",
    );
    // This connection is restricted above to the disposable loopback test DB.
    await connection.client.begin(async (tx) => {
      await tx`alter table channel_public_offers drop column first_seen_at`;
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.unsafe(statement);
      const [row] =
        await tx`select first_seen_at from channel_public_offers where id='migrated-rekey'`;
      expect(new Date(row.first_seen_at).toISOString()).toBe(
        first.offers[0].observedAt,
      );
    });
  });

  it("preserves explicit source types independent of source labels", async () => {
    const snapshot = channels();
    snapshot.offers[0].sourceType = "authorized_feed";
    snapshot.offers[0].sourceName = "Capital Market";
    await publishNextChannelSnapshot(snapshot);
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
    const initial = await publishNextChannelSnapshot(snapshot);
    await expect(
      publishNextChannelSnapshot({
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
    await expect(publishNextChannelSnapshot(changedMerchant)).rejects.toThrow(
      "collapsed",
    );
    const retained = await loadChannelSnapshotFromDatabase(connection.database);
    expect(retained?.generationId).toBe(initial.generationId);
    expect(retained?.offers).toHaveLength(10);
  });

  it("round-trips nullable channel fields, preserves exact replay, and republishes earlier values with a newer generation", async () => {
    const a = channels();
    const first = await publishNextChannelSnapshot(a);
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
    await publishNextChannelSnapshot(b);
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))?.offers[0]
        .priceMinor,
    ).toBe(1290);
    expect((await publishNextChannelSnapshot(a)).published).toBe(true);
    const restored = await loadChannelSnapshotFromDatabase(connection.database);
    expect(restored?.generationId).not.toBe(first.generationId);
    expect(restored?.offers[0].priceMinor).toBe(990);
  });

  it("rolls back a failed replacement after row deletion without corrupting the last snapshot", async () => {
    await publishNextChannelSnapshot(channels());
    const bad = channels();
    bad.products.push({
      ...bad.products[0],
      displayName: "Duplicate primary key",
    });
    await expect(publishNextChannelSnapshot(bad)).rejects.toThrow();
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))?.offers[0]
        .priceMinor,
    ).toBe(990);
    await expect(
      publishNextChannelSnapshot({ ...channels(), offers: [] }),
    ).rejects.toThrow("empty");
  });

  it("stores long non-compressible public search text without B-tree tuple failures", async () => {
    const snapshot = channels();
    snapshot.products[0].summary = randomBytes(1900).toString("hex");
    await expect(publishNextChannelSnapshot(snapshot)).resolves.toMatchObject({
      published: true,
    });
  });

  it("retains channel rows on invisible or read-incompatible refreshes and supports long source URLs", async () => {
    const snapshot = channels();
    snapshot.offers[0].sourceUrl = `https://example.com/${"a".repeat(1000)}`;
    snapshot.offers[0].offerUrl = `https://example.com/${"b".repeat(1000)}`;
    const published = await publishNextChannelSnapshot(snapshot);
    const read = await loadChannelSnapshotFromDatabase(connection.database);
    expect(read?.offers).toHaveLength(1);
    expect(read?.offers[0].sourceUrl).toBe(snapshot.offers[0].sourceUrl);
    for (const status of ["pending_review", "suspended"] as const) {
      const bad = channels();
      bad.merchants[0].status = status;
      await expect(publishNextChannelSnapshot(bad)).rejects.toThrow(
        "no public offers",
      );
      bad.merchants[0].status = "active";
      bad.offers[0].status = status;
      await expect(publishNextChannelSnapshot(bad)).rejects.toThrow(
        "no public offers",
      );
    }
    const bad = channels();
    bad.merchants[0].name = "a".repeat(161);
    await expect(publishNextChannelSnapshot(bad)).rejects.toThrow();
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(published.generationId);
  });

  it("round-trips transit prices and samples and republishes previous values with a newer generation", async () => {
    const a = transit();
    await publishNextTransitSnapshot(a);
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.stations).toHaveLength(1);
    expect(read?.stations[0].offers[0].combinedRate).toBeCloseTo(0.2);
    expect(read?.stations[0].offers[0].availability.sevenDaySamples).toBe(1);
    expect((await publishTransitSnapshot(a)).published).toBe(false);
    const b = transit();
    b.offers[0].modelMultiplier = 3;
    await publishNextTransitSnapshot(b);
    expect((await publishNextTransitSnapshot(a)).published).toBe(true);
    const bad = transit();
    bad.availabilitySamples[0].offerId = "missing";
    await expect(publishNextTransitSnapshot(bad)).rejects.toThrow("unknown");
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
    const published = await publishNextTransitSnapshot(snapshot);
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
      await expect(publishNextTransitSnapshot(bad)).rejects.toThrow(
        "no public stations",
      );
    const bad = transit();
    bad.stations[0].name = "a".repeat(201);
    await expect(publishNextTransitSnapshot(bad)).rejects.toThrow();
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
        standardModel: `model-${index}`,
      }));
      await publishNextTransitSnapshot(snapshot);
      await expect(
        publishNextTransitSnapshot({
          ...snapshot,
          offers: snapshot.offers.slice(0, 5),
        }),
      ).rejects.toThrow("collapsed");
      await expect(
        publishNextTransitSnapshot({ ...snapshot, offers: [] }),
      ).rejects.toThrow("collapsed");
      await expect(
        publishNextTransitSnapshot({
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
    const channelResult = await publishNextChannelSnapshot(channel);
    const transitResult = await publishNextTransitSnapshot(station);
    for (const priceMinor of [0, 1980, null])
      await expect(
        publishNextChannelSnapshot({
          ...channel,
          offers: [{ ...channel.offers[0], priceMinor }],
        }),
      ).rejects.toThrow("Price anomaly");
    await expect(
      publishNextChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[0], currency: "USD" }],
      }),
    ).rejects.toThrow("currency changed");
    for (const inputPrice of [0, 2e-8, null])
      await expect(
        publishNextTransitSnapshot({
          ...station,
          offers: [{ ...station.offers[0], inputPrice }],
        }),
      ).rejects.toThrow("Price anomaly");
    await expect(
      publishNextTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], modelMultiplier: 4 }],
      }),
    ).rejects.toThrow("Price anomaly");
    await expect(
      publishNextTransitSnapshot({
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
      publishNextChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[0], priceMinor: 1485 }],
      }),
    ).resolves.toMatchObject({ published: true });
    await expect(
      publishNextTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], modelMultiplier: 3 }],
      }),
    ).resolves.toMatchObject({ published: true });
  });
  it("keeps anomaly checks across ID changes and rejects wholesale identity churn", async () => {
    const channel = channels();
    const station = transit();
    const channelResult = await publishNextChannelSnapshot(channel);
    const transitResult = await publishNextTransitSnapshot(station);
    await expect(
      publishNextChannelSnapshot({
        ...channel,
        offers: [{ ...channel.offers[0], id: "new-id", priceMinor: 9000 }],
      }),
    ).rejects.toThrow("Price anomaly");
    await expect(
      publishNextTransitSnapshot({
        ...station,
        offers: [{ ...station.offers[0], id: "new-id", modelMultiplier: 20 }],
        availabilitySamples: [],
      }),
    ).rejects.toThrow("Price anomaly");
    await expect(
      publishNextChannelSnapshot({
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
      publishNextTransitSnapshot({
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
    const initial = await publishNextChannelSnapshot(snapshot);
    for (const tier of [
      { minQuantity: 10, priceMinor: 9000, currency: "CNY" },
      { minQuantity: 10, priceMinor: 900, currency: "USD" },
      { minQuantity: 20, priceMinor: 9000, currency: "CNY" },
    ])
      await expect(
        publishNextChannelSnapshot({
          ...snapshot,
          offers: [{ ...snapshot.offers[0], bulkPricingTiers: [tier] }],
        }),
      ).rejects.toThrow();
    await expect(
      publishNextChannelSnapshot({
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
  it("rejects a single renamed boundary in a multi-tier offer", async () => {
    const snapshot = channels();
    snapshot.offers[0].bulkPricingTiers = [
      { minQuantity: 10, priceMinor: 900, currency: "CNY" },
      { minQuantity: 20, priceMinor: 800, currency: "CNY" },
    ];
    const initial = await publishNextChannelSnapshot(snapshot);
    for (const tier of [
      { minQuantity: 30, priceMinor: 8000, currency: "CNY" },
      { minQuantity: 30, priceMinor: 800, currency: "USD" },
    ])
      await expect(
        publishNextChannelSnapshot({
          ...snapshot,
          offers: [
            {
              ...snapshot.offers[0],
              bulkPricingTiers: [snapshot.offers[0].bulkPricingTiers[0], tier],
            },
          ],
        }),
      ).rejects.toThrow("Bulk tier identity");
    expect(
      (await loadChannelSnapshotFromDatabase(connection.database))
        ?.generationId,
    ).toBe(initial.generationId);
  });
  it("rejects disappearance of publishable offers even when raw counts stay constant", async () => {
    const snapshot = transit();
    snapshot.availabilitySamples = [];
    const initial = await publishNextTransitSnapshot(snapshot);
    for (const status of ["pending_review", "unknown", "unavailable"] as const)
      await expect(
        publishNextTransitSnapshot({
          ...snapshot,
          offers: [{ ...snapshot.offers[0], status }],
        }),
      ).rejects.toThrow("collapsed");
    for (const lastVerifiedAt of [
      null,
      new Date(Date.now() - 40 * 3600000).toISOString(),
    ])
      await expect(
        publishNextTransitSnapshot({
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
    await publishNextChannelSnapshot(channel);
    await expect(
      publishNextChannelSnapshot({
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
    const published = await publishNextChannelSnapshot(snapshot);
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
    await expect(publishNextTransitSnapshot(tiny)).rejects.toThrow();
    tiny.offers[0].rechargeRatio = "1:10000000000";
    await expect(publishNextTransitSnapshot(tiny)).rejects.toThrow();
    const read = normalizeTransitDatabaseSnapshot(
      await loadTransitSnapshotFromDatabase(connection.database),
    );
    expect(read?.generationId).toBe(prior?.generationId);
  });
});
