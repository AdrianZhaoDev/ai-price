import {
  AppStoreAdapter,
  appStorefronts,
} from "@/lib/collectors/adapters/app-store";
import { officialPageAdapters } from "@/lib/collectors/adapters/official-pages";
import type { PriceSourceAdapter } from "@/lib/collectors/types";

const globalApps = [
  { providerSlug: "chatgpt", appId: "6448311069" },
  { providerSlug: "gemini", appId: "6477489729" },
  { providerSlug: "claude", appId: "6473753684" },
  { providerSlug: "grok", appId: "6670324846" },
] as const;

export function createCollectorRegistry(): PriceSourceAdapter[] {
  const appStoreAdapters = globalApps.flatMap((app) =>
    appStorefronts.map(
      (storefront) =>
        new AppStoreAdapter(app.providerSlug, app.appId, storefront),
    ),
  );
  return [...appStoreAdapters, ...officialPageAdapters];
}
