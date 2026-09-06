import { createHash } from "node:crypto";
import { z } from "zod";
import { isSafePublicHttpUrl, safePublicHttpUrl } from "@/lib/public-data/urls";

/**
 * Runtime boundaries for data produced by GitHub-hosted collectors.  These
 * schemas deliberately describe only public fields; secrets, request bodies
 * and raw credentials are rejected before anything reaches PostgreSQL.
 */
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafePublicHttpUrl, {
    message: "Only safe public http(s) URLs are allowed.",
  })
  .transform((value) => safePublicHttpUrl(value)!);

const isoDate = z.string().datetime({ offset: true });
const safeId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,119}$/i);
const publicText = z.string().max(4000);
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const tags = z.array(boundedText(80)).max(64).default([]);
const transitTags = z.array(boundedText(80)).max(30).default([]);
// Match numeric(20, 8): never let a positive amount silently round to free.
export const transitPositiveDecimalSchema = z
  .number()
  .finite()
  .min(1e-8)
  .max(999_999_999_999);
const transitPriceSchema = z.union([
  z.literal(0),
  transitPositiveDecimalSchema,
]);
const sensitiveKey =
  /token|secret|password|passwd|authorization|credential|session|cookie|api[-_]?key|signature|bearer/i;

function containsSensitiveKey(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveKey(item, depth + 1));
  }
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) =>
      sensitiveKey.test(key) || containsSensitiveKey(item, depth + 1),
  );
}

const publicPayload = z
  .record(z.string().max(80), z.unknown())
  .refine((value) => !containsSensitiveKey(value), {
    message: "Sensitive fields are not allowed in public payloads.",
  });

export const channelMerchantSnapshotSchema = z.object({
  id: safeId,
  slug: safeId,
  name: boundedText(160),
  host: boundedText(160),
  websiteUrl: httpUrl,
  status: z.enum(["active", "pending_review", "suspended"]),
  operatorType: boundedText(80).nullable().optional(),
  platforms: tags,
  riskLabels: tags,
});

export const channelProductSnapshotSchema = z.object({
  id: safeId,
  slug: safeId,
  displayName: boundedText(240),
  platform: boundedText(80),
  productType: boundedText(80),
  spec: z.string().max(240).nullable().optional(),
  summary: publicText.nullable().optional(),
  aliases: tags,
});

export const channelOfferSnapshotSchema = z.object({
  id: safeId,
  merchantId: safeId,
  productId: safeId,
  sourceName: boundedText(160),
  sourceUrl: httpUrl,
  title: boundedText(320),
  offerUrl: httpUrl,
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  availability: z.enum(["in_stock", "out_of_stock", "unknown", "expired"]),
  stockCount: z.number().int().nonnegative().nullable().optional(),
  minOrderQuantity: z.number().int().positive().nullable().optional(),
  bulkPricingTiers: z
    .array(
      z
        .object({
          minQuantity: z.number().int().positive(),
          priceMinor: z.number().int().nonnegative(),
          currency: z.string().regex(/^[A-Z]{3}$/),
        })
        .strict(),
    )
    .max(64)
    .default([]),
  tags,
  riskLabels: tags,
  status: z.enum(["verified", "pending_review", "suspended"]),
  observedAt: isoDate,
  lastSeenAt: isoDate,
  expiresAt: isoDate.nullable().optional(),
  verifiedAt: isoDate.nullable().optional(),
});

export const channelSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  domain: z.literal("channels"),
  generatedAt: isoDate,
  sourceCount: z.number().int().nonnegative().max(10_000),
  merchants: z.array(channelMerchantSnapshotSchema).max(100_000),
  products: z.array(channelProductSnapshotSchema).max(100_000),
  offers: z.array(channelOfferSnapshotSchema).max(500_000),
});

export const transitAvailabilitySnapshotSchema = z.object({
  id: safeId,
  stationId: safeId,
  offerId: safeId.nullable().optional(),
  scope: z.enum(["station", "group", "model", "offer"]),
  standardModel: boundedText(160).nullable().optional(),
  groupName: boundedText(160).nullable().optional(),
  sourceType: z.enum([
    "public_status",
    "public_model_catalog",
    "partner_api",
    "merchant_reported",
    "manual_snapshot",
    "authorized_probe",
    "user_submitted",
    "synthetic_fixture",
    "unknown",
  ]),
  sourceUrl: httpUrl.nullable().optional(),
  matchLevel: z.enum(["exact", "group", "model", "family", "station"]),
  success: z.boolean(),
  latencyMs: z.number().int().nonnegative().max(300_000).nullable().optional(),
  sampleCount: z.number().int().positive().max(100_000).default(1),
  sevenDayRate: z.number().finite().min(0).max(1).nullable().optional(),
  checkedAt: isoDate,
  expiresAt: isoDate.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const transitOfferSnapshotSchema = z.object({
  id: safeId,
  stationId: safeId,
  family: boundedText(40),
  standardModel: boundedText(160),
  groupName: boundedText(160).nullable().optional(),
  billingMode: z.enum(["token", "per_request", "fixed"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** Numeric paid/credited ratio, retained for backwards-compatible feeds. */
  rechargeRatio: z
    .union([transitPositiveDecimalSchema, z.string().trim().max(100)])
    .nullable()
    .optional(),
  rechargeRatioRaw: z.string().trim().max(100).nullable().optional(),
  rechargeCoefficient: transitPositiveDecimalSchema.nullable().optional(),
  modelMultiplier: transitPositiveDecimalSchema.nullable().optional(),
  stationGroupMultiplier: transitPositiveDecimalSchema.nullable().optional(),
  combinedMultiplier: transitPositiveDecimalSchema.nullable().optional(),
  inputPrice: transitPriceSchema.nullable().optional(),
  outputPrice: transitPriceSchema.nullable().optional(),
  cacheReadPrice: transitPriceSchema.nullable().optional(),
  cacheWritePrice: transitPriceSchema.nullable().optional(),
  imageOutputPrice: transitPriceSchema.nullable().optional(),
  fixedPrice: transitPriceSchema.nullable().optional(),
  fixedPriceCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  fixedPriceUnit: z.string().max(100).nullable().optional(),
  accountPool: z.string().max(80).nullable().optional(),
  channelType: z.string().max(80).nullable().optional(),
  priceSourceUrl: httpUrl.nullable().optional(),
  priceSourceLabel: z.string().max(200).nullable().optional(),
  lastVerifiedAt: isoDate.nullable().optional(),
  availability: publicPayload.default({}),
  status: z.enum(["verified", "pending_review", "unavailable", "unknown"]),
  payload: publicPayload.default({}),
});

export const transitStationSnapshotSchema = z.object({
  id: safeId,
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  name: boundedText(200),
  websiteUrl: httpUrl,
  apiBaseUrl: httpUrl.nullable().optional(),
  status: z.enum(["active", "limited", "unavailable", "unknown"]),
  dataStatus: z.enum(["sample", "pending_review", "verified"]),
  stationSystem: z.string().max(80).nullable().optional(),
  operatorType: z.string().max(80).nullable().optional(),
  commercialRelation: z.enum([
    "none",
    "listed",
    "partner",
    "affiliate",
    "sponsored",
    "unknown",
  ]),
  summary: z.string().max(1000).nullable().optional(),
  channelTypes: transitTags,
  accountPools: transitTags,
  paymentMethods: transitTags,
  riskLabels: transitTags,
  usageAdvice: z.union([boundedText(80), transitTags]).optional(),
  sourceType: z.string().min(1).max(80),
  sourceUrl: httpUrl,
  lastUpdatedAt: isoDate.nullable().optional(),
  lastCollectedAt: isoDate.nullable().optional(),
  payload: publicPayload.default({}),
});

export const transitSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    domain: z.literal("transit"),
    generatedAt: isoDate,
    sourceCount: z.number().int().nonnegative().max(10_000),
    stations: z.array(transitStationSnapshotSchema).max(20_000),
    offers: z.array(transitOfferSnapshotSchema).max(500_000),
    availabilitySamples: z
      .array(transitAvailabilitySnapshotSchema)
      .max(1_000_000),
  })
  .superRefine((snapshot, context) => {
    const counts = new Map<string, number>();
    for (const offer of snapshot.offers) {
      const count = (counts.get(offer.stationId) ?? 0) + 1;
      counts.set(offer.stationId, count);
      if (count === 2001)
        context.addIssue({
          code: "custom",
          path: ["offers"],
          message: "A station may contain at most 2000 offers.",
        });
    }
  });

export type ChannelSnapshot = z.infer<typeof channelSnapshotSchema>;
export type TransitSnapshot = z.infer<typeof transitSnapshotSchema>;

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

/**
 * Hash snapshots independent of object insertion order.  Collectors often
 * build rows from SQL results and JSON feeds with different key ordering;
 * canonical hashing keeps repeated imports idempotent.
 */
function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function parsePublicSnapshot(
  domain: "channels" | "transit",
  value: unknown,
): ChannelSnapshot | TransitSnapshot {
  return domain === "channels"
    ? channelSnapshotSchema.parse(value)
    : transitSnapshotSchema.parse(value);
}

export function isPublicHttpUrl(value: string): boolean {
  try {
    return /^https?:$/i.test(new URL(value).protocol);
  } catch {
    return false;
  }
}
