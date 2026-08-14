import { landingPagePath, landingPages } from "@/lib/landing-pages";
import { modelReleaseWatchPath } from "@/lib/model-release-watch";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import type { ModelCatalogSummary } from "@/lib/model-catalog/types";

export const CORE_PUBLIC_WARM_PATHS = [
  "/",
  "/en",
  "/china-ai-subscriptions",
  "/en/china-ai-subscriptions",
  "/api-pricing",
  "/en/api-pricing",
  modelReleaseWatchPath("zh-CN"),
  modelReleaseWatchPath("en"),
  "/sitemap.xml",
] as const;

export function buildModelWarmPaths(
  models: Pick<ModelCatalogSummary, "id">[],
): string[] {
  return [
    ...new Set([
      ...CORE_PUBLIC_WARM_PATHS,
      ...landingPages.flatMap((page) => [
        landingPagePath(page, "zh-CN"),
        landingPagePath(page, "en"),
      ]),
      ...models.flatMap((model) => [
        modelDetailPath(model.id, "zh-CN"),
        modelDetailPath(model.id, "en"),
      ]),
    ]),
  ];
}
