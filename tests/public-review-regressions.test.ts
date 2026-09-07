import { describe, expect, it, vi } from "vitest";
import {
  getDefaultChannelRepository,
  createChannelRepository,
} from "@/lib/channels/repository";
import {
  handleChannelDetailGet,
  handleTransitGet,
} from "@/app/api/_public-data/handlers";
import { getDefaultTransitRepository } from "@/lib/transit/repository";
import { GET as channelsGet } from "@/app/api/channels/route";
import { GET as offerDetailGet } from "@/app/api/channels/offers/[id]/route";
import { createSyntheticChannelSnapshot } from "@/lib/channels/fixture";
import { channelOfferFiltersSchema } from "@/lib/channels/types";
import { publicChannelOffer } from "@/app/api/_public-data/response";
import {
  channelOfferSnapshotSchema,
  channelMerchantSnapshotSchema,
  channelProductSnapshotSchema,
  transitOfferSnapshotSchema,
  transitAvailabilitySnapshotSchema,
  transitStationSnapshotSchema,
  channelSnapshotSchema,
  transitSnapshotSchema,
} from "@/lib/public-data/snapshot";
import { isPrivateOrReservedHostname } from "@/lib/public-data/urls";
import { getSyntheticTransitStations } from "@/lib/transit/fixture";
import { filterTransitStations } from "@/lib/transit/ranking";
import { isTransitStationPublic } from "@/lib/transit/types";
import { buildChannelProductSummaries } from "@/lib/channels/ranking";

describe("public review regressions", () => {
  it("exposes explicit source types through the shared public offer serializer", () => {
    const offer = createSyntheticChannelSnapshot().offers[0];
    for (const sourceType of [
      "public_api",
      "manual_snapshot",
      "authorized_feed",
    ] as const)
      expect(publicChannelOffer({ ...offer, sourceType })).toMatchObject({
        sourceType,
      });
  });
  it("returns successful empty queries from nonempty last-good snapshots", async () => {
    const channelSnapshot = createSyntheticChannelSnapshot();
    channelSnapshot.dataStatus = "degraded";
    channelSnapshot.dataSource = "database";
    const channelSpy = vi
      .spyOn(getDefaultChannelRepository(), "load")
      .mockResolvedValue(channelSnapshot);
    const transitRepository = getDefaultTransitRepository();
    const model = await transitRepository.load();
    const transitSpy = vi.spyOn(transitRepository, "load").mockResolvedValue({
      ...model,
      stations: getSyntheticTransitStations().map((station) => ({
        ...station,
        dataStatus: "verified" as const,
      })),
      degraded: true,
      isSynthetic: false,
    });
    try {
      for (const query of ["q=no-such-record", "offset=5000"])
        expect(
          (
            await channelsGet(
              new Request(`http://localhost/api/channels?${query}`),
            )
          ).status,
        ).toBe(200);
      for (const query of ["q=no-such-record", "cursor=o5000"])
        expect(
          (
            await handleTransitGet(
              new Request(`http://localhost/api/transit?${query}`),
            )
          ).status,
        ).toBe(200);
    } finally {
      channelSpy.mockRestore();
      transitSpy.mockRestore();
    }
  });
  it("rejects monitor scopes and attribution not supported by the read model", () => {
    const sample = {
      id: "sample",
      stationId: "station",
      scope: "station",
      matchLevel: "station",
      sourceType: "public_status",
      success: true,
      checkedAt: new Date().toISOString(),
    };
    expect(transitAvailabilitySnapshotSchema.safeParse(sample).success).toBe(
      true,
    );
    expect(
      transitAvailabilitySnapshotSchema.safeParse({ ...sample, sampleCount: 2 })
        .success,
    ).toBe(false);
    expect(
      transitAvailabilitySnapshotSchema.safeParse({
        ...sample,
        sampleCount: 2,
        sevenDayRate: 0,
      }).success,
    ).toBe(true);
    for (const scope of ["group", "model"])
      expect(
        transitAvailabilitySnapshotSchema.safeParse({ ...sample, scope })
          .success,
      ).toBe(false);
    for (const matchLevel of ["group", "model", "family"])
      expect(
        transitAvailabilitySnapshotSchema.safeParse({ ...sample, matchLevel })
          .success,
      ).toBe(false);
    expect(
      transitAvailabilitySnapshotSchema.safeParse({ ...sample, scope: "offer" })
        .success,
    ).toBe(false);
    expect(
      transitAvailabilitySnapshotSchema.safeParse({
        ...sample,
        offerId: "offer",
      }).success,
    ).toBe(false);
    expect(
      transitAvailabilitySnapshotSchema.safeParse({
        ...sample,
        scope: "offer",
        offerId: "offer",
        matchLevel: "exact",
      }).success,
    ).toBe(true);
  });
  it("disambiguates detail kinds and prefers advertised IDs to other slugs", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    const id = "shared-id";
    snapshot.offers[0].id = id;
    snapshot.products![1].id = id;
    snapshot.offers[0].productId = id;
    snapshot.products![0].slug = id;
    snapshot.merchants![1].id = id;
    snapshot.merchants![0].slug = id;
    const spy = vi
      .spyOn(getDefaultChannelRepository(), "getSnapshot")
      .mockResolvedValue(snapshot);
    try {
      for (const kind of ["offer", "product", "merchant"]) {
        const response = await handleChannelDetailGet(
          new Request(`http://localhost/api/channels/${id}?kind=${kind}`),
          { params: Promise.resolve({ id }) },
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe(kind);
        expect(body[kind].id).toBe(id);
      }
      for (const query of [
        "kind=bad",
        "kind=offer&kind=product",
        "unknown=1",
      ]) {
        expect(
          (
            await handleChannelDetailGet(
              new Request(`http://localhost/api/channels/${id}?${query}`),
              { params: Promise.resolve({ id }) },
            )
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await handleChannelDetailGet(
            new Request(
              `http://localhost/api/channels/offers/${id}?kind=product`,
            ),
            { params: Promise.resolve({ id }) },
            true,
          )
        ).status,
      ).toBe(400);
    } finally {
      spy.mockRestore();
    }
  });
  it("preserves safe snapshot metadata on all channel detail kinds", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    snapshot.dataStatus = "degraded";
    snapshot.dataSource = "database";
    snapshot.warning = "private adapter exception must not leak";
    const spy = vi
      .spyOn(getDefaultChannelRepository(), "getSnapshot")
      .mockResolvedValue(snapshot);
    try {
      for (const id of [
        snapshot.offers[0].id,
        snapshot.products![0].id,
        snapshot.merchants![0].id,
      ]) {
        const response = await handleChannelDetailGet(
          new Request(`http://localhost/api/channels/${id}`),
          { params: Promise.resolve({ id }) },
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({
          generatedAt: snapshot.generatedAt,
          dataStatus: "degraded",
          degraded: true,
        });
        expect(body.warning).toContain("temporarily unavailable");
        expect(JSON.stringify(body)).not.toContain("private adapter");
        expect(response.headers.get("cache-control")).toContain("no-store");
      }
    } finally {
      spy.mockRestore();
    }
  });
  it("can page through the complete accepted channel corpus", async () => {
    const template = createSyntheticChannelSnapshot();
    template.offers = Array.from({ length: 10101 }, (_, index) => ({
      ...template.offers[0],
      id: `offer-${index}`,
      publicDedupeKey: `dedupe-${index}`,
    }));
    const repository = createChannelRepository();
    vi.spyOn(repository, "load").mockResolvedValue(template);
    const result = await repository.list({ offset: 10100, limit: 100 });
    expect(result.totalOffers).toBe(10101);
    expect(result.offers).toHaveLength(1);
    expect(
      channelOfferFiltersSchema.safeParse({ offset: 500000 }).success,
    ).toBe(true);
    expect(
      channelOfferFiltersSchema.safeParse({ offset: 500001 }).success,
    ).toBe(false);
  });
  it("rejects future generations and storage-overflowing channel values", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    expect(
      channelSnapshotSchema.shape.generatedAt.safeParse(future).success,
    ).toBe(false);
    expect(
      transitSnapshotSchema.shape.generatedAt.safeParse(future).success,
    ).toBe(false);
    for (const field of [
      channelOfferSnapshotSchema.shape.stockCount,
      channelOfferSnapshotSchema.shape.minOrderQuantity,
    ]) {
      expect(field.safeParse(2147483647).success).toBe(true);
      expect(field.safeParse(2147483648).success).toBe(false);
    }
    expect(
      channelOfferSnapshotSchema.shape.priceMinor.safeParse(99999999999999)
        .success,
    ).toBe(true);
    expect(
      channelOfferSnapshotSchema.shape.priceMinor.safeParse(100000000000000)
        .success,
    ).toBe(false);
  });
  it("uses the same canonical dedupe set for offers, summaries, and totals", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    snapshot.offers = [
      {
        ...snapshot.offers[0],
        id: "winner",
        rawTitle: "Winning title",
        labels: [],
        classificationConfidence: 1,
      },
      {
        ...snapshot.offers[0],
        id: "loser",
        rawTitle: "unique-losing-needle",
        labels: [],
        classificationConfidence: 0.1,
      },
    ];
    const repository = createChannelRepository();
    vi.spyOn(repository, "load").mockResolvedValue(snapshot);
    const result = await repository.list({ q: "unique-losing-needle" });
    expect(result.offers).toEqual([]);
    expect(result.totalOffers).toBe(0);
    expect(result.products).toEqual([]);
    expect(result.merchants).toEqual([]);
  });
  it("indexes product metadata once for complete summary sets", () => {
    const template = createSyntheticChannelSnapshot();
    let productKeyReads = 0;
    const products = Array.from({ length: 200 }, (_, index) => ({
      ...template.products![0],
      get id() {
        productKeyReads++;
        return `product-${index}`;
      },
    }));
    const offers = products.map((_, index) => ({
      ...template.offers[0],
      id: `offer-${index}`,
      productId: `product-${index}`,
      publicDedupeKey: `dedupe-${index}`,
    }));
    expect(buildChannelProductSummaries(offers, { products })).toHaveLength(
      200,
    );
    expect(productKeyReads).toBeLessThan(1000);
  });
  it("rejects positive prices and multipliers below stored precision", () => {
    for (const schema of [
      transitOfferSnapshotSchema.shape.rechargeCoefficient,
      transitOfferSnapshotSchema.shape.modelMultiplier,
      transitOfferSnapshotSchema.shape.combinedMultiplier,
      transitOfferSnapshotSchema.shape.inputPrice,
    ]) {
      expect(schema.safeParse(1e-10).success).toBe(false);
      expect(schema.safeParse(1e-8).success).toBe(true);
    }
    expect(
      transitOfferSnapshotSchema.shape.inputPrice.safeParse(0).success,
    ).toBe(true);
  });
  it("keeps public input text and array limits within the read schemas", () => {
    const limits = [
      [channelMerchantSnapshotSchema.shape.name, 160],
      [channelMerchantSnapshotSchema.shape.host, 160],
      [channelProductSnapshotSchema.shape.displayName, 240],
      [channelProductSnapshotSchema.shape.spec, 240],
      [channelOfferSnapshotSchema.shape.title, 320],
      [transitStationSnapshotSchema.shape.name, 200],
      [transitStationSnapshotSchema.shape.slug, 100],
      [transitStationSnapshotSchema.shape.summary, 1000],
      [transitOfferSnapshotSchema.shape.family, 40],
      [transitOfferSnapshotSchema.shape.standardModel, 160],
      [transitOfferSnapshotSchema.shape.groupName, 160],
      [transitOfferSnapshotSchema.shape.fixedPriceUnit, 100],
      [transitOfferSnapshotSchema.shape.priceSourceLabel, 200],
    ] as const;
    for (const [schema, max] of limits) {
      expect(schema.safeParse("a".repeat(max)).success).toBe(true);
      expect(schema.safeParse("a".repeat(max + 1)).success).toBe(false);
    }
    expect(
      channelMerchantSnapshotSchema.shape.name.safeParse("   ").success,
    ).toBe(false);
    expect(
      channelOfferSnapshotSchema.shape.tags.safeParse(Array(65).fill("tag"))
        .success,
    ).toBe(false);
    expect(
      transitStationSnapshotSchema.shape.paymentMethods.safeParse(
        Array(31).fill("card"),
      ).success,
    ).toBe(false);
    expect(
      channelOfferSnapshotSchema.shape.bulkPricingTiers.safeParse([{}]).success,
    ).toBe(false);
    expect(
      transitAvailabilitySnapshotSchema.shape.matchLevel.parse("station"),
    ).toBe("station");
  });
  it("resolves case-distinct offer identifiers exactly", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    snapshot.offers = [
      { ...snapshot.offers[0], id: "Offer-A" },
      { ...snapshot.offers[0], id: "offer-a" },
    ];
    const spy = vi
      .spyOn(getDefaultChannelRepository(), "getSnapshot")
      .mockResolvedValue(snapshot);
    try {
      for (const id of ["Offer-A", "offer-a"]) {
        const response = await handleChannelDetailGet(
          new Request(`http://localhost/api/channels/offers/${id}`),
          { params: Promise.resolve({ id }) },
          true,
        );
        expect(response.status).toBe(200);
        expect((await response.json()).offer.id).toBe(id);
      }
      const response = await handleChannelDetailGet(
        new Request("http://localhost/api/channels/offers/OFFER-A"),
        { params: Promise.resolve({ id: "OFFER-A" }) },
        true,
      );
      expect(response.status).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
  it("does not expose pending merchant details", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    snapshot.merchants![0].status = "pending_review";
    const id = snapshot.merchants![0].id;
    const spy = vi
      .spyOn(getDefaultChannelRepository(), "getSnapshot")
      .mockResolvedValue(snapshot);
    try {
      const response = await handleChannelDetailGet(
        new Request(`http://localhost/api/channels/${id}`),
        { params: Promise.resolve({ id }) },
      );
      expect(response.status).toBe(404);
    } finally {
      spy.mockRestore();
    }
  });
  it("does not expose a product with no public offer even if its metadata says published", async () => {
    const snapshot = createSyntheticChannelSnapshot();
    const product = snapshot.products![0];
    snapshot.offers = snapshot.offers.map((offer) =>
      offer.productId === product.id
        ? {
            ...offer,
            published: false,
            publicationStatus: "pending_review" as const,
          }
        : offer,
    );
    const spy = vi
      .spyOn(getDefaultChannelRepository(), "getSnapshot")
      .mockResolvedValue(snapshot);
    try {
      for (const id of [product.id, product.slug]) {
        const response = await handleChannelDetailGet(
          new Request(`http://localhost/api/channels/${id}?kind=product`),
          { params: Promise.resolve({ id }) },
        );
        expect(response.status).toBe(404);
      }
    } finally {
      spy.mockRestore();
    }
  });
  it("lists reviewed prices with unknown uptime without exposing unreviewed stations", () => {
    expect(
      isTransitStationPublic({ status: "unknown", dataStatus: "verified" }),
    ).toBe(true);
    expect(
      isTransitStationPublic({
        status: "unknown",
        dataStatus: "pending_review",
      }),
    ).toBe(false);
  });
  it.each(["all", "offers", "products", "merchants"])(
    "paginates %s independently",
    async (view) => {
      const first = await (
        await channelsGet(
          new Request(`http://localhost/api/channels?view=${view}&limit=1`),
        )
      ).json();
      const next = await (
        await channelsGet(
          new Request(
            `http://localhost/api/channels?view=${view}&limit=1&offset=1`,
          ),
        )
      ).json();
      expect(first.items).toHaveLength(1);
      expect(next.items).toHaveLength(1);
      expect(first.items[0]).not.toEqual(next.items[0]);
      const countField =
        view === "products"
          ? "totalProducts"
          : view === "merchants"
            ? "totalMerchants"
            : "totalOffers";
      expect(first.total).toBe(first[countField]);
      expect(first.total).toBeGreaterThan(1);
      expect(next.total).toBe(first.total);
    },
  );
  it("rejects unknown query keys and retains documented aliases", async () => {
    const response = await channelsGet(
      new Request("http://localhost/api/channels?currency=USD"),
    );
    expect(response.status).toBe(400);
    expect(
      channelOfferFiltersSchema.parse({ q: "hello", sort: "updated" }),
    ).toMatchObject({ query: "hello", direction: "desc" });
    expect(
      channelOfferFiltersSchema.parse({ sort: "relevance" }).direction,
    ).toBe("desc");
    expect(
      channelOfferFiltersSchema.parse({ sort: "updated", direction: "asc" })
        .direction,
    ).toBe("asc");
    expect(
      channelOfferFiltersSchema.parse({ sort: "price_desc" }),
    ).toMatchObject({ sort: "price", direction: "desc" });
    expect(
      channelOfferFiltersSchema.parse({ sort: "price_desc", direction: "asc" })
        .direction,
    ).toBe("asc");
    expect(
      (
        await channelsGet(
          new Request("http://localhost/api/channels?sort=price_desc"),
        )
      ).status,
    ).toBe(200);
  });
  it("never resolves products through the offer-only endpoint", async () => {
    const id = createSyntheticChannelSnapshot().products![0].id;
    const response = await offerDetailGet(
      new Request(`http://localhost/api/channels/offers/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(404);
  });
  it("aligns minor-unit and slug contracts and rejects TEST-NET-1", () => {
    expect(
      channelOfferSnapshotSchema.shape.priceMinor.safeParse(1.25).success,
    ).toBe(false);
    expect(
      channelOfferSnapshotSchema.shape.priceMinor.safeParse(125).success,
    ).toBe(true);
    for (const slug of ["station_1", "station.1", "-station"])
      expect(
        transitStationSnapshotSchema.shape.slug.safeParse(slug).success,
      ).toBe(false);
    expect(isPrivateOrReservedHostname("192.0.2.1")).toBe(true);
  });
  it("does not match unpublished offer metadata in public searches", () => {
    const station = getSyntheticTransitStations()[0];
    station.offers = [
      {
        ...station.offers[0],
        standardModelLabel: "private-needle",
        groupName: "private-needle",
        status: "pending_review",
      },
    ];
    expect(filterTransitStations([station], { q: "private-needle" })).toEqual(
      [],
    );
    const offer = station.offers[0];
    for (const query of [
      { model: offer.standardModelId },
      { family: offer.family },
      { channel: offer.channelType },
      { pool: offer.accountPool },
    ]) {
      expect(filterTransitStations([station], query)).toEqual([]);
      expect(
        filterTransitStations([station], {
          ...query,
          includeUnpublished: true,
        }),
      ).toHaveLength(1);
    }
  });
});
