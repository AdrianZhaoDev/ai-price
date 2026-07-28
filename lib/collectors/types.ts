export type CollectionChannel = "app_store" | "official_web" | "official_api";

export type ApiPriceType =
  "cached_input" | "input" | "output" | "cache_write" | "other";

export type NormalizedOffer = {
  providerSlug: string;
  productSlug: string;
  canonicalPlanSlug: string | null;
  rawPlanName: string;
  mode: "subscription" | "api";
  channel: CollectionChannel;
  region: string | null;
  storefront: string | null;
  currency: string;
  amountMinor: number | null;
  displayPrice: string;
  status: "verified" | "unpublished";
  billingPeriod:
    "week" | "month" | "quarter" | "year" | "one_time" | "usage" | null;
  unit: string | null;
  taxIncluded: boolean | null;
  sourceUrl: string;
  observedAt: string;
  parserVersion: string;
  modelName?: string;
  modelSlug?: string;
  modelOrder?: number;
  priceType?: ApiPriceType;
  priceTier?: string;
  tierOrder?: number;
  category?: string;
};

export type CollectionContext = {
  observedAt: Date;
  signal?: AbortSignal;
};

export type RawCollectionResult = {
  sourceUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  contentHash: string;
  observedAt: string;
};

export type SourceHealth = {
  ok: boolean;
  code:
    | "OK"
    | "EMPTY_RESULT"
    | "MISSING_PRICE"
    | "PLAN_COUNT_COLLAPSE"
    | "ACCESS_BLOCKED"
    | "STRUCTURE_CHANGED";
  message: string;
  details?: Record<string, unknown>;
};

export interface PriceSourceAdapter {
  id: string;
  providerSlug: string;
  sourceUrl: string;
  parserVersion: string;
  collect(context: CollectionContext): Promise<RawCollectionResult>;
  parse(raw: RawCollectionResult): Promise<NormalizedOffer[]>;
  healthCheck(offers: NormalizedOffer[]): SourceHealth;
}

export class CollectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CollectionError";
  }
}
