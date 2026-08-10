const PRODUCTION_REFRESH_URL = "http://127.0.0.1:3100/api/pricing/revalidate";

type RefreshPricingCacheOptions = {
  environment?: string;
  secret?: string;
  fetchImplementation?: typeof fetch;
  refreshUrl?: string;
  catalogVersion?: string;
  catalogChanged?: boolean;
  changedModelIds?: string[];
  warmBaseUrl?: string;
};

export type PricingCacheRefreshResult =
  { refreshed: false; reason: "not-production" } | { refreshed: true };

export async function refreshPricingCacheAfterCollection({
  environment = process.env.NODE_ENV,
  secret = process.env.CRON_SECRET,
  fetchImplementation = fetch,
  refreshUrl = PRODUCTION_REFRESH_URL,
  catalogVersion,
  catalogChanged = false,
  changedModelIds = [],
  warmBaseUrl = "http://127.0.0.1:3100",
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
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ catalogVersion, catalogChanged, changedModelIds }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Pricing cache refresh failed with HTTP ${response.status}.`,
    );
  }

  const paths = changedModelIds.map(
    (modelId) =>
      `/models/${modelId
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`,
  );
  if (catalogChanged) paths.push("/api-pricing");
  paths.push("/sitemap.xml");
  for (let index = 0; index < paths.length; index += 5) {
    const batch = paths.slice(index, index + 5);
    await Promise.all(
      batch.map(async (path) => {
        const warmResponse = await fetchImplementation(
          new URL(path, warmBaseUrl),
          {
            cache: "no-store",
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (!warmResponse.ok) {
          throw new Error(
            `Model catalog warm failed for ${path} with HTTP ${warmResponse.status}.`,
          );
        }
      }),
    );
  }

  return { refreshed: true };
}
