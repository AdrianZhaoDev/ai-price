import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    status: subscriptionStatusEnum("status").default("pending").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
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
