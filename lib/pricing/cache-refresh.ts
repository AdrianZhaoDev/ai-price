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

  const changedModelIdBatches =
    changedModelIds.length === 0
      ? [[]]
      : Array.from(
          { length: Math.ceil(changedModelIds.length / 1000) },
          (_, index) => changedModelIds.slice(index * 1000, (index + 1) * 1000),
        );
  for (const [index, batch] of changedModelIdBatches.entries()) {
    const response = await fetchImplementation(refreshUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        catalogVersion,
        catalogChanged: index === 0 && catalogChanged,
        changedModelIds: batch,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(
        `Pricing cache refresh failed with HTTP ${response.status}.`,
      );
    }
  }

  const paths = changedModelIds.flatMap((modelId) => [
    modelDetailPath(modelId),
    modelDetailPath(modelId, "en"),
  ]);
  if (catalogChanged) paths.push("/api-pricing", "/en/api-pricing");
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
import { modelDetailPath } from "@/lib/model-catalog/paths";
