import {
  getDatabase,
  getReadDatabase,
  isReadDatabaseConfigured,
  type Database,
} from "@/lib/db/client";
import { apiRankingEvents, apiRankingState } from "@/lib/db/schema";
import {
  apiRankingEntries,
  rankingCnyValue,
  rankingOfferForMetric,
  type ApiRankingChange,
  type ApiRankingMetric,
} from "@/lib/pricing/api-ranking";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

export const apiRankingMetrics: ApiRankingMetric[] = [
  "cached_input",
  "input",
  "output",
];

export type ApiRankingSnapshotRow = {
  metric: ApiRankingMetric;
  entryKey: string;
  providerSlug: string;
  providerName: string;
  providerColor: string;
  modelSlug: string;
  modelName: string;
  modelOrder: number;
  offerPlanSlug: string;
  rank: number;
  priceCny: number;
  displayPrice: string;
};

export type ApiRankingHistoryChange = {
  id: string;
  metric: ApiRankingMetric;
  entryKey: string;
  providerSlug: string;
  providerName: string;
  modelSlug: string;
  modelName: string;
  previousRank: number | null;
  currentRank: number | null;
  previousPriceCny: number | null;
  currentPriceCny: number | null;
  previousDisplayPrice: string | null;
  currentDisplayPrice: string | null;
  createdAt: Date;
};

export type ApiRankingHistoryResult = {
  baseline: boolean;
  changes: ApiRankingHistoryChange[];
  rankings: Record<ApiRankingMetric, ApiRankingSnapshotRow[]>;
};

export type PendingApiRankingBatch = {
  runId: string;
  result: ApiRankingHistoryResult;
};

type RankingEventRow = typeof apiRankingEvents.$inferSelect;

function emptyRankings(): Record<ApiRankingMetric, ApiRankingSnapshotRow[]> {
  return { cached_input: [], input: [], output: [] };
}

async function currentRankingRows(
  database: Database,
): Promise<Record<ApiRankingMetric, ApiRankingSnapshotRow[]>> {
  const providers = await loadProviderCatalog("api", undefined, {
    database,
    fallbackOnError: false,
  });
  const rankings = emptyRankings();
  for (const metric of apiRankingMetrics) {
    rankings[metric] = apiRankingEntries(providers, metric).map(
      (entry, index) => {
        const offer = rankingOfferForMetric(entry, metric);
        if (!offer) {
          throw new Error(
            `Ranking offer is missing for ${metric}:${entry.id}.`,
          );
        }
        return {
          metric,
          entryKey: entry.id,
          providerSlug: entry.providerId,
          providerName: entry.providerName,
          providerColor: entry.providerColor,
          modelSlug: entry.modelSlug,
          modelName: entry.modelName,
          modelOrder: entry.modelOrder,
          offerPlanSlug: offer.planId,
          rank: index + 1,
          priceCny: rankingCnyValue(offer),
          displayPrice: offer.displayPrice,
        };
      },
    );
  }
  return rankings;
}

type RankingStateComparisonRow = Pick<
  typeof apiRankingState.$inferSelect,
  | "metric"
  | "entryKey"
  | "providerSlug"
  | "providerName"
  | "modelSlug"
  | "modelName"
  | "rank"
  | "priceCny"
  | "displayPrice"
  | "active"
>;

export function buildApiRankingEventValues(
  runId: string,
  previousRows: RankingStateComparisonRow[],
  currentRows: ApiRankingSnapshotRow[],
): {
  baseline: boolean;
  eventValues: Array<typeof apiRankingEvents.$inferInsert>;
  removedRows: RankingStateComparisonRow[];
} {
  const baseline = previousRows.length === 0;
  const previousByIdentity = new Map(
    previousRows.map((row) => [`${row.metric}:${row.entryKey}`, row]),
  );
  const currentIdentities = new Set(
    currentRows.map((row) => `${row.metric}:${row.entryKey}`),
  );
  const eventValues: Array<typeof apiRankingEvents.$inferInsert> = [];
  const removedRows = baseline
    ? []
    : previousRows.filter(
        (previous) =>
          previous.active &&
          !currentIdentities.has(`${previous.metric}:${previous.entryKey}`),
      );
  const officiallyChangedMetrics = new Set<ApiRankingMetric>(
    removedRows.map((row) => row.metric as ApiRankingMetric),
  );
  for (const current of currentRows) {
    const previous = previousByIdentity.get(
      `${current.metric}:${current.entryKey}`,
    );
    if (!previous?.active || previous.displayPrice !== current.displayPrice) {
      officiallyChangedMetrics.add(current.metric);
    }
  }

  for (const current of currentRows) {
    const identity = `${current.metric}:${current.entryKey}`;
    const previous = previousByIdentity.get(identity);
    const officiallyChanged =
      !previous?.active || previous.displayPrice !== current.displayPrice;
    const rankingChanged = previous?.active && previous.rank !== current.rank;
    if (
      !baseline &&
      (officiallyChanged ||
        (rankingChanged && officiallyChangedMetrics.has(current.metric)))
    ) {
      eventValues.push({
        collectionRunId: runId,
        metric: current.metric,
        entryKey: current.entryKey,
        providerSlug: current.providerSlug,
        providerName: current.providerName,
        modelSlug: current.modelSlug,
        modelName: current.modelName,
        previousRank: previous?.active ? previous.rank : null,
        currentRank: current.rank,
        previousPriceCny: previous?.active ? previous.priceCny : null,
        currentPriceCny: current.priceCny,
        previousDisplayPrice: previous?.active ? previous.displayPrice : null,
        currentDisplayPrice: current.displayPrice,
      });
    }
  }

  for (const previous of removedRows) {
    eventValues.push({
      collectionRunId: runId,
      metric: previous.metric,
      entryKey: previous.entryKey,
      providerSlug: previous.providerSlug,
      providerName: previous.providerName,
      modelSlug: previous.modelSlug,
      modelName: previous.modelName,
      previousRank: previous.rank,
      currentRank: null,
      previousPriceCny: previous.priceCny,
      currentPriceCny: null,
      previousDisplayPrice: previous.displayPrice,
      currentDisplayPrice: null,
    });
  }
  return { baseline, eventValues, removedRows };
}

export async function refreshApiRankingHistory(
  runId: string,
): Promise<ApiRankingHistoryResult> {
  const database = getDatabase();
  const rankings = await currentRankingRows(database);
  const currentRows = apiRankingMetrics.flatMap((metric) => rankings[metric]);

  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('api-ranking-history'))`,
    );
    const previousRows = await tx.select().from(apiRankingState);
    const { baseline, eventValues, removedRows } = buildApiRankingEventValues(
      runId,
      previousRows,
      currentRows,
    );
    const now = new Date();

    for (const current of currentRows) {
      await tx
        .insert(apiRankingState)
        .values({
          ...current,
          collectionRunId: runId,
          active: true,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [apiRankingState.metric, apiRankingState.entryKey],
          set: {
            providerSlug: current.providerSlug,
            providerName: current.providerName,
            providerColor: current.providerColor,
            modelSlug: current.modelSlug,
            modelName: current.modelName,
            modelOrder: current.modelOrder,
            offerPlanSlug: current.offerPlanSlug,
            rank: current.rank,
            priceCny: current.priceCny,
            displayPrice: current.displayPrice,
            active: true,
            collectionRunId: runId,
            updatedAt: now,
          },
        });
    }

    if (!baseline) {
      for (const previous of removedRows) {
        await tx
          .update(apiRankingState)
          .set({
            active: false,
            rank: null,
            collectionRunId: runId,
            updatedAt: now,
          })
          .where(
            and(
              eq(apiRankingState.metric, previous.metric),
              eq(apiRankingState.entryKey, previous.entryKey),
            ),
          );
      }
    }

    const inserted = eventValues.length
      ? await tx
          .insert(apiRankingEvents)
          .values(eventValues)
          .onConflictDoNothing()
          .returning()
      : [];
    return {
      baseline,
      changes: inserted.map((row) => ({
        ...row,
        metric: row.metric as ApiRankingMetric,
      })),
      rankings,
    };
  });
}

export async function loadLatestApiRankingChanges(): Promise<
  ApiRankingChange[]
> {
  if (!isReadDatabaseConfigured()) return [];
  const rows = await getReadDatabase()
    .selectDistinctOn([apiRankingEvents.metric, apiRankingEvents.entryKey])
    .from(apiRankingEvents)
    .orderBy(
      apiRankingEvents.metric,
      apiRankingEvents.entryKey,
      desc(apiRankingEvents.createdAt),
    );

  return rows
    .filter(
      (row): row is typeof row & { currentRank: number } =>
        row.currentRank !== null,
    )
    .map((row) => ({
      metric: row.metric as ApiRankingMetric,
      entryId: row.entryKey,
      previousRank: row.previousRank,
      currentRank: row.currentRank,
      rankDelta:
        row.previousRank === null ? null : row.previousRank - row.currentRank,
      previousPriceCny: row.previousPriceCny,
      currentPriceCny: row.currentPriceCny,
      previousDisplayPrice: row.previousDisplayPrice,
      currentDisplayPrice: row.currentDisplayPrice,
      priceDirection:
        row.previousPriceCny === null ||
        row.currentPriceCny === null ||
        row.previousDisplayPrice === row.currentDisplayPrice
          ? null
          : row.currentPriceCny > row.previousPriceCny
            ? "increase"
            : row.currentPriceCny < row.previousPriceCny
              ? "decrease"
              : null,
      isNew: row.previousRank === null,
      changedAt: row.createdAt.toISOString(),
    }));
}

export async function markApiRankingEventsNotified(
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await getDatabase()
    .update(apiRankingEvents)
    .set({ notifiedAt: new Date() })
    .where(inArray(apiRankingEvents.id, eventIds));
}

export async function loadPendingApiRankingBatches(
  rankings: Record<ApiRankingMetric, ApiRankingSnapshotRow[]>,
): Promise<PendingApiRankingBatch[]> {
  const rows = await getDatabase()
    .select()
    .from(apiRankingEvents)
    .where(isNull(apiRankingEvents.notifiedAt))
    .orderBy(asc(apiRankingEvents.createdAt), asc(apiRankingEvents.id));
  return buildPendingApiRankingBatches(rows, rankings);
}

export function buildPendingApiRankingBatches(
  rows: RankingEventRow[],
  rankings: Record<ApiRankingMetric, ApiRankingSnapshotRow[]>,
): PendingApiRankingBatch[] {
  const byRun = new Map<string, ApiRankingHistoryChange[]>();
  for (const row of rows) {
    const changes = byRun.get(row.collectionRunId) ?? [];
    changes.push({
      ...row,
      metric: row.metric as ApiRankingMetric,
    });
    byRun.set(row.collectionRunId, changes);
  }
  return [...byRun].map(([runId, changes]) => ({
    runId,
    result: { baseline: false, changes, rankings },
  }));
}
