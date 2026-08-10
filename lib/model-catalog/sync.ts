import { persistModelCatalog } from "@/lib/model-catalog/persistence";
import { fetchModelsDevCatalog } from "@/lib/model-catalog/source";
import type { ModelCatalogImportResult } from "@/lib/model-catalog/types";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { modelCatalogImports } from "@/lib/db/schema";
import { contentHash } from "@/lib/model-catalog/source";

export async function syncModelsDevCatalog(
  options: {
    fetchImplementation?: typeof fetch;
  } = {},
): Promise<ModelCatalogImportResult> {
  let attemptedVersion = "unknown";
  try {
    const catalog = await fetchModelsDevCatalog(options.fetchImplementation);
    attemptedVersion = catalog.version;
    return await persistModelCatalog(catalog);
  } catch (error) {
    if (isDatabaseConfigured()) {
      const message = error instanceof Error ? error.message : String(error);
      await getDatabase()
        .insert(modelCatalogImports)
        .values({
          version: attemptedVersion,
          contentHash: contentHash({
            attemptedVersion,
            message,
            attemptedAt: new Date().toISOString(),
          }),
          status: "failed",
          error: message,
          fetchedAt: new Date(),
        })
        .catch((recordError) =>
          console.error(
            "Failed to record model catalog import error.",
            recordError,
          ),
        );
    }
    throw error;
  }
}
