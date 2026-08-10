import { getDatabase, type Database } from "@/lib/db/client";
import {
  modelCatalogEvents,
  modelCatalogImports,
  modelCatalogModels,
  modelCatalogProviders,
  modelLabs,
  modelProviderOfferings,
} from "@/lib/db/schema";
import { contentHash } from "@/lib/model-catalog/source";
import type {
  ModelCatalogImportResult,
  NormalizedCatalog,
} from "@/lib/model-catalog/types";
import { desc, eq, inArray, sql } from "drizzle-orm";

export async function persistModelCatalog(
  catalog: NormalizedCatalog,
  database: Database = getDatabase(),
): Promise<ModelCatalogImportResult> {
  return database.transaction(async (tx) => {
    const [sameSnapshot] = await tx
      .select({ id: modelCatalogImports.id })
      .from(modelCatalogImports)
      .where(eq(modelCatalogImports.contentHash, catalog.contentHash))
      .limit(1);
    if (sameSnapshot) {
      return {
        changed: false,
        catalogVersion: catalog.version,
        modelCount: catalog.models.length,
        providerCount: catalog.providers.length,
        offeringCount: catalog.models.reduce(
          (total, model) => total + model.providers.length,
          0,
        ),
        changedModelIds: [],
        addedModelIds: [],
      };
    }

    const [previousImport] = await tx
      .select({
        providerCount: modelCatalogImports.providerCount,
        offeringCount: modelCatalogImports.offeringCount,
      })
      .from(modelCatalogImports)
      .where(eq(modelCatalogImports.status, "success"))
      .orderBy(desc(modelCatalogImports.createdAt))
      .limit(1);
    const nextOfferingCount = catalog.models.reduce(
      (total, model) => total + model.providers.length,
      0,
    );
    for (const [label, previous, next] of [
      ["provider", previousImport?.providerCount, catalog.providers.length],
      ["offering", previousImport?.offeringCount, nextOfferingCount],
    ] as const) {
      if (
        previous !== undefined &&
        previous - next >= 2 &&
        next < previous * 0.7
      ) {
        throw new Error(
          `models.dev ${label} count fell from ${previous} to ${next}.`,
        );
      }
    }

    const existingModels = await tx
      .select({
        id: modelCatalogModels.id,
        active: modelCatalogModels.active,
        contentHash: modelCatalogModels.contentHash,
      })
      .from(modelCatalogModels);
    const previousActive = existingModels.filter((model) => model.active);
    if (
      previousActive.length > 0 &&
      previousActive.length - catalog.models.length >= 2 &&
      catalog.models.length < previousActive.length * 0.7
    ) {
      throw new Error(
        `models.dev model count fell from ${previousActive.length} to ${catalog.models.length}.`,
      );
    }

    const now = new Date();
    const offeringCount = nextOfferingCount;
    const existingById = new Map(
      existingModels.map((model) => [model.id, model]),
    );
    const nextIds = new Set(catalog.models.map((model) => model.summary.id));
    const changedModelIds = catalog.models
      .filter(
        (model) =>
          existingById.get(model.summary.id)?.contentHash !==
            model.contentHash ||
          existingById.get(model.summary.id)?.active === false,
      )
      .map((model) => model.summary.id);
    for (const model of previousActive) {
      if (!nextIds.has(model.id)) changedModelIds.push(model.id);
    }
    const addedModelIds =
      existingModels.length === 0
        ? []
        : catalog.models
            .filter((model) => !existingById.has(model.summary.id))
            .map((model) => model.summary.id);

    const [catalogImport] = await tx
      .insert(modelCatalogImports)
      .values({
        version: catalog.version,
        contentHash: catalog.contentHash,
        status: "success",
        modelCount: catalog.models.length,
        providerCount: catalog.providers.length,
        offeringCount,
        changedModelCount: changedModelIds.length,
        addedModelCount: addedModelIds.length,
        unlinkedProviderModelCount: catalog.unlinkedProviderModels,
        fetchedAt: new Date(catalog.fetchedAt),
      })
      .returning({ id: modelCatalogImports.id });

    await tx.update(modelLabs).set({ active: false, updatedAt: now });
    await tx
      .update(modelCatalogProviders)
      .set({ active: false, updatedAt: now });
    if (previousActive.length > 0) {
      const missing = previousActive
        .filter((model) => !nextIds.has(model.id))
        .map((model) => model.id);
      if (missing.length > 0) {
        await tx
          .update(modelCatalogModels)
          .set({ active: false, detailChangedAt: now })
          .where(inArray(modelCatalogModels.id, missing));
      }
    }
    await tx
      .update(modelProviderOfferings)
      .set({ active: false, updatedAt: now });

    for (const lab of catalog.labs) {
      await tx
        .insert(modelLabs)
        .values({
          id: lab.id,
          name: lab.name,
          description: lab.description,
          origin: lab.origin,
          active: true,
          contentHash: contentHash(lab),
          lastImportId: catalogImport.id,
        })
        .onConflictDoUpdate({
          target: modelLabs.id,
          set: {
            name: lab.name,
            description: lab.description,
            origin: lab.origin,
            active: true,
            contentHash: contentHash(lab),
            lastImportId: catalogImport.id,
            updatedAt: now,
          },
        });
    }

    for (const provider of catalog.providers) {
      await tx
        .insert(modelCatalogProviders)
        .values({
          id: provider.id,
          name: provider.name,
          docUrl: provider.doc,
          apiUrl: provider.api,
          npmPackage: provider.npm,
          origin: provider.origin,
          active: true,
          contentHash: contentHash(provider),
          lastImportId: catalogImport.id,
        })
        .onConflictDoUpdate({
          target: modelCatalogProviders.id,
          set: {
            name: provider.name,
            docUrl: provider.doc,
            apiUrl: provider.api,
            npmPackage: provider.npm,
            origin: provider.origin,
            active: true,
            contentHash: contentHash(provider),
            lastImportId: catalogImport.id,
            updatedAt: now,
          },
        });
    }

    for (const model of catalog.models) {
      const summary = model.summary;
      const changed = changedModelIds.includes(summary.id);
      await tx
        .insert(modelCatalogModels)
        .values({
          id: summary.id,
          labId: summary.labId,
          name: summary.name,
          description: summary.description,
          family: summary.family,
          contextTokens: summary.context,
          outputTokens: summary.output,
          inputModalities: summary.inputModalities,
          outputModalities: model.outputModalities,
          capabilities: model.capabilities,
          knowledge: model.knowledge,
          openWeights: model.openWeights,
          releaseDate: summary.releaseDate,
          updatedDate: summary.updatedDate,
          providerCount: summary.providerCount,
          minInputPrice: summary.minInputPrice,
          minInputProviderId: summary.minInputProviderId,
          minOutputPrice: summary.minOutputPrice,
          minOutputProviderId: summary.minOutputProviderId,
          origin: summary.origin,
          active: true,
          contentHash: model.contentHash,
          detailChangedAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
          lastImportId: catalogImport.id,
        })
        .onConflictDoUpdate({
          target: modelCatalogModels.id,
          set: {
            labId: summary.labId,
            name: summary.name,
            description: summary.description,
            family: summary.family,
            contextTokens: summary.context,
            outputTokens: summary.output,
            inputModalities: summary.inputModalities,
            outputModalities: model.outputModalities,
            capabilities: model.capabilities,
            knowledge: model.knowledge,
            openWeights: model.openWeights,
            releaseDate: summary.releaseDate,
            updatedDate: summary.updatedDate,
            providerCount: summary.providerCount,
            minInputPrice: summary.minInputPrice,
            minInputProviderId: summary.minInputProviderId,
            minOutputPrice: summary.minOutputPrice,
            minOutputProviderId: summary.minOutputProviderId,
            origin: summary.origin,
            active: true,
            contentHash: model.contentHash,
            detailChangedAt: changed
              ? now
              : sql`${modelCatalogModels.detailChangedAt}`,
            lastSeenAt: now,
            lastImportId: catalogImport.id,
          },
        });
    }

    for (const model of catalog.models) {
      for (const offering of model.providers) {
        await tx
          .insert(modelProviderOfferings)
          .values({
            providerId: offering.providerId,
            providerModelId: offering.providerModelId,
            canonicalModelId: offering.canonicalModelId,
            contextTokens: offering.context,
            outputTokens: offering.output,
            inputPrice: offering.inputPrice,
            outputPrice: offering.outputPrice,
            status: offering.status,
            capabilities: offering.capabilities,
            inputModalities: offering.inputModalities,
            outputModalities: offering.outputModalities,
            costDetails: offering.costDetails ?? {},
            sourceUrl: offering.sourceUrl,
            origin: offering.origin,
            active: true,
            contentHash: contentHash(offering),
            lastImportId: catalogImport.id,
          })
          .onConflictDoUpdate({
            target: [
              modelProviderOfferings.providerId,
              modelProviderOfferings.providerModelId,
            ],
            set: {
              canonicalModelId: offering.canonicalModelId,
              contextTokens: offering.context,
              outputTokens: offering.output,
              inputPrice: offering.inputPrice,
              outputPrice: offering.outputPrice,
              status: offering.status,
              capabilities: offering.capabilities,
              inputModalities: offering.inputModalities,
              outputModalities: offering.outputModalities,
              costDetails: offering.costDetails ?? {},
              sourceUrl: offering.sourceUrl,
              origin: offering.origin,
              active: true,
              contentHash: contentHash(offering),
              lastImportId: catalogImport.id,
              updatedAt: now,
            },
          });
      }
    }

    for (const modelId of addedModelIds) {
      const model = catalog.models.find((item) => item.summary.id === modelId)!;
      await tx.insert(modelCatalogEvents).values({
        importId: catalogImport.id,
        eventType: "model_added",
        modelId,
        snapshot: {
          name: model.summary.name,
          labName: model.summary.labName,
          releaseDate: model.summary.releaseDate,
        },
      });
    }

    return {
      changed: true,
      catalogVersion: catalog.version,
      modelCount: catalog.models.length,
      providerCount: catalog.providers.length,
      offeringCount,
      changedModelIds: [...new Set(changedModelIds)],
      addedModelIds,
    };
  });
}
