export type SubscriptionPriceChange = {
  id: string;
  providerId: string;
  providerName: string;
  planId: string;
  planName: string;
  regionCode: string | null;
  regionName: string | null;
  currency: string;
  previousAmountMinor: number;
  currentAmountMinor: number;
  previousDisplayPrice: string;
  currentDisplayPrice: string;
  billingPeriod: string | null;
  confirmedAt: string;
  sourceUrl: string;
};

export type SubscriptionHistory = {
  available: boolean;
  limit: number;
  events: SubscriptionPriceChange[];
};
