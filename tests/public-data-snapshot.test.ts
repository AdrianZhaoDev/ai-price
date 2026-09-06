import { describe, expect, it } from "vitest";
import {
  channelSnapshotSchema,
  contentHash,
  parsePublicSnapshot,
  transitSnapshotSchema,
} from "@/lib/public-data/snapshot";
import {
  isPrivateOrReservedHostname,
  isSafePublicHttpUrl,
  safePublicHttpUrl,
} from "@/lib/public-data/urls";
import {
  publishChannelSnapshot,
  publishTransitSnapshot,
} from "@/lib/public-data/persistence";

const generatedAt = "2026-09-06T00:00:00.000Z";

function channelSnapshot() {
  return {
    schemaVersion: 1 as const,
    domain: "channels" as const,
    generatedAt,
    sourceCount: 1,
    merchants: [
      {
        id: "merchant-1",
        slug: "merchant-1",
        name: "Merchant One",
        host: "merchant.example.com",
        websiteUrl: "https://merchant.example.com/",
        status: "active" as const,
        platforms: ["web"],
        riskLabels: [],
      },
    ],
    products: [
      {
        id: "product-1",
        slug: "product-1",
        displayName: "Product One",
        platform: "web",
        productType: "subscription",
        aliases: [],
      },
    ],
    offers: [
      {
        id: "offer-1",
        merchantId: "merchant-1",
        productId: "product-1",
        sourceName: "public page",
        sourceUrl: "https://merchant.example.com/catalog",
        title: "Product One",
        offerUrl: "https://merchant.example.com/buy/product-1",
        priceMinor: 990,
        currency: "CNY",
        availability: "in_stock" as const,
        bulkPricingTiers: [],
        tags: [],
        riskLabels: [],
        status: "verified" as const,
        observedAt: generatedAt,
        lastSeenAt: generatedAt,
      },
    ],
  };
}

describe("public snapshot boundaries", () => {
  it("parses a minimal channel snapshot and hashes key order canonically", () => {
    const input = channelSnapshot();
    expect(parsePublicSnapshot("channels", input)).toEqual(
      channelSnapshotSchema.parse(input),
    );
    expect(contentHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      contentHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("rejects credentialed/private links and nested sensitive payload keys", () => {
    const credentialed = channelSnapshot();
    credentialed.offers[0].offerUrl =
      "https://user:password@merchant.example.com/buy";
    expect(channelSnapshotSchema.safeParse(credentialed).success).toBe(false);
    credentialed.offers[0].offerUrl =
      "https://merchant.example.com/buy?access_token=hidden";
    expect(channelSnapshotSchema.safeParse(credentialed).success).toBe(false);

    const transit = {
      schemaVersion: 1,
      domain: "transit",
      generatedAt,
      sourceCount: 1,
      stations: [
        {
          id: "station-1",
          slug: "station-1",
          name: "Station One",
          websiteUrl: "https://station.example.com/",
          status: "active",
          dataStatus: "verified",
          commercialRelation: "none",
          channelTypes: [],
          accountPools: [],
          paymentMethods: [],
          riskLabels: [],
          sourceType: "public_status",
          sourceUrl: "https://station.example.com/status",
          payload: { public: { apiKey: "must-not-pass" } },
        },
      ],
      offers: [],
      availabilitySamples: [],
    };
    expect(transitSnapshotSchema.safeParse(transit).success).toBe(false);
    let deep: Record<string, unknown> = { benign: true };
    for (let depth = 0; depth < 12; depth++) deep = { nested: deep };
    expect(
      transitSnapshotSchema.safeParse({
        ...transit,
        stations: [{ ...transit.stations[0], payload: deep }],
      }).success,
    ).toBe(false);
  });

  it("rejects empty channel and transit refreshes before touching the database", async () => {
    const emptyChannels = channelSnapshotSchema.parse({
      ...channelSnapshot(),
      merchants: [],
      products: [],
      offers: [],
    });
    await expect(publishChannelSnapshot(emptyChannels)).rejects.toThrow(
      "previous published generation retained",
    );

    const emptyTransit = transitSnapshotSchema.parse({
      schemaVersion: 1,
      domain: "transit",
      generatedAt,
      sourceCount: 0,
      stations: [],
      offers: [],
      availabilitySamples: [],
    });
    await expect(publishTransitSnapshot(emptyTransit)).rejects.toThrow(
      "previous published generation retained",
    );
  });
});

describe("safe public URLs", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "10.2.3.4",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:7f00:1",
    "::ffff:c0a8:101",
  ])("recognizes private or reserved host %s", (host) => {
    expect(isPrivateOrReservedHostname(host)).toBe(true);
  });

  it("does not over-block a public IPv4-mapped IPv6 literal", () => {
    expect(isPrivateOrReservedHostname("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedHostname("::ffff:808:808")).toBe(false);
  });

  it("accepts safe HTTPS links and rejects non-HTTP or credentialed URLs", () => {
    expect(isSafePublicHttpUrl("https://example.com/catalog?q=1")).toBe(true);
    expect(safePublicHttpUrl("https://example.com/catalog")).toBe(
      "https://example.com/catalog",
    );
    expect(isSafePublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePublicHttpUrl("https://user:pass@example.com/")).toBe(false);
    expect(isSafePublicHttpUrl("http://127.0.0.1/admin")).toBe(false);
  });
});
