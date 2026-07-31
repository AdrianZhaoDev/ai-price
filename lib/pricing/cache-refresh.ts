const PRODUCTION_REFRESH_URL = "http://127.0.0.1:3100/api/pricing/revalidate";

type RefreshPricingCacheOptions = {
  environment?: string;
  secret?: string;
  fetchImplementation?: typeof fetch;
  refreshUrl?: string;
};

export type PricingCacheRefreshResult =
  { refreshed: false; reason: "not-production" } | { refreshed: true };

export async function refreshPricingCacheAfterCollection({
  environment = process.env.NODE_ENV,
  secret = process.env.CRON_SECRET,
  fetchImplementation = fetch,
  refreshUrl = PRODUCTION_REFRESH_URL,
}: RefreshPricingCacheOptions = {}): Promise<PricingCacheRefreshResult> {
  if (environment !== "production") {
    return { refreshed: false, reason: "not-production" };
  }
  if (!secret) {
    throw new Error(
      "CRON_SECRET is required to refresh pricing caches in production.",
    );
  }

  const response = await fetchImplementation(refreshUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Pricing cache refresh failed with HTTP ${response.status}.`,
    );
  }

  return { refreshed: true };
}
