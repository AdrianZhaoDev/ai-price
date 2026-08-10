import {
  loadModelCatalogIds,
  loadModelCatalogSummaries,
  loadModelDetail,
} from "@/lib/model-catalog/repository";
import { unstable_cache } from "next/cache";

export const MODEL_CATALOG_CACHE_TAG = "model-catalog";

export function modelCacheTag(modelId: string): string {
  return `model-catalog:${modelId}`;
}

export const loadCachedModelCatalogSummaries = unstable_cache(
  loadModelCatalogSummaries,
  ["model-catalog-summaries"],
  { tags: [MODEL_CATALOG_CACHE_TAG], revalidate: false },
);

const loadCachedModelCatalogIds = unstable_cache(
  loadModelCatalogIds,
  ["model-catalog-ids"],
  { tags: [MODEL_CATALOG_CACHE_TAG], revalidate: false },
);

export async function loadCachedModelDetail(modelId: string) {
  if (!(await loadCachedModelCatalogIds()).includes(modelId)) return null;
  return unstable_cache(
    () => loadModelDetail(modelId),
    ["model-catalog-detail", modelId],
    {
      tags: [modelCacheTag(modelId)],
      revalidate: false,
    },
  )();
}
