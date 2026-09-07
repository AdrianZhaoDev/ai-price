import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchPublicSnapshot } from "./fetch";
import { transitSnapshotSchema, type TransitSnapshot } from "./snapshot";

// Source-owned discovery endpoints, reviewed individually; never a PriceAI feed.
export const directTransitSources = [
  { id: "sub-callai-one", origin: "https://sub.callai.one" },
  { id: "wawazz", origin: "https://wawazz.xyz" },
] as const;
export type DirectTransitSource = (typeof directTransitSources)[number];
const text = z.string().trim().min(1).max(200);
const price = z.number().finite().nonnegative();
const modelSchema = z.object({
  standard_model: text,
  billing_mode: z.enum(["token", "per_request"]),
  price: z.object({
    input_usd_per_token: price.optional(),
    output_usd_per_token: price.optional(),
    cache_read_usd_per_token: price.optional(),
    cache_write_usd_per_token: price.optional(),
    image_output_usd_per_token: price.optional(),
    per_request_usd: price.optional(),
  }),
});
const sourceSchema = z.object({
  schema_version: z.literal("ai-transit.v1"),
  system: z.literal("sub2api"),
  generated_at: z.string().datetime({ offset: true }),
  station: z.object({ name: text, homepage_url: z.string().url() }),
  billing: z.object({
    currency: z.literal("CNY"),
    credit_currency: z.literal("USD"),
    recharge_multiplier: z.number().finite().positive(),
    recharge_multiplier_unit: z.literal("USD balance per 1 CNY"),
    model_price_unit: z.literal("USD"),
  }),
  groups: z
    .array(
      z.object({
        name: text,
        platform: text,
        rate_multiplier: z.number().finite().positive(),
        models: z.array(modelSchema).max(2000),
      }),
    )
    .min(1)
    .max(200),
  completeness: z.object({
    has_recharge_ratio: z.literal(true),
    has_group_multipliers: z.literal(true),
    has_model_pricing: z.literal(true),
    warnings: z.array(z.string()).max(0).nullable(),
  }),
  disclosure: z.object({
    upstream_type: text,
    account_pool_type: text,
    is_reverse: z.boolean(),
  }),
});

/** Independently mapped from the original sites' public v1 responses. */
export function parseDirectTransit(
  value: unknown,
  source: DirectTransitSource,
  collectedAt = new Date(),
): TransitSnapshot {
  const raw = sourceSchema.parse(value);
  const age = collectedAt.getTime() - Date.parse(raw.generated_at);
  if (age < -5 * 60_000 || age > 36 * 3600_000)
    throw new Error("Original snapshot is stale or future-dated.");
  if (new URL(raw.station.homepage_url).origin !== source.origin)
    throw new Error("Original station identity changed.");
  const sourceUrl = `${source.origin}/api/public/transit/v1/snapshot`;
  const seen = new Set<string>();
  const offers = raw.groups.flatMap((group) =>
    group.models.map((model) => {
      const key = JSON.stringify([
        group.name,
        model.standard_model,
        model.billing_mode,
      ]);
      const id = `${source.id}-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
      if (seen.has(id)) throw new Error("Duplicate original offer.");
      seen.add(id);
      const factor = group.rate_multiplier / raw.billing.recharge_multiplier;
      const amount = (value: number | undefined, unit: number) =>
        value === undefined ? null : value * factor * unit;
      if (
        model.billing_mode === "token" &&
        (model.price.input_usd_per_token === undefined ||
          model.price.output_usd_per_token === undefined)
      )
        throw new Error("Token price is incomplete.");
      if (
        model.billing_mode === "per_request" &&
        model.price.per_request_usd === undefined
      )
        throw new Error("Request price is incomplete.");
      return {
        id,
        stationId: source.id,
        family: group.platform,
        standardModel: model.standard_model,
        groupName: group.name,
        billingMode: model.billing_mode,
        currency: "CNY",
        // No cross-currency 'official discount' multiplier: USD credit is not USD cash.
        inputPrice:
          model.billing_mode === "token"
            ? amount(model.price.input_usd_per_token, 1_000_000)
            : null,
        outputPrice:
          model.billing_mode === "token"
            ? amount(model.price.output_usd_per_token, 1_000_000)
            : null,
        cacheReadPrice:
          model.billing_mode === "token"
            ? amount(model.price.cache_read_usd_per_token, 1_000_000)
            : null,
        cacheWritePrice:
          model.billing_mode === "token"
            ? amount(model.price.cache_write_usd_per_token, 1_000_000)
            : null,
        imageOutputPrice:
          model.billing_mode === "token"
            ? amount(model.price.image_output_usd_per_token, 1_000_000)
            : null,
        fixedPrice:
          model.billing_mode === "per_request"
            ? amount(model.price.per_request_usd, 1)
            : null,
        fixedPriceCurrency: "CNY",
        fixedPriceUnit: model.billing_mode === "per_request" ? "request" : null,
        priceSourceUrl: sourceUrl,
        priceSourceLabel: "原站公开报价折算 / Source-reported estimate",
        lastVerifiedAt: raw.generated_at,
        status: "verified",
        accountPool: raw.disclosure.account_pool_type,
        channelType: raw.disclosure.upstream_type,
        payload: {
          adapterVersion: "sub2api-public-v1",
          pricingBasis: "CNY cost per million units or per request",
          creditPerCny: raw.billing.recharge_multiplier,
          groupRate: group.rate_multiplier,
        },
      };
    }),
  );
  if (!offers.length) throw new Error("Original source has no priced models.");
  return transitSnapshotSchema.parse({
    schemaVersion: 1,
    domain: "transit",
    generatedAt: raw.generated_at,
    sourceCount: 1,
    sourceGenerations: [
      { stationId: source.id, generatedAt: raw.generated_at },
    ],
    stations: [
      {
        id: source.id,
        slug: source.id,
        name: raw.station.name,
        websiteUrl: source.origin,
        status: "unknown",
        dataStatus: "verified",
        stationSystem: "sub_to_api",
        commercialRelation: "none",
        sourceType: "public_model_catalog",
        sourceUrl,
        summary:
          "仅核对原站公开报价格式；模型名称、上游来源与服务质量未经独立验证。 / Source-reported prices; model identity and service quality are not independently verified.",
        riskLabels: [
          "insufficient_samples",
          ...(raw.disclosure.account_pool_type === "mixed"
            ? ["mixed_pool"]
            : []),
        ],
        channelTypes: [
          raw.disclosure.upstream_type,
          ...(raw.disclosure.is_reverse ? ["reverse_engineered"] : []),
        ],
        accountPools: [raw.disclosure.account_pool_type],
        lastUpdatedAt: raw.generated_at,
        lastCollectedAt: collectedAt.toISOString(),
        payload: { adapterVersion: "sub2api-public-v1" },
      },
    ],
    offers,
    // A model catalogue or percentage without a verified sample count isn't an uptime test.
    availabilitySamples: [],
  });
}

export function selectDirectTransitSources(ids: string): DirectTransitSource[] {
  const requested = ids
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!requested.length || new Set(requested).size !== requested.length)
    throw new Error("Select unique reviewed direct source IDs.");
  return requested.map((id) => {
    const source = directTransitSources.find((item) => item.id === id);
    if (!source) throw new Error("Unknown direct source ID.");
    return source;
  });
}

export async function collectDirectTransit(
  ids: string,
  fetchJson = fetchPublicSnapshot,
  now = new Date(),
): Promise<TransitSnapshot> {
  const results: TransitSnapshot[] = [];
  for (const source of selectDirectTransitSources(ids)) {
    const discovery = z
      .object({
        schema_version: z.literal("ai-transit.v1"),
        snapshot_url: z.string(),
      })
      .parse(
        await fetchJson(
          new URL(`${source.origin}/.well-known/ai-transit.json`),
        ),
      );
    const expected = `${source.origin}/api/public/transit/v1/snapshot`;
    if (discovery.snapshot_url !== expected)
      throw new Error("Source endpoint changed; review required.");
    results.push(
      parseDirectTransit(await fetchJson(new URL(expected)), source, now),
    );
  }
  // All selected sources must succeed. Never replace the directory with a partial batch.
  return transitSnapshotSchema.parse({
    schemaVersion: 1,
    domain: "transit",
    generatedAt: new Date(
      Math.min(...results.map((result) => Date.parse(result.generatedAt))),
    ).toISOString(),
    sourceCount: results.length,
    sourceGenerations: results.flatMap(
      (result) => result.sourceGenerations ?? [],
    ),
    stations: results.flatMap((result) => result.stations),
    offers: results.flatMap((result) => result.offers),
    availabilitySamples: [],
  });
}
