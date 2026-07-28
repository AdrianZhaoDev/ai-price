export type PriceMode = "global" | "china-subscription" | "api";

export type PriceStatus = "verified" | "stale" | "pending" | "unpublished";

export type ApiPriceType =
  "cached_input" | "input" | "output" | "cache_write" | "other";

export type BillingPeriod =
  "week" | "month" | "quarter" | "year" | "one_time" | "usage";

export type PriceOffer = {
  id: string;
  planId: string;
  planName: string;
  amountMinor: number | null;
  currency: string | null;
  displayPrice: string;
  billingPeriod: BillingPeriod;
  regionCode?: string;
  regionName?: string;
  convertedCny?: number;
  fxRate?: number;
  fxRateObservedAt?: string;
  sourceUrl?: string;
  unit?: string;
  note?: string;
  status: PriceStatus;
  observedAt?: string;
  modelName?: string;
  modelSlug?: string;
  modelOrder?: number;
  priceType?: ApiPriceType;
  priceTier?: string;
  tierOrder?: number;
  category?: string;
};

export type ProviderCatalogItem = {
  id: string;
  name: string;
  label: string;
  description: string;
  mode: PriceMode;
  rank?: number;
  appStoreId?: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceType: "app_store" | "official_web" | "official_api";
  color: string;
  status: PriceStatus;
  lastCheckedAt?: string;
  offers: PriceOffer[];
};

export type ModeDefinition = {
  id: PriceMode;
  label: string;
  shortLabel: string;
  description: string;
};
