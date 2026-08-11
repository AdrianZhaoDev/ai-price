import type {
  ModelCatalogSummary,
  ModelDetail,
} from "@/lib/model-catalog/types";

export type ModelCatalogFacets = {
  labs: Array<[string, string]>;
  providers: Array<[string, string]>;
  modalities: string[];
};

export function isIndexableModelSummary(model: ModelCatalogSummary): boolean {
  const hasUsefulSpecifications = Boolean(
    model.description?.trim() ||
    model.context !== undefined ||
    model.output !== undefined ||
    model.minInputPrice !== undefined ||
    model.minOutputPrice !== undefined,
  );

  return (
    model.active &&
    model.providerCount > 0 &&
    model.providerIds.length > 0 &&
    hasUsefulSpecifications
  );
}

export function buildModelCatalogFacets(
  models: ModelCatalogSummary[],
): ModelCatalogFacets {
  return {
    labs: [
      ...new Map(models.map((model) => [model.labId, model.labName])).entries(),
    ].sort((left, right) => left[1].localeCompare(right[1])),
    providers: [
      ...new Map(
        models.flatMap((model) =>
          model.providerIds.map(
            (id, index) => [id, model.providerNames[index] ?? id] as const,
          ),
        ),
      ).entries(),
    ].sort((left, right) => left[1].localeCompare(right[1])),
    modalities: [
      ...new Set(models.flatMap((model) => model.inputModalities)),
    ].sort(),
  };
}

export function relatedModelsFor(
  model: ModelDetail,
  models: ModelCatalogSummary[],
  limit = 6,
): ModelCatalogSummary[] {
  return models
    .filter(
      (candidate) =>
        candidate.id !== model.id && isIndexableModelSummary(candidate),
    )
    .map((candidate) => {
      const modalityOverlap = candidate.inputModalities.filter((modality) =>
        model.inputModalities.includes(modality),
      ).length;
      const score =
        (candidate.labId === model.labId ? 8 : 0) +
        (model.family && candidate.family === model.family ? 6 : 0) +
        modalityOverlap * 2 +
        (candidate.providerIds.some((provider) =>
          model.providerIds.includes(provider),
        )
          ? 1
          : 0);
      return { candidate, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.candidate.updatedDate.localeCompare(left.candidate.updatedDate) ||
        left.candidate.name.localeCompare(right.candidate.name),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
