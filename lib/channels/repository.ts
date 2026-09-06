import { createHash } from "node:crypto";
import {
  getPublicDataDatabase,
  isPublicDataDatabaseConfigured,
  type Database,
} from "@/lib/db/client";
import {
  channelMerchants,
  channelProducts,
  channelPublicOffers,
  channelOfferObservations,
  publicDataGenerations,
} from "@/lib/db/schema";
import { and, desc, eq, min } from "drizzle-orm";
import { createSyntheticChannelSnapshot } from "./fixture";
import {
  buildChannelMerchantSummaries,
  buildChannelProductSummaries,
  filterChannelOffers,
  sortChannelOffers,
  dedupeChannelOffers,
} from "./ranking";
import {
  channelMerchantSchema,
  channelProductSchema,
  parseChannelOffer,
  parseChannelOfferFilters,
  type ChannelDataStatus,
  type ChannelMerchant,
  type ChannelOffer,
  type ChannelOfferFilters,
  type ChannelProduct,
  type ChannelSnapshot,
} from "./types";

export type ChannelDatabaseLoader = (context: {
  domain: "channels";
}) => Promise<unknown> | unknown;

export type ChannelRepositoryOptions = {
  database?: Database;
  databaseLoader?: ChannelDatabaseLoader;
  /** Compatibility injection used by route/unit tests and future adapters. */
  loadPublishedOffers?: ChannelDatabaseLoader;
  /** Explicitly describe a configured-but-unwired reader. */
  databaseConfigured?: boolean;
  fixture?: ChannelSnapshot;
  syntheticSnapshot?: () => ChannelSnapshot;
  now?: () => Date;
  cacheTtlMs?: number;
  allowSyntheticFixture?: boolean;
};

export type ChannelListResult = {
  /** Unfiltered read-model state, not the current query's match count. */
  snapshotEmpty?: boolean;
  offers: ChannelOffer[];
  products: ReturnType<typeof import("./ranking").buildChannelProductSummaries>;
  merchants: ReturnType<
    typeof import("./ranking").buildChannelMerchantSummaries
  >;
  totalOffers: number;
  generatedAt: string;
  generationId?: string;
  dataStatus: ChannelDataStatus;
  dataSource: ChannelSnapshot["dataSource"];
  warning?: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function publicationStatusFromDb(
  status: string | null | undefined,
):
  | "draft"
  | "pending_review"
  | "verified"
  | "published"
  | "rejected"
  | "suspended" {
  switch (status) {
    case "published":
      return "published";
    case "verified":
      return "verified";
    case "suspended":
      return "suspended";
    case "rejected":
      return "rejected";
    case "draft":
      return "draft";
    default:
      return "pending_review";
  }
}

function dataStatusForGeneration(
  generatedAt: string,
  now: Date,
): ChannelDataStatus {
  const age = now.getTime() - new Date(generatedAt).getTime();
  return !Number.isFinite(age) ||
    age < -5 * 60 * 1000 ||
    age > 36 * 60 * 60 * 1000
    ? "stale"
    : "published";
}

function cloneSnapshot(snapshot: ChannelSnapshot): ChannelSnapshot {
  return structuredClone(snapshot);
}

/**
 * Read the latest published channels generation.  The query only touches the
 * denormalized public tables; it never joins the official pricing domain or
 * triggers a source fetch during a request.
 */
export async function loadChannelSnapshotFromDatabase(
  database: Database = getPublicDataDatabase(),
): Promise<ChannelSnapshot | null> {
  return database.transaction(
    async (tx) => readChannelSnapshot(tx as unknown as Database),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function readChannelSnapshot(
  database: Database,
): Promise<ChannelSnapshot | null> {
  const [generation] = await database
    .select()
    .from(publicDataGenerations)
    .where(
      and(
        eq(publicDataGenerations.domain, "channels"),
        eq(publicDataGenerations.status, "published"),
      ),
    )
    .orderBy(desc(publicDataGenerations.publishedAt))
    .limit(1);
  if (!generation) return null;

  const [merchantRows, productRows, offerRows, firstObservations] =
    await Promise.all([
      database
        .select()
        .from(channelMerchants)
        .where(eq(channelMerchants.generationId, generation.id)),
      database
        .select()
        .from(channelProducts)
        .where(eq(channelProducts.generationId, generation.id)),
      database
        .select()
        .from(channelPublicOffers)
        .where(eq(channelPublicOffers.generationId, generation.id)),
      database
        .select({
          offerId: channelOfferObservations.offerId,
          firstSeenAt: min(channelOfferObservations.observedAt),
        })
        .from(channelOfferObservations)
        .innerJoin(
          channelPublicOffers,
          eq(channelOfferObservations.offerId, channelPublicOffers.id),
        )
        .where(eq(channelPublicOffers.generationId, generation.id))
        .groupBy(channelOfferObservations.offerId),
    ]);
  const firstSeenById = new Map(
    firstObservations.map((row) => [row.offerId, row.firstSeenAt]),
  );

  const generatedAt = generation.generatedAt.toISOString();
  const merchants: ChannelMerchant[] = merchantRows.flatMap((row) => {
    const parsed = channelMerchantSchema.safeParse({
      id: row.id,
      slug: row.slug,
      name: row.name,
      host: row.host,
      websiteUrl: row.websiteUrl,
      status: row.status,
      operatorType: row.operatorType ?? undefined,
      platforms: asStringArray(row.platforms),
      riskLabels: asStringArray(row.riskLabels),
      // Price collection is not an identity or risk review.
      lastReviewedAt: null,
    });
    return parsed.success ? [parsed.data] : [];
  });
  const products: ChannelProduct[] = productRows.flatMap((row) => {
    const parsed = channelProductSchema.safeParse({
      id: row.id,
      slug: row.slug,
      name: row.displayName,
      platform: row.platform,
      productType: row.productType,
      specification: row.spec ?? undefined,
      aliases: asStringArray(row.aliases),
      reviewStatus: "published",
    });
    return parsed.success ? [parsed.data] : [];
  });
  const merchantById = new Map(
    merchants.map((merchant) => [merchant.id, merchant]),
  );
  const productById = new Map(products.map((product) => [product.id, product]));
  const offers: ChannelOffer[] = offerRows.flatMap((row) => {
    const merchant = merchantById.get(row.merchantId);
    const product = productById.get(row.productId);
    if (!merchant || merchant.status !== "active" || !product) return [];
    const status = publicationStatusFromDb(row.status);
    try {
      const parsed = parseChannelOffer({
        id: row.id,
        merchantId: row.merchantId,
        merchantName: merchant.name,
        productId: row.productId,
        productName: product.name,
        platform: product.platform,
        productType: product.productType,
        specification: product.specification,
        rawTitle: row.title,
        sourceId: createHash("sha256")
          .update(JSON.stringify([row.sourceName, row.sourceUrl]))
          .digest("hex"),
        sourceType: row.sourceType,
        sourceUrl: row.sourceUrl,
        offerUrl: row.offerUrl,
        priceMinor: row.priceMinor,
        currency: row.currency,
        availabilityStatus: row.availability,
        stockQuantity: row.stockCount,
        minPurchaseQuantity: row.minOrderQuantity,
        tiers: row.bulkPricingTiers,
        labels: asStringArray(row.tags),
        riskLabels: asStringArray(row.riskLabels),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        firstSeenAt: firstSeenById.get(row.id) ?? row.observedAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        observedAt: row.observedAt.toISOString(),
        publicDedupeKey: createHash("sha256")
          .update(JSON.stringify([row.merchantId, row.productId, row.offerUrl]))
          .digest("hex"),
        classificationConfidence: 1,
        sourceHealth:
          status === "verified" &&
          dataStatusForGeneration(generatedAt, new Date()) !== "stale" &&
          dataStatusForGeneration(row.lastSeenAt.toISOString(), new Date()) !==
            "stale"
            ? "healthy"
            : "unknown",
        accessMode: "public",
        publicationStatus: status,
        published: status === "verified" || status === "published",
      });
      return [parsed];
    } catch {
      return [];
    }
  });
  const dataStatus = dataStatusForGeneration(generatedAt, new Date());
  return {
    domain: "channels",
    generationId: generation.id,
    generatedAt,
    dataStatus,
    dataSource: "database",
    offers,
    merchants,
    products,
    warning:
      dataStatus === "stale"
        ? "The latest public snapshot is older than 36 hours."
        : undefined,
  };
}

function configuredPublicDatabase(): boolean {
  try {
    return isPublicDataDatabaseConfigured();
  } catch {
    return false;
  }
}

let defaultRepository: ChannelRepository | null = null;

export class ChannelRepository {
  private readonly database: Database | undefined;
  private readonly loader: ChannelDatabaseLoader | undefined;
  private readonly explicitlyConfigured: boolean | undefined;
  private readonly syntheticSnapshotFactory:
    (() => ChannelSnapshot) | undefined;
  private readonly fixture: ChannelSnapshot;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly allowSyntheticFixture: boolean;
  private cached: { snapshot: ChannelSnapshot; cachedAt: number } | null = null;
  private lastGood: ChannelSnapshot | null = null;

  constructor(options: ChannelRepositoryOptions = {}) {
    this.database = options.database;
    this.loader = options.databaseLoader ?? options.loadPublishedOffers;
    this.explicitlyConfigured = options.databaseConfigured;
    this.syntheticSnapshotFactory = options.syntheticSnapshot;
    this.fixture = cloneSnapshot(
      options.fixture ?? createSyntheticChannelSnapshot(),
    );
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 30_000);
    this.allowSyntheticFixture =
      options.allowSyntheticFixture ?? process.env.NODE_ENV !== "production";
  }

  private fallback(reason: string): ChannelSnapshot {
    if (this.lastGood) {
      const degraded = cloneSnapshot(this.lastGood);
      degraded.dataStatus = "degraded";
      const now = this.now();
      const generationStale =
        dataStatusForGeneration(degraded.generatedAt, now) === "stale";
      for (const offer of degraded.offers) {
        if (
          generationStale ||
          dataStatusForGeneration(offer.lastSeenAt, now) === "stale"
        )
          offer.sourceHealth = "unknown";
      }
      degraded.warning = `${reason} Serving the last published snapshot.`;
      return degraded;
    }
    const configuredWithoutReader =
      this.explicitlyConfigured === true && !this.loader && !this.database;
    const configuredReader =
      configuredWithoutReader ||
      this.explicitlyConfigured === true ||
      Boolean(this.database) ||
      configuredPublicDatabase();
    if (!this.allowSyntheticFixture || configuredReader) {
      return {
        domain: "channels",
        generatedAt: this.now().toISOString(),
        dataStatus: "degraded",
        dataSource: "database",
        offers: [],
        merchants: [],
        products: [],
        warning: reason,
      };
    }
    const fixture = cloneSnapshot(
      this.syntheticSnapshotFactory?.() ?? this.fixture,
    );
    fixture.dataStatus = "synthetic";
    fixture.dataSource = "synthetic";
    fixture.warning = `${fixture.warning ?? "Synthetic fixture."} ${reason}`;
    return fixture;
  }

  async load(
    options: { forceRefresh?: boolean } = {},
  ): Promise<ChannelSnapshot> {
    const nowMs = this.now().getTime();
    if (
      !options.forceRefresh &&
      this.cached &&
      nowMs - this.cached.cachedAt <= this.cacheTtlMs
    ) {
      return cloneSnapshot(this.cached.snapshot);
    }
    try {
      const raw = this.loader
        ? await this.loader({ domain: "channels" })
        : this.database
          ? await loadChannelSnapshotFromDatabase(this.database)
          : configuredPublicDatabase()
            ? await loadChannelSnapshotFromDatabase()
            : null;
      const snapshot = this.normalizeLoaded(raw);
      const usable = snapshot && snapshot.offers.length > 0 ? snapshot : null;
      const resolved =
        usable ??
        this.fallback(
          this.explicitlyConfigured === true && !this.loader && !this.database
            ? "Database reader is wired but no loader is configured."
            : "No published channels snapshot is available.",
        );
      this.cached = { snapshot: resolved, cachedAt: nowMs };
      if (usable) this.lastGood = cloneSnapshot(usable);
      return cloneSnapshot(resolved);
    } catch (error) {
      // Keep database driver details (which can contain a connection URL or
      // provider-specific metadata) out of the public response.  Operators
      // can inspect the collector/web logs instead.  A short generic hint is
      // retained for local diagnostics and tests.
      const rawHint = error instanceof Error ? error.message.trim() : "";
      const hint =
        rawHint &&
        rawHint.length <= 80 &&
        !/[\r\n]|postgres|password|secret|token|@|:\/\//i.test(rawHint) &&
        /^[a-z0-9 .:_-]+$/i.test(rawHint)
          ? ` (${rawHint})`
          : "";
      const resolved = this.fallback(
        `Channels data is temporarily unavailable${hint}; the last safe snapshot may be shown.`,
      );
      this.cached = { snapshot: resolved, cachedAt: nowMs };
      return cloneSnapshot(resolved);
    }
  }

  private normalizeLoaded(raw: unknown): ChannelSnapshot | null {
    if (!raw) return null;
    const outer =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    const nested =
      outer && outer.data && typeof outer.data === "object"
        ? (outer.data as Record<string, unknown>)
        : outer && outer.snapshot && typeof outer.snapshot === "object"
          ? (outer.snapshot as Record<string, unknown>)
          : raw;
    const source = Array.isArray(nested)
      ? { offers: nested }
      : typeof nested === "object"
        ? (nested as Record<string, unknown>)
        : null;
    if (!source || !Array.isArray(source.offers)) return null;
    const offers: ChannelOffer[] = [];
    let rejected = 0;
    for (const input of source.offers) {
      try {
        offers.push(parseChannelOffer(input));
      } catch {
        rejected += 1;
      }
    }
    if (!offers.length) return null;
    const generatedAt =
      typeof source.generatedAt === "string"
        ? source.generatedAt
        : this.now().toISOString();
    const snapshot: ChannelSnapshot = {
      domain: "channels",
      generationId:
        typeof source.generationId === "string"
          ? source.generationId
          : undefined,
      generatedAt,
      dataStatus: dataStatusForGeneration(generatedAt, this.now()),
      dataSource: "database",
      offers: dedupeChannelOffers(offers, { now: this.now() }),
      merchants: Array.isArray(source.merchants)
        ? source.merchants.flatMap((item) => {
            const parsed = channelMerchantSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          })
        : [],
      products: Array.isArray(source.products)
        ? source.products.flatMap((item) => {
            const parsed = channelProductSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          })
        : [],
      warning:
        rejected > 0
          ? `${rejected} offer row(s) were rejected during validation.`
          : undefined,
    };
    return snapshot;
  }

  async list(
    filters: Partial<ChannelOfferFilters> | unknown = {},
  ): Promise<ChannelListResult> {
    const snapshot = await this.load();
    const parsedFilters = parseChannelOfferFilters(filters);
    const canonical = dedupeChannelOffers(snapshot.offers, { now: this.now() });
    const filteredUnique = filterChannelOffers(canonical, parsedFilters);
    const offers = sortChannelOffers(filteredUnique, {
      by: parsedFilters.sort,
      direction: parsedFilters.direction,
      query: parsedFilters.query,
    }).slice(parsedFilters.offset, parsedFilters.offset + parsedFilters.limit);
    const products = buildChannelProductSummaries(filteredUnique, {
      products: snapshot.products,
    });
    const merchants = buildChannelMerchantSummaries(filteredUnique);
    return {
      offers,
      products,
      merchants,
      totalOffers: filteredUnique.length,
      snapshotEmpty: snapshot.offers.length === 0,
      generatedAt: snapshot.generatedAt,
      generationId: snapshot.generationId,
      dataStatus: snapshot.dataStatus,
      dataSource: snapshot.dataSource,
      warning: snapshot.warning,
    };
  }

  async getById(id: string): Promise<ChannelOffer | null> {
    const snapshot = await this.load();
    return snapshot.offers.find((offer) => offer.id === id) ?? null;
  }

  async getSnapshot(options: { forceRefresh?: boolean } = {}) {
    return this.load(options);
  }

  async listOffers(filters: Partial<ChannelOfferFilters> | unknown = {}) {
    return (await this.list(filters)).offers;
  }

  async listProducts(filters: Partial<ChannelOfferFilters> | unknown = {}) {
    return (await this.list(filters)).products;
  }

  async listMerchants(filters: Partial<ChannelOfferFilters> | unknown = {}) {
    return (await this.list(filters)).merchants;
  }
}

export function createChannelRepository(
  options: ChannelRepositoryOptions = {},
): ChannelRepository {
  return new ChannelRepository(options);
}

export function getDefaultChannelRepository(): ChannelRepository {
  return (defaultRepository ??= new ChannelRepository());
}

export function resetDefaultChannelRepository(): void {
  defaultRepository = null;
}

export async function loadChannelSnapshot(
  options: ChannelRepositoryOptions = {},
): Promise<ChannelSnapshot> {
  const repository = Object.keys(options).length
    ? new ChannelRepository(options)
    : getDefaultChannelRepository();
  return repository.load();
}

export async function getChannelList(
  filters: Partial<ChannelOfferFilters> | unknown = {},
  options: ChannelRepositoryOptions = {},
): Promise<ChannelListResult> {
  const repository = Object.keys(options).length
    ? new ChannelRepository(options)
    : getDefaultChannelRepository();
  return repository.list(filters);
}
