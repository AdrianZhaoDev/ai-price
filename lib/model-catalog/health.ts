export const MODEL_CATALOG_MINIMUMS = {
  models: 100,
  providers: 50,
  offerings: 500,
} as const;

export function assertPlausibleCatalogSnapshot(counts: {
  models: number;
  providers: number;
  offerings: number;
}): void {
  for (const [label, value, minimum] of [
    ["model", counts.models, MODEL_CATALOG_MINIMUMS.models],
    ["provider", counts.providers, MODEL_CATALOG_MINIMUMS.providers],
    ["offering", counts.offerings, MODEL_CATALOG_MINIMUMS.offerings],
  ] as const) {
    if (value < minimum) {
      throw new Error(
        `models.dev ${label} count ${value} is below the minimum ${minimum}.`,
      );
    }
  }
}
