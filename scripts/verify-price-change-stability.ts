import {
  closeDatabase,
  getDatabase,
  getWriteDatabaseUrl,
} from "@/lib/db/client";
import {
  ensureSource,
  finishCollectionRun,
  recordSuccessfulCollection,
  startCollectionRun,
} from "@/lib/collectors/persistence";
import type {
  NormalizedOffer,
  PriceSourceAdapter,
} from "@/lib/collectors/types";
import {
  priceChangeCandidates,
  priceChangeEvents,
  priceObservations,
} from "@/lib/db/schema";
import { and, count, eq } from "drizzle-orm";

function assertLocalTestDatabase(): void {
  if (process.env.PRICE_STABILITY_TEST_DATABASE !== "true") {
    throw new Error(
      "Set PRICE_STABILITY_TEST_DATABASE=true to run this destructive integration verifier.",
    );
  }
  const databaseUrl = getWriteDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const hostname = new URL(databaseUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      "The price stability verifier only accepts a loopback database.",
    );
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

const adapter: PriceSourceAdapter = {
  id: "price-stability-integration-probe",
  providerSlug: "trae-subscription",
  sourceUrl: "https://official.example/price-stability-probe",
  parserVersion: "integration-v1",
  collect: async () => {
    throw new Error("The integration verifier does not fetch the network.");
  },
  parse: async () => [],
  healthCheck: () => ({ ok: true, code: "OK", message: "ok" }),
};

const baseOffer: NormalizedOffer = {
  providerSlug: "trae-subscription",
  productSlug: "trae-subscription",
  canonicalPlanSlug: "price-stability-probe-monthly",
  rawPlanName: "Price Stability Probe",
  mode: "subscription",
  channel: "official_web",
  region: "测试",
  storefront: null,
  currency: "CNY",
  amountMinor: 5900,
  displayPrice: "¥59",
  status: "verified",
  billingPeriod: "month",
  unit: null,
  taxIncluded: null,
  sourceUrl: adapter.sourceUrl,
  observedAt: "2026-07-29T00:00:00.000Z",
  parserVersion: adapter.parserVersion,
};

async function collect(
  source: Awaited<ReturnType<typeof ensureSource>>,
  sequence: number,
  amountMinor: number,
) {
  const runId = await startCollectionRun("price-stability-test", 1);
  const changes = await recordSuccessfulCollection({
    runId,
    source,
    contentHash: `fixture-${sequence}-${amountMinor}`,
    offers: [
      {
        ...baseOffer,
        amountMinor,
        displayPrice: `¥${amountMinor / 100}`,
        observedAt: new Date(
          Date.parse(baseOffer.observedAt) + sequence * 60_000,
        ).toISOString(),
      },
    ],
    fxRates: new Map([
      [
        "CNY",
        {
          currency: "CNY",
          cnyPerUnit: 1,
          rateDate: "2026-07-29",
          observedAt: new Date("2026-07-29T00:00:00.000Z"),
          sourceUrl: "https://official.example/fx",
        },
      ],
    ]),
  });
  await finishCollectionRun({ runId, successCount: 1, failureCount: 0 });
  return changes;
}

async function countsForSource(sourceId: string) {
  const db = getDatabase();
  const condition = eq(priceObservations.sourceId, sourceId);
  const [[observations], [candidates], [events]] = await Promise.all([
    db.select({ value: count() }).from(priceObservations).where(condition),
    db
      .select({ value: count() })
      .from(priceChangeCandidates)
      .where(eq(priceChangeCandidates.sourceId, sourceId)),
    db
      .select({ value: count() })
      .from(priceChangeEvents)
      .innerJoin(
        priceObservations,
        eq(priceChangeEvents.currentObservationId, priceObservations.id),
      )
      .where(
        and(
          eq(priceObservations.sourceId, sourceId),
          eq(priceObservations.status, "verified"),
        ),
      ),
  ]);
  return {
    observations: observations.value,
    candidates: candidates.value,
    events: events.value,
  };
}

async function main(): Promise<void> {
  assertLocalTestDatabase();
  const source = await ensureSource(adapter);

  assertEqual((await collect(source, 0, 5900)).length, 0, "initial changes");
  assertEqual((await collect(source, 1, 23900)).length, 0, "staged changes");
  assertEqual(
    JSON.stringify(await countsForSource(source.id)),
    JSON.stringify({ observations: 1, candidates: 1, events: 0 }),
    "A to B candidate state",
  );

  assertEqual((await collect(source, 2, 5900)).length, 0, "reverted changes");
  assertEqual(
    JSON.stringify(await countsForSource(source.id)),
    JSON.stringify({ observations: 1, candidates: 0, events: 0 }),
    "A to B to A state",
  );

  assertEqual((await collect(source, 3, 23900)).length, 0, "restaged changes");
  assertEqual((await collect(source, 4, 23900)).length, 1, "confirmed changes");
  assertEqual(
    JSON.stringify(await countsForSource(source.id)),
    JSON.stringify({ observations: 2, candidates: 0, events: 1 }),
    "confirmed B state",
  );

  assertEqual((await collect(source, 5, 69900)).length, 0, "new candidate");
  assertEqual(
    JSON.stringify(await countsForSource(source.id)),
    JSON.stringify({ observations: 2, candidates: 1, events: 1 }),
    "B to C candidate state",
  );

  console.log("Price change stability integration verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
