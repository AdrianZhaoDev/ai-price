import {
  getReadDatabase,
  isReadDatabaseConfigured,
  type Database,
} from "@/lib/db/client";
import {
  modelCatalogImports,
  modelCatalogModels,
  modelCatalogProviders,
  modelLabs,
  modelProviderOfferings,
} from "@/lib/db/schema";
import { fallbackModelCatalog } from "@/lib/model-catalog/fallback";
import type {
  ModelCatalogOrigin,
  ModelCatalogSummary,
  ModelDetail,
  ModelProviderOffering,
} from "@/lib/model-catalog/types";
import { and, desc, eq, isNull, notInArray, or } from "drizzle-orm";

function fallbackSummaries(activeOnly = true): ModelCatalogSummary[] {
  return fallbackModelCatalog
    .filter((model) => !activeOnly || model.active)
    .map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      labId: model.labId,
      labName: model.labName,
      family: model.family,
      context: model.context,
      output: model.output,
      inputModalities: model.inputModalities,
      minInputPrice: model.minInputPrice,
      minInputProviderId: model.minInputProviderId,
      minInputProviderName: model.minInputProviderName,
      minOutputPrice: model.minOutputPrice,
      minOutputProviderId: model.minOutputProviderId,
      minOutputProviderName: model.minOutputProviderName,
      releaseDate: model.releaseDate,
      updatedDate: model.updatedDate,
      providerCount: model.providerCount,
      providerIds: model.providerIds,
      providerNames: model.providerNames,
      active: model.active,
      origin: model.origin,
      detailChangedAt: model.detailChangedAt,
    }));
}

export async function loadModelCatalogSummaries(
  options: {
    database?: Database;
    activeOnly?: boolean;
  } = {},
): Promise<ModelCatalogSummary[]> {
  const activeOnly = options.activeOnly ?? true;
  const database =
    options.database ?? (isReadDatabaseConfigured() ? getReadDatabase() : null);
  if (!database) return fallbackSummaries(activeOnly);
  const rows = await database
    .select({ model: modelCatalogModels, lab: modelLabs })
    .from(modelCatalogModels)
    .innerJoin(modelLabs, eq(modelLabs.id, modelCatalogModels.labId))
    .where(activeOnly ? eq(modelCatalogModels.active, true) : undefined)
    .orderBy(desc(modelCatalogModels.releaseDate), modelCatalogModels.name);
  const providerRows = await database.select().from(modelCatalogProviders);
  const providerNames = new Map(
    providerRows.map((provider) => [provider.id, provider.name]),
  );
  const offeringRows = await database
    .select({
      modelId: modelProviderOfferings.canonicalModelId,
      providerId: modelProviderOfferings.providerId,
    })
    .from(modelProviderOfferings)
    .where(
      and(
        eq(modelProviderOfferings.active, true),
        or(
          isNull(modelProviderOfferings.status),
          notInArray(modelProviderOfferings.status, ["alpha", "deprecated"]),
        ),
      ),
    );
  const providersByModel = new Map<string, Set<string>>();
  for (const offering of offeringRows) {
    const values = providersByModel.get(offering.modelId) ?? new Set<string>();
    values.add(offering.providerId);
    providersByModel.set(offering.modelId, values);
  }
  return rows.map(({ model, lab }) => {
    const providerIds = [...(providersByModel.get(model.id) ?? [])].sort();
    return {
      id: model.id,
      name: model.name,
      description: model.description ?? undefined,
      labId: model.labId,
      labName: lab.name,
      family: model.family ?? undefined,
      context: model.contextTokens ?? undefined,
      output: model.outputTokens ?? undefined,
      inputModalities: model.inputModalities,
      minInputPrice: model.minInputPrice ?? undefined,
      minInputProviderId: model.minInputProviderId ?? undefined,
      minInputProviderName: model.minInputProviderId
        ? providerNames.get(model.minInputProviderId)
        : undefined,
      minOutputPrice: model.minOutputPrice ?? undefined,
      minOutputProviderId: model.minOutputProviderId ?? undefined,
      minOutputProviderName: model.minOutputProviderId
        ? providerNames.get(model.minOutputProviderId)
        : undefined,
      releaseDate: model.releaseDate,
      updatedDate: model.updatedDate,
      providerCount: model.providerCount,
      providerIds,
      providerNames: providerIds.map((id) => providerNames.get(id) ?? id),
      active: model.active,
      origin: model.origin as ModelCatalogOrigin,
      detailChangedAt: model.detailChangedAt.toISOString(),
    };
  });
}

export async function loadModelDetail(
  modelId: string,
  options: { database?: Database } = {},
): Promise<ModelDetail | null> {
  const database =
    options.database ?? (isReadDatabaseConfigured() ? getReadDatabase() : null);
  if (!database)
    return fallbackModelCatalog.find((model) => model.id === modelId) ?? null;
  const [row] = await database
    .select({
      model: modelCatalogModels,
      lab: modelLabs,
      catalogImport: modelCatalogImports,
    })
    .from(modelCatalogModels)
    .innerJoin(modelLabs, eq(modelLabs.id, modelCatalogModels.labId))
    .leftJoin(
      modelCatalogImports,
      eq(modelCatalogImports.id, modelCatalogModels.lastImportId),
    )
    .where(eq(modelCatalogModels.id, modelId))
    .limit(1);
  if (!row) return null;
  const offerings = await database
    .select({
      offering: modelProviderOfferings,
      provider: modelCatalogProviders,
    })
    .from(modelProviderOfferings)
    .innerJoin(
      modelCatalogProviders,
      eq(modelCatalogProviders.id, modelProviderOfferings.providerId),
    )
    .where(
      row.model.active
        ? and(
            eq(modelProviderOfferings.canonicalModelId, modelId),
            eq(modelProviderOfferings.active, true),
          )
        : eq(modelProviderOfferings.canonicalModelId, modelId),
    );
  const summary = (
    await loadModelCatalogSummaries({ database, activeOnly: false })
  ).find((item) => item.id === modelId)!;
  const providers: ModelProviderOffering[] = offerings.map(
    ({ offering, provider }) => ({
      providerId: offering.providerId,
      providerName: provider.name,
      providerModelId: offering.providerModelId,
      canonicalModelId: offering.canonicalModelId,
      labName: row.lab.name,
      context: offering.contextTokens ?? undefined,
      output: offering.outputTokens ?? undefined,
      inputPrice: offering.inputPrice ?? undefined,
      outputPrice: offering.outputPrice ?? undefined,
      status: offering.status as ModelProviderOffering["status"],
      capabilities: offering.capabilities,
      inputModalities: offering.inputModalities,
      outputModalities: offering.outputModalities,
      costDetails: offering.costDetails,
      sourceUrl: offering.sourceUrl ?? provider.docUrl ?? undefined,
      origin: offering.origin as ModelCatalogOrigin,
    }),
  );
  providers.sort((a, b) => a.providerName.localeCompare(b.providerName));
  const version = row.catalogImport?.version ?? "unknown";
  return {
    ...summary,
    knowledge: row.model.knowledge ?? undefined,
    openWeights: row.model.openWeights,
    outputModalities: row.model.outputModalities,
    capabilities: row.model.capabilities,
    providers,
    catalogVersion: version,
    sourceUrl: `https://github.com/anomalyco/models.dev/tree/${version}`,
  };
}
