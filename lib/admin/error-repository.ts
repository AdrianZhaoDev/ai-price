import { getDatabase } from "@/lib/db/client";
import {
  collectionErrors,
  collectionRuns,
  products,
  providers,
  sources,
} from "@/lib/db/schema";
import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

export const adminErrorChannels = [
  "all",
  "app_store",
  "official_web",
  "official_api",
  "manual_official",
] as const;
export type AdminErrorChannel = (typeof adminErrorChannels)[number];
export type AdminErrorStatus = "all" | "open" | "resolved";

export type AdminErrorFilters = {
  code: string | null;
  channel: AdminErrorChannel;
  status: AdminErrorStatus;
  page: number;
  pageSize?: number;
};

function filtersWhere(filters: AdminErrorFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.code) conditions.push(eq(collectionErrors.code, filters.code));
  if (filters.channel !== "all") {
    conditions.push(eq(sources.type, filters.channel));
  }
  if (filters.status === "open") {
    conditions.push(isNull(collectionErrors.resolvedAt));
  } else if (filters.status === "resolved") {
    conditions.push(isNotNull(collectionErrors.resolvedAt));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listAdminCollectionErrors(filters: AdminErrorFilters) {
  const db = getDatabase();
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const page = Math.min(1_000, Math.max(1, filters.page));
  const where = filtersWhere(filters);

  const [statsRows, typeRows, totalRows, rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${collectionErrors.resolvedAt} is null)::int`,
        resolved: sql<number>`count(*) filter (where ${collectionErrors.resolvedAt} is not null)::int`,
        alerted: sql<number>`count(*) filter (where ${collectionErrors.alertSentAt} is not null)::int`,
      })
      .from(collectionErrors),
    db
      .select({
        code: collectionErrors.code,
        count: count(),
      })
      .from(collectionErrors)
      .groupBy(collectionErrors.code)
      .orderBy(desc(count())),
    db
      .select({ count: count() })
      .from(collectionErrors)
      .innerJoin(sources, eq(collectionErrors.sourceId, sources.id))
      .where(where),
    db
      .select({
        id: collectionErrors.id,
        code: collectionErrors.code,
        message: collectionErrors.message,
        details: collectionErrors.details,
        alertSentAt: collectionErrors.alertSentAt,
        resolvedAt: collectionErrors.resolvedAt,
        createdAt: collectionErrors.createdAt,
        sourceId: sources.id,
        sourceSlug: sources.slug,
        sourceType: sources.type,
        sourceUrl: sources.url,
        parserVersion: sources.parserVersion,
        consecutiveFailures: sources.consecutiveFailures,
        lastAttemptAt: sources.lastAttemptAt,
        lastSuccessAt: sources.lastSuccessAt,
        productName: products.name,
        providerName: providers.name,
        runId: collectionRuns.id,
        runStatus: collectionRuns.status,
        runTrigger: collectionRuns.trigger,
        runStartedAt: collectionRuns.startedAt,
        runFinishedAt: collectionRuns.finishedAt,
        runSuccessCount: collectionRuns.successCount,
        runFailureCount: collectionRuns.failureCount,
      })
      .from(collectionErrors)
      .innerJoin(sources, eq(collectionErrors.sourceId, sources.id))
      .innerJoin(products, eq(sources.productId, products.id))
      .innerJoin(providers, eq(products.providerId, providers.id))
      .leftJoin(
        collectionRuns,
        eq(collectionErrors.collectionRunId, collectionRuns.id),
      )
      .where(where)
      .orderBy(desc(collectionErrors.createdAt), desc(collectionErrors.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = Number(totalRows[0]?.count ?? 0);
  return {
    rows,
    stats: statsRows[0] ?? { total: 0, open: 0, resolved: 0, alerted: 0 },
    types: typeRows.map((item) => ({
      code: item.code,
      count: Number(item.count),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
