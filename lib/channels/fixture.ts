import {
  channelMerchantSchema,
  channelOfferSchema,
  channelProductSchema,
  type ChannelMerchant,
  type ChannelOffer,
  type ChannelProduct,
  type ChannelSnapshot,
} from "./types";

/**
 * Deliberately non-production data used when the channels tables are absent.
 * The `.invalid` host is reserved for examples and cannot resolve on the
 * public Internet.  Consumers must display the `synthetic` data status.
 */
export const SYNTHETIC_CHANNEL_GENERATION_ID =
  "synthetic-channels-development-v1";

const syntheticMerchantInputs = [
  {
    id: "synthetic-merchant-alpha",
    slug: "alpha-demo-market",
    name: "Alpha Demo Market",
    host: "alpha.synthetic.invalid",
    websiteUrl: "https://alpha.synthetic.invalid/",
    status: "active" as const,
    operatorType: "demo",
    platforms: ["web", "telegram"],
    riskLabels: ["synthetic_data"],
    lastReviewedAt: "2026-09-06T00:00:00.000Z",
  },
  {
    id: "synthetic-merchant-beta",
    slug: "beta-demo-store",
    name: "Beta Demo Store",
    host: "beta.synthetic.invalid",
    websiteUrl: "https://beta.synthetic.invalid/",
    status: "active" as const,
    operatorType: "demo",
    platforms: ["web"],
    riskLabels: ["synthetic_data"],
    lastReviewedAt: "2026-09-06T00:00:00.000Z",
  },
] satisfies Array<Parameters<typeof channelMerchantSchema.parse>[0]>;

export const syntheticChannelMerchants: ChannelMerchant[] =
  syntheticMerchantInputs.map((merchant) =>
    channelMerchantSchema.parse(merchant),
  );

const syntheticProductInputs = [
  {
    id: "synthetic-product-cloudbox-basic",
    slug: "cloudbox-basic",
    name: "CloudBox Basic (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 100 credits",
    aliases: ["cloudbox basic", "cb-basic"],
    reviewStatus: "published" as const,
  },
  {
    id: "synthetic-product-cloudbox-pro",
    slug: "cloudbox-pro",
    name: "CloudBox Pro (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 500 credits",
    aliases: ["cloudbox pro", "cb-pro"],
    reviewStatus: "published" as const,
  },
] satisfies Array<Parameters<typeof channelProductSchema.parse>[0]>;

export const syntheticChannelProducts: ChannelProduct[] =
  syntheticProductInputs.map((product) => channelProductSchema.parse(product));

const offerInputs = [
  {
    id: "synthetic-offer-basic-alpha-api",
    merchantId: "synthetic-merchant-alpha",
    merchantName: "Alpha Demo Market",
    productId: "synthetic-product-cloudbox-basic",
    productName: "CloudBox Basic (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 100 credits",
    rawTitle: "CloudBox Basic 30d 100 credits",
    sourceId: "synthetic-source-alpha-api",
    sourceType: "public_api" as const,
    sourceUrl: "https://alpha.synthetic.invalid/api/offers",
    offerUrl: "https://alpha.synthetic.invalid/offers/cloudbox-basic",
    priceMinor: 990,
    currency: "CNY",
    availabilityStatus: "in_stock" as const,
    stockQuantity: 20,
    minPurchaseQuantity: 1,
    tiers: [],
    labels: ["demo", "monthly"],
    riskLabels: ["synthetic_data"],
    expiresAt: null,
    firstSeenAt: "2026-09-05T22:00:00.000Z",
    lastSeenAt: "2026-09-06T00:00:00.000Z",
    observedAt: "2026-09-06T00:00:00.000Z",
    publicDedupeKey: "alpha|cloudbox-basic|30d|100credits",
    classificationConfidence: 1,
    sourceHealth: "healthy" as const,
    accessMode: "public" as const,
    publicationStatus: "published" as const,
    published: true,
  },
  {
    id: "synthetic-offer-basic-alpha-page-duplicate",
    merchantId: "synthetic-merchant-alpha",
    merchantName: "Alpha Demo Market",
    productId: "synthetic-product-cloudbox-basic",
    productName: "CloudBox Basic (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 100 credits",
    rawTitle: "CloudBox Basic — 30 days",
    sourceId: "synthetic-source-alpha-page",
    sourceType: "public_page" as const,
    sourceUrl: "https://alpha.synthetic.invalid/offers",
    offerUrl: "https://alpha.synthetic.invalid/offers/cloudbox-basic",
    priceMinor: 990,
    currency: "CNY",
    availabilityStatus: "in_stock" as const,
    stockQuantity: 20,
    minPurchaseQuantity: 1,
    tiers: [],
    labels: ["demo", "monthly"],
    riskLabels: ["synthetic_data"],
    expiresAt: null,
    firstSeenAt: "2026-09-05T20:00:00.000Z",
    lastSeenAt: "2026-09-05T23:00:00.000Z",
    observedAt: "2026-09-05T23:00:00.000Z",
    publicDedupeKey: "alpha|cloudbox-basic|30d|100credits",
    classificationConfidence: 0.98,
    sourceHealth: "healthy" as const,
    accessMode: "public" as const,
    publicationStatus: "published" as const,
    published: true,
  },
  {
    id: "synthetic-offer-basic-beta",
    merchantId: "synthetic-merchant-beta",
    merchantName: "Beta Demo Store",
    productId: "synthetic-product-cloudbox-basic",
    productName: "CloudBox Basic (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 100 credits",
    rawTitle: "CloudBox Basic monthly",
    sourceId: "synthetic-source-beta-page",
    sourceType: "public_page" as const,
    sourceUrl: "https://beta.synthetic.invalid/catalog",
    offerUrl: "https://beta.synthetic.invalid/catalog/cloudbox-basic",
    priceMinor: 1090,
    currency: "CNY",
    availabilityStatus: "in_stock" as const,
    stockQuantity: 8,
    minPurchaseQuantity: 1,
    tiers: [],
    labels: ["demo"],
    riskLabels: ["synthetic_data"],
    expiresAt: null,
    firstSeenAt: "2026-09-04T20:00:00.000Z",
    lastSeenAt: "2026-09-05T23:30:00.000Z",
    observedAt: "2026-09-05T23:30:00.000Z",
    publicDedupeKey: "beta|cloudbox-basic|30d|100credits",
    classificationConfidence: 0.95,
    sourceHealth: "healthy" as const,
    accessMode: "public" as const,
    publicationStatus: "published" as const,
    published: true,
  },
  {
    id: "synthetic-offer-basic-beta-sold-out",
    merchantId: "synthetic-merchant-beta",
    merchantName: "Beta Demo Store",
    productId: "synthetic-product-cloudbox-basic",
    productName: "CloudBox Basic (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 100 credits",
    rawTitle: "CloudBox Basic clearance",
    sourceId: "synthetic-source-beta-clearance",
    sourceType: "public_page" as const,
    sourceUrl: "https://beta.synthetic.invalid/clearance",
    offerUrl: "https://beta.synthetic.invalid/clearance/cloudbox-basic",
    priceMinor: 790,
    currency: "CNY",
    availabilityStatus: "out_of_stock" as const,
    stockQuantity: 0,
    minPurchaseQuantity: 1,
    tiers: [],
    labels: ["demo", "clearance"],
    riskLabels: ["synthetic_data"],
    expiresAt: null,
    firstSeenAt: "2026-09-03T20:00:00.000Z",
    lastSeenAt: "2026-09-05T21:30:00.000Z",
    observedAt: "2026-09-05T21:30:00.000Z",
    publicDedupeKey: "beta|cloudbox-basic|clearance",
    classificationConfidence: 0.9,
    sourceHealth: "healthy" as const,
    accessMode: "public" as const,
    publicationStatus: "published" as const,
    published: true,
  },
  {
    id: "synthetic-offer-pro-alpha",
    merchantId: "synthetic-merchant-alpha",
    merchantName: "Alpha Demo Market",
    productId: "synthetic-product-cloudbox-pro",
    productName: "CloudBox Pro (synthetic)",
    platform: "cloudbox",
    productType: "subscription",
    specification: "30 days / 500 credits",
    rawTitle: "CloudBox Pro 30d",
    sourceId: "synthetic-source-alpha-page",
    sourceType: "public_page" as const,
    sourceUrl: "https://alpha.synthetic.invalid/offers",
    offerUrl: "https://alpha.synthetic.invalid/offers/cloudbox-pro",
    priceMinor: 1990,
    currency: "CNY",
    availabilityStatus: "in_stock" as const,
    stockQuantity: 5,
    minPurchaseQuantity: 1,
    tiers: [{ minQuantity: 3, priceMinor: 1790, currency: "CNY" }],
    labels: ["demo", "monthly"],
    riskLabels: ["synthetic_data"],
    expiresAt: null,
    firstSeenAt: "2026-09-05T20:00:00.000Z",
    lastSeenAt: "2026-09-06T00:00:00.000Z",
    observedAt: "2026-09-06T00:00:00.000Z",
    publicDedupeKey: "alpha|cloudbox-pro|30d|500credits",
    classificationConfidence: 1,
    sourceHealth: "healthy" as const,
    accessMode: "public" as const,
    publicationStatus: "published" as const,
    published: true,
  },
] satisfies Array<Parameters<typeof channelOfferSchema.parse>[0]>;

export const syntheticChannelOffers: ChannelOffer[] = offerInputs.map((offer) =>
  channelOfferSchema.parse({ ...offer, synthetic: true }),
);

function cloneOffers(): ChannelOffer[] {
  return syntheticChannelOffers.map((offer) => ({
    ...offer,
    tiers: offer.tiers.map((tier) => ({ ...tier })),
    labels: [...offer.labels],
    riskLabels: [...offer.riskLabels],
    metadata: offer.metadata ? { ...offer.metadata } : undefined,
  }));
}

/**
 * Return a fresh fixture snapshot.  `now` is injectable so tests and previews
 * can show a deterministic generated timestamp without changing the fixture
 * rows themselves.
 */
export function createSyntheticChannelSnapshot(
  now: Date = new Date("2026-09-06T00:00:00.000Z"),
): ChannelSnapshot {
  return {
    domain: "channels",
    schemaVersion: 1,
    generationId: SYNTHETIC_CHANNEL_GENERATION_ID,
    generatedAt: now.toISOString(),
    dataStatus: "synthetic",
    dataSource: "synthetic",
    sourceCount: 2,
    sourcePolicyVersion: "channels-policy-v1",
    origin: "synthetic_fixture",
    isSynthetic: true,
    degraded: false,
    fallbackReason: "no_database_loader",
    warning:
      "Synthetic fixture only: channel database tables are not connected.",
    offers: cloneOffers(),
    merchants: syntheticChannelMerchants.map((merchant) => ({
      ...merchant,
      platforms: [...merchant.platforms],
      riskLabels: [...merchant.riskLabels],
    })),
    products: syntheticChannelProducts.map((product) => ({
      ...product,
      aliases: [...product.aliases],
    })),
  };
}

export const syntheticChannelSnapshot = createSyntheticChannelSnapshot();

/** Fresh-copy helpers mirror the repository API and prevent fixture mutation. */
export function getSyntheticChannelOffers(): ChannelOffer[] {
  return cloneOffers();
}

export function getSyntheticChannelMerchants(): ChannelMerchant[] {
  return syntheticChannelMerchants.map((merchant) => ({
    ...merchant,
    platforms: [...merchant.platforms],
    riskLabels: [...merchant.riskLabels],
  }));
}

export function getSyntheticChannelProducts(): ChannelProduct[] {
  return syntheticChannelProducts.map((product) => ({
    ...product,
    aliases: [...product.aliases],
  }));
}

export const getSyntheticChannelFixture = createSyntheticChannelSnapshot;
