import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Last accepted evidence survives removal from the current public catalogue.
// This is a collector-only safety baseline, not a public price-history API.
export const publicOfferBaselines = pgTable(
  "public_offer_baselines",
  {
    domain: text("domain").notNull(),
    offerId: text("offer_id").notNull(),
    identity: jsonb("identity").$type<unknown[]>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.domain, table.offerId] }),
    index("public_offer_baselines_identity_idx").on(
      table.domain,
      sql`md5(${table.identity}::text)`,
    ),
  ],
);

export const priceModeEnum = pgEnum("price_mode", [
  "global",
  "china_subscription",
  "api",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "app_store",
  "official_web",
  "official_api",
  "manual_official",
  "community_catalog",
]);

export const recordStatusEnum = pgEnum("record_status", [
  "verified",
  "stale",
  "pending",
  "unpublished",
]);

export const collectionStatusEnum = pgEnum("collection_status", [
  "running",
  "success",
  "partial",
  "failed",
]);

/**
 * Public comparison data is intentionally isolated from the official pricing
 * tables above.  The same generation boundary is used by the GitHub-hosted
 * collectors and by the read-only web process, so a broken import cannot
 * expose a half-written snapshot.
 */
export const publicDataDomainEnum = pgEnum("public_data_domain", [
  "channels",
  "transit",
]);

export const publicDataGenerationStatusEnum = pgEnum(
  "public_data_generation_status",
  ["building", "published", "failed"],
);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "pending",
  "active",
  "unsubscribed",
]);

export const tokenPurposeEnum = pgEnum("token_purpose", [
  "confirm_subscription",
  "unsubscribe",
]);

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    rank: integer("rank"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("providers_slug_unique").on(table.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: uuid("provider_id")
      .references(() => providers.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    mode: priceModeEnum("mode").notNull(),
    appStoreId: text("app_store_id"),
    enabled: boolean("enabled").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("products_provider_slug_unique").on(
      table.providerId,
      table.slug,
    ),
    index("products_mode_idx").on(table.mode),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    canonicalSlug: text("canonical_slug").notNull(),
    name: text("name").notNull(),
    billingPeriod: text("billing_period"),
    unit: text("unit"),
    active: boolean("active").default(true).notNull(),
    mappingConfidence: integer("mapping_confidence").default(100).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("plans_product_slug_unique").on(
      table.productId,
      table.canonicalSlug,
    ),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    type: sourceTypeEnum("type").notNull(),
    url: text("url").notNull(),
    parserVersion: text("parser_version").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastContentHash: text("last_content_hash"),
    lastOfferCount: integer("last_offer_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sources_product_slug_unique").on(table.productId, table.slug),
    index("sources_health_idx").on(
      table.enabled,
      table.consecutiveFailures,
      table.lastSuccessAt,
    ),
  ],
);

export const collectionRuns = pgTable(
  "collection_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: collectionStatusEnum("status").default("running").notNull(),
    trigger: text("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    sourceCount: integer("source_count").default(0).notNull(),
    successCount: integer("success_count").default(0).notNull(),
    failureCount: integer("failure_count").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [index("collection_runs_started_idx").on(table.startedAt)],
);

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    baseCurrency: text("base_currency").default("CNY").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    cnyPerUnit: numeric("cny_per_unit", {
      precision: 20,
      scale: 10,
      mode: "number",
    }).notNull(),
    rateDate: text("rate_date").notNull(),
    sourceUrl: text("source_url").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("fx_rates_currency_date_unique").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate,
    ),
    index("fx_rates_latest_idx").on(table.quoteCurrency, table.observedAt),
  ],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .references(() => plans.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => sources.id, { onDelete: "cascade" })
      .notNull(),
    collectionRunId: uuid("collection_run_id").references(
      () => collectionRuns.id,
      { onDelete: "set null" },
    ),
    rawPlanName: text("raw_plan_name").notNull(),
    region: text("region"),
    storefront: text("storefront"),
    currency: text("currency").notNull(),
    amountMinor: numeric("amount_minor", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    convertedCny: numeric("converted_cny", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    fxRate: numeric("fx_rate", {
      precision: 20,
      scale: 10,
      mode: "number",
    }),
    fxRateObservedAt: timestamp("fx_rate_observed_at", {
      withTimezone: true,
    }),
    displayPrice: text("display_price").notNull(),
    billingPeriod: text("billing_period"),
    unit: text("unit"),
    taxIncluded: boolean("tax_included"),
    status: recordStatusEnum("status").default("verified").notNull(),
    rawHash: text("raw_hash").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("price_observation_run_identity_unique").on(
      table.planId,
      table.sourceId,
      table.storefront,
      table.currency,
      table.rawHash,
      table.collectionRunId,
    ),
    index("price_observations_latest_idx").on(
      table.planId,
      table.storefront,
      table.observedAt,
    ),
  ],
);

export const priceChangeEvents = pgTable(
  "price_change_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .references(() => plans.id, { onDelete: "cascade" })
      .notNull(),
    storefront: text("storefront"),
    previousObservationId: uuid("previous_observation_id").references(
      () => priceObservations.id,
      { onDelete: "set null" },
    ),
    currentObservationId: uuid("current_observation_id")
      .references(() => priceObservations.id, { onDelete: "cascade" })
      .notNull(),
    changePercent: integer("change_percent"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("price_change_events_pending_idx").on(table.notifiedAt)],
);

export const priceChangeCandidates = pgTable(
  "price_change_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .references(() => plans.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => sources.id, { onDelete: "cascade" })
      .notNull(),
    storefrontKey: text("storefront_key").default("").notNull(),
    previousObservationId: uuid("previous_observation_id")
      .references(() => priceObservations.id, { onDelete: "cascade" })
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    lastCollectionRunId: uuid("last_collection_run_id")
      .references(() => collectionRuns.id, { onDelete: "cascade" })
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("price_change_candidates_identity_unique").on(
      table.planId,
      table.sourceId,
      table.storefrontKey,
    ),
    index("price_change_candidates_source_idx").on(table.sourceId),
  ],
);

export const apiRankingState = pgTable(
  "api_ranking_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    metric: text("metric").notNull(),
    entryKey: text("entry_key").notNull(),
    providerSlug: text("provider_slug").notNull(),
    providerName: text("provider_name").notNull(),
    providerColor: text("provider_color").notNull(),
    modelSlug: text("model_slug").notNull(),
    modelName: text("model_name").notNull(),
    modelOrder: integer("model_order").notNull(),
    offerPlanSlug: text("offer_plan_slug"),
    rank: integer("rank"),
    priceCny: numeric("price_cny", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    displayPrice: text("display_price"),
    active: boolean("active").default(true).notNull(),
    collectionRunId: uuid("collection_run_id").references(
      () => collectionRuns.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("api_ranking_state_identity_unique").on(
      table.metric,
      table.entryKey,
    ),
    index("api_ranking_state_active_idx").on(table.metric, table.active),
  ],
);

export const apiRankingEvents = pgTable(
  "api_ranking_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collectionRunId: uuid("collection_run_id")
      .references(() => collectionRuns.id, { onDelete: "cascade" })
      .notNull(),
    metric: text("metric").notNull(),
    entryKey: text("entry_key").notNull(),
    providerSlug: text("provider_slug").notNull(),
    providerName: text("provider_name").notNull(),
    modelSlug: text("model_slug").notNull(),
    modelName: text("model_name").notNull(),
    previousRank: integer("previous_rank"),
    currentRank: integer("current_rank"),
    previousPriceCny: numeric("previous_price_cny", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    currentPriceCny: numeric("current_price_cny", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    previousDisplayPrice: text("previous_display_price"),
    currentDisplayPrice: text("current_display_price"),
    rankingSnapshot: jsonb("ranking_snapshot")
      .$type<unknown[]>()
      .default([])
      .notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("api_ranking_events_run_identity_unique").on(
      table.collectionRunId,
      table.metric,
      table.entryKey,
    ),
    index("api_ranking_events_latest_idx").on(
      table.metric,
      table.entryKey,
      table.createdAt,
    ),
    index("api_ranking_events_pending_idx").on(table.notifiedAt),
  ],
);

export const modelCatalogImports = pgTable(
  "model_catalog_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: text("version").notNull(),
    contentHash: text("content_hash").notNull(),
    status: text("status").notNull(),
    modelCount: integer("model_count").default(0).notNull(),
    providerCount: integer("provider_count").default(0).notNull(),
    offeringCount: integer("offering_count").default(0).notNull(),
    changedModelCount: integer("changed_model_count").default(0).notNull(),
    changedModelIds: jsonb("changed_model_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    addedModelCount: integer("added_model_count").default(0).notNull(),
    unlinkedProviderModelCount: integer("unlinked_provider_model_count")
      .default(0)
      .notNull(),
    error: text("error"),
    cacheRefreshedAt: timestamp("cache_refreshed_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("model_catalog_imports_content_hash_idx").on(table.contentHash),
    index("model_catalog_imports_version_idx").on(table.version),
    index("model_catalog_imports_latest_idx").on(table.createdAt),
  ],
);

export const modelLabs = pgTable("model_labs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  origin: text("origin").notNull(),
  active: boolean("active").default(true).notNull(),
  contentHash: text("content_hash").notNull(),
  lastImportId: uuid("last_import_id").references(
    () => modelCatalogImports.id,
    {
      onDelete: "set null",
    },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const modelCatalogProviders = pgTable("model_catalog_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  docUrl: text("doc_url"),
  apiUrl: text("api_url"),
  npmPackage: text("npm_package"),
  origin: text("origin").notNull(),
  active: boolean("active").default(true).notNull(),
  contentHash: text("content_hash").notNull(),
  lastImportId: uuid("last_import_id").references(
    () => modelCatalogImports.id,
    {
      onDelete: "set null",
    },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const modelCatalogModels = pgTable(
  "model_catalog_models",
  {
    id: text("id").primaryKey(),
    labId: text("lab_id")
      .references(() => modelLabs.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    family: text("family"),
    contextTokens: integer("context_tokens"),
    outputTokens: integer("output_tokens"),
    inputModalities: jsonb("input_modalities")
      .$type<string[]>()
      .default([])
      .notNull(),
    outputModalities: jsonb("output_modalities")
      .$type<string[]>()
      .default([])
      .notNull(),
    capabilities: jsonb("capabilities")
      .$type<Record<string, boolean | undefined>>()
      .default({})
      .notNull(),
    knowledge: text("knowledge"),
    openWeights: boolean("open_weights").default(false).notNull(),
    releaseDate: text("release_date").notNull(),
    updatedDate: text("updated_date").notNull(),
    providerCount: integer("provider_count").default(0).notNull(),
    minInputPrice: numeric("min_input_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    minInputProviderId: text("min_input_provider_id"),
    minOutputPrice: numeric("min_output_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    minOutputProviderId: text("min_output_provider_id"),
    origin: text("origin").notNull(),
    active: boolean("active").default(true).notNull(),
    contentHash: text("content_hash").notNull(),
    detailChangedAt: timestamp("detail_changed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastImportId: uuid("last_import_id").references(
      () => modelCatalogImports.id,
      {
        onDelete: "set null",
      },
    ),
  },
  (table) => [
    index("model_catalog_models_active_release_idx").on(
      table.active,
      table.releaseDate,
    ),
    index("model_catalog_models_lab_idx").on(table.labId),
  ],
);

export const modelProviderOfferings = pgTable(
  "model_provider_offerings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: text("provider_id")
      .references(() => modelCatalogProviders.id, { onDelete: "cascade" })
      .notNull(),
    providerModelId: text("provider_model_id").notNull(),
    canonicalModelId: text("canonical_model_id")
      .references(() => modelCatalogModels.id, { onDelete: "cascade" })
      .notNull(),
    contextTokens: integer("context_tokens"),
    outputTokens: integer("output_tokens"),
    inputPrice: numeric("input_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    outputPrice: numeric("output_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    status: text("status"),
    capabilities: jsonb("capabilities")
      .$type<Record<string, boolean | undefined>>()
      .default({})
      .notNull(),
    inputModalities: jsonb("input_modalities")
      .$type<string[]>()
      .default([])
      .notNull(),
    outputModalities: jsonb("output_modalities")
      .$type<string[]>()
      .default([])
      .notNull(),
    costDetails: jsonb("cost_details")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    sourceUrl: text("source_url"),
    origin: text("origin").notNull(),
    active: boolean("active").default(true).notNull(),
    contentHash: text("content_hash").notNull(),
    lastImportId: uuid("last_import_id").references(
      () => modelCatalogImports.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("model_provider_offerings_identity_unique").on(
      table.providerId,
      table.providerModelId,
    ),
    index("model_provider_offerings_model_idx").on(table.canonicalModelId),
  ],
);

export const modelCatalogEvents = pgTable(
  "model_catalog_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id")
      .references(() => modelCatalogImports.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    modelId: text("model_id").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("model_catalog_events_import_model_unique").on(
      table.importId,
      table.eventType,
      table.modelId,
    ),
    index("model_catalog_events_pending_idx").on(table.notifiedAt),
  ],
);

export const collectionErrors = pgTable(
  "collection_errors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .references(() => sources.id, { onDelete: "cascade" })
      .notNull(),
    collectionRunId: uuid("collection_run_id").references(
      () => collectionRuns.id,
      { onDelete: "set null" },
    ),
    code: text("code").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    alertSentAt: timestamp("alert_sent_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("collection_errors_open_idx").on(
      table.sourceId,
      table.resolvedAt,
      table.createdAt,
    ),
  ],
);

export const publicDataGenerations = pgTable(
  "public_data_generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domain: publicDataDomainEnum("domain").notNull(),
    status: publicDataGenerationStatusEnum("status")
      .default("building")
      .notNull(),
    sourceCount: integer("source_count").default(0).notNull(),
    recordCount: integer("record_count").default(0).notNull(),
    contentHash: text("content_hash").notNull(),
    sourceVersions:
      jsonb("source_versions").$type<
        Array<{ stationId: string; generatedAt: string; contentHash: string }>
      >(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("public_data_generations_latest_idx").on(
      table.domain,
      table.status,
      table.generatedAt,
    ),
    uniqueIndex("public_data_generations_domain_hash_unique").on(
      table.domain,
      table.contentHash,
    ),
  ],
);

export const channelMerchants = pgTable(
  "channel_merchants",
  {
    id: text("id").primaryKey(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    host: text("host").notNull(),
    websiteUrl: text("website_url").notNull(),
    status: text("status").default("pending_review").notNull(),
    operatorType: text("operator_type"),
    platforms: jsonb("platforms").$type<string[]>().default([]).notNull(),
    riskLabels: jsonb("risk_labels").$type<string[]>().default([]).notNull(),
    offerCount: integer("offer_count").default(0).notNull(),
    inStockCount: integer("in_stock_count").default(0).notNull(),
    latestSeenAt: timestamp("latest_seen_at", { withTimezone: true }),
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("channel_merchants_generation_slug_unique").on(
      table.generationId,
      table.slug,
    ),
    index("channel_merchants_generation_search_idx").on(table.generationId),
    index("channel_merchants_generation_status_idx").on(
      table.generationId,
      table.status,
    ),
  ],
);

export const channelProducts = pgTable(
  "channel_products",
  {
    id: text("id").primaryKey(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    platform: text("platform").notNull(),
    productType: text("product_type").notNull(),
    spec: text("spec"),
    summary: text("summary"),
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
    offerCount: integer("offer_count").default(0).notNull(),
    inStockCount: integer("in_stock_count").default(0).notNull(),
    latestSeenAt: timestamp("latest_seen_at", { withTimezone: true }),
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("channel_products_generation_slug_unique").on(
      table.generationId,
      table.slug,
    ),
    index("channel_products_generation_filter_idx").on(
      table.generationId,
      table.platform,
      table.productType,
    ),
    index("channel_products_generation_search_idx").on(table.generationId),
  ],
);

export const channelPublicOffers = pgTable(
  "channel_public_offers",
  {
    id: text("id").primaryKey(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "cascade" })
      .notNull(),
    merchantId: text("merchant_id")
      .references(() => channelMerchants.id, { onDelete: "restrict" })
      .notNull(),
    productId: text("product_id")
      .references(() => channelProducts.id, { onDelete: "restrict" })
      .notNull(),
    sourceName: text("source_name").notNull(),
    sourceType: text("source_type").default("manual_snapshot").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    offerUrl: text("offer_url").notNull(),
    priceMinor: numeric("price_minor", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    currency: text("currency").notNull(),
    availability: text("availability").default("unknown").notNull(),
    stockCount: integer("stock_count"),
    minOrderQuantity: integer("min_order_quantity"),
    bulkPricingTiers: jsonb("bulk_pricing_tiers")
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    riskLabels: jsonb("risk_labels").$type<string[]>().default([]).notNull(),
    status: text("status").default("pending_review").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    searchText: text("search_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("channel_public_offers_generation_filter_idx").on(
      table.generationId,
      table.availability,
      table.currency,
      table.priceMinor,
    ),
    index("channel_public_offers_generation_merchant_idx").on(
      table.generationId,
      table.merchantId,
      table.lastSeenAt,
    ),
    index("channel_public_offers_generation_product_idx").on(
      table.generationId,
      table.productId,
      table.lastSeenAt,
    ),
    index("channel_public_offers_generation_search_idx").on(table.generationId),
  ],
);

export const channelOfferObservations = pgTable(
  "channel_offer_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Stable external offer key, independent of replaceable current rows.
    offerId: text("offer_id").notNull(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "restrict" })
      .notNull(),
    offerSnapshot: jsonb("offer_snapshot")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    priceMinor: numeric("price_minor", {
      precision: 20,
      scale: 6,
      mode: "number",
    }),
    currency: text("currency").notNull(),
    availability: text("availability").notNull(),
    stockCount: integer("stock_count"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    rawHash: text("raw_hash").notNull(),
  },
  (table) => [
    uniqueIndex("channel_offer_observations_identity_unique").on(
      table.offerId,
      table.observedAt,
      table.rawHash,
    ),
    index("channel_offer_observations_offer_idx").on(
      table.offerId,
      table.observedAt,
    ),
  ],
);

export const transitStations = pgTable(
  "transit_stations",
  {
    id: text("id").primaryKey(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    websiteUrl: text("website_url").notNull(),
    apiBaseUrl: text("api_base_url"),
    status: text("status").default("unknown").notNull(),
    dataStatus: text("data_status").default("pending_review").notNull(),
    stationSystem: text("station_system"),
    operatorType: text("operator_type"),
    commercialRelation: text("commercial_relation").default("none").notNull(),
    summary: text("summary"),
    channelTypes: jsonb("channel_types")
      .$type<string[]>()
      .default([])
      .notNull(),
    accountPools: jsonb("account_pools")
      .$type<string[]>()
      .default([])
      .notNull(),
    paymentMethods: jsonb("payment_methods")
      .$type<string[]>()
      .default([])
      .notNull(),
    riskLabels: jsonb("risk_labels").$type<string[]>().default([]).notNull(),
    usageAdvice: jsonb("usage_advice").$type<string[]>().default([]).notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    lowestMultiplier: numeric("lowest_multiplier", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    currency: text("currency"),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
    lastCollectedAt: timestamp("last_collected_at", { withTimezone: true }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("transit_stations_generation_slug_unique").on(
      table.generationId,
      table.slug,
    ),
    index("transit_stations_generation_filter_idx").on(
      table.generationId,
      table.status,
      table.dataStatus,
      table.lowestMultiplier,
    ),
    index("transit_stations_generation_search_idx").on(table.generationId),
  ],
);

export const transitOffers = pgTable(
  "transit_offers",
  {
    id: text("id").primaryKey(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "cascade" })
      .notNull(),
    stationId: text("station_id")
      .references(() => transitStations.id, { onDelete: "cascade" })
      .notNull(),
    family: text("family").notNull(),
    standardModel: text("standard_model").notNull(),
    groupName: text("group_name"),
    billingMode: text("billing_mode").notNull(),
    currency: text("currency").notNull(),
    rechargeRatio: numeric("recharge_ratio", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    rechargeCoefficient: numeric("recharge_coefficient", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    modelMultiplier: numeric("model_multiplier", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    stationGroupMultiplier: numeric("station_group_multiplier", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    combinedMultiplier: numeric("combined_multiplier", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    inputPrice: numeric("input_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    outputPrice: numeric("output_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    cacheReadPrice: numeric("cache_read_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    cacheWritePrice: numeric("cache_write_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    imageOutputPrice: numeric("image_output_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    fixedPrice: numeric("fixed_price", {
      precision: 20,
      scale: 8,
      mode: "number",
    }),
    fixedPriceCurrency: text("fixed_price_currency"),
    fixedPriceUnit: text("fixed_price_unit"),
    accountPool: text("account_pool"),
    channelType: text("channel_type"),
    priceSourceUrl: text("price_source_url"),
    priceSourceLabel: text("price_source_label"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    availability: jsonb("availability")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    status: text("status").default("unknown").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transit_offers_generation_station_idx").on(
      table.generationId,
      table.stationId,
      table.status,
    ),
    index("transit_offers_generation_model_idx").on(
      table.generationId,
      table.standardModel,
      table.family,
      table.combinedMultiplier,
    ),
  ],
);

export const transitAvailabilitySamples = pgTable(
  "transit_availability_samples",
  {
    id: text("id").primaryKey(),
    generationId: uuid("generation_id")
      .references(() => publicDataGenerations.id, { onDelete: "cascade" })
      .notNull(),
    stationId: text("station_id")
      .references(() => transitStations.id, { onDelete: "cascade" })
      .notNull(),
    offerId: text("offer_id").references(() => transitOffers.id, {
      onDelete: "set null",
    }),
    scope: text("scope").notNull(),
    standardModel: text("standard_model"),
    groupName: text("group_name"),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    matchLevel: text("match_level").notNull(),
    success: boolean("success").notNull(),
    latencyMs: integer("latency_ms"),
    sampleCount: integer("sample_count").default(1).notNull(),
    sevenDayRate: numeric("seven_day_rate", {
      precision: 8,
      scale: 5,
      mode: "number",
    }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
  },
  (table) => [
    index("transit_availability_samples_scope_idx").on(
      table.stationId,
      table.scope,
      table.standardModel,
      table.groupName,
      table.checkedAt,
    ),
    index("transit_availability_samples_generation_idx").on(
      table.generationId,
      table.checkedAt,
    ),
  ],
);

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emailNormalized: text("email_normalized").notNull(),
    emailHash: text("email_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("subscribers_email_hash_unique").on(table.emailHash)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriberId: uuid("subscriber_id")
      .references(() => subscribers.id, { onDelete: "cascade" })
      .notNull(),
    providerSlug: text("provider_slug").notNull(),
    planSlug: text("plan_slug"),
    locale: text("locale").default("zh-CN").notNull(),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    migratedFromApiRanking: boolean("migrated_from_api_ranking")
      .default(false)
      .notNull(),
    successEmailPending: boolean("success_email_pending")
      .default(false)
      .notNull(),
    successEmailAttempts: integer("success_email_attempts")
      .default(0)
      .notNull(),
    successEmailNextAttemptAt: timestamp("success_email_next_attempt_at", {
      withTimezone: true,
    }),
    successEmailLockedAt: timestamp("success_email_locked_at", {
      withTimezone: true,
    }),
    successEmailSentAt: timestamp("success_email_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("subscriptions_scope_unique").on(
      table.subscriberId,
      table.providerSlug,
      table.planSlug,
    ),
    index("subscriptions_active_idx").on(
      table.status,
      table.providerSlug,
      table.planSlug,
    ),
    index("subscriptions_success_email_pending_idx").on(
      table.successEmailPending,
      table.successEmailNextAttemptAt,
    ),
  ],
);

export const subscriptionAttempts = pgTable(
  "subscription_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ipHash: text("ip_hash").notNull(),
    emailHash: text("email_hash").notNull(),
    providerSlug: text("provider_slug").notNull(),
    planSlug: text("plan_slug").notNull(),
    accepted: boolean("accepted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscription_attempts_created_idx").on(table.createdAt),
    index("subscription_attempts_ip_created_idx").on(
      table.ipHash,
      table.createdAt,
    ),
    index("subscription_attempts_ip_accepted_created_idx").on(
      table.ipHash,
      table.accepted,
      table.createdAt,
    ),
  ],
);

export const confirmationTokens = pgTable(
  "confirmation_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .references(() => subscriptions.id, { onDelete: "cascade" })
      .notNull(),
    purpose: tokenPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    relatedSubscriptionIds: jsonb("related_subscription_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("confirmation_tokens_hash_unique").on(table.tokenHash),
    index("confirmation_tokens_lookup_idx").on(
      table.purpose,
      table.expiresAt,
      table.consumedAt,
    ),
  ],
);

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageType: text("message_type").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("email_deliveries_dedupe_unique").on(table.dedupeKey),
    index("email_deliveries_created_idx").on(table.createdAt),
  ],
);

export const transitSubmissionVerifications = pgTable(
  "transit_submission_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emailHash: text("email_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transit_submission_verifications_email_idx").on(
      table.emailHash,
      table.createdAt,
    ),
    index("transit_submission_verifications_expiry_idx").on(table.expiresAt),
  ],
);

export const transitSubmissions = pgTable(
  "transit_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteUrl: text("website_url").notNull(),
    websiteKey: text("website_key").notNull(),
    description: text("description").notNull(),
    submitterEmailHash: text("submitter_email_hash").notNull(),
    submitterEmailEncrypted: text("submitter_email_encrypted").notNull(),
    notificationStatus: text("notification_status")
      .default("pending")
      .notNull(),
    notificationAttempts: integer("notification_attempts").default(0).notNull(),
    notificationLastAttemptAt: timestamp("notification_last_attempt_at", {
      withTimezone: true,
    }),
    notificationSentAt: timestamp("notification_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("transit_submissions_website_key_unique").on(table.websiteKey),
    index("transit_submissions_created_idx").on(table.createdAt),
  ],
);

export const transitSubmissionAttempts = pgTable(
  "transit_submission_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transit_submission_attempts_created_idx").on(table.createdAt),
    index("transit_submission_attempts_ip_created_idx").on(
      table.ipHash,
      table.createdAt,
    ),
  ],
);
