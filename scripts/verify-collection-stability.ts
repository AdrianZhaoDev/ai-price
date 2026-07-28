import { config } from "dotenv";
import { count, desc, eq } from "drizzle-orm";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import { runCollectors, type CollectionSummary } from "@/lib/collectors/runner";
import {
  closeDatabase,
  getDatabase,
  isDatabaseConfigured,
} from "@/lib/db/client";
import { collectionRuns, priceObservations, sources } from "@/lib/db/schema";

config({ path: [".env.local", ".env"] });

const minimumExpectedOffers = 400;
const maximumOfferDriftRatio = 0.05;

function assertHealthySummary(
  summary: CollectionSummary,
  expectedSources: number,
  round: number,
): void {
  if (summary.sourceCount !== expectedSources) {
    throw new Error(
      `Round ${round}: expected ${expectedSources} sources, got ${summary.sourceCount}.`,
    );
  }
  if (summary.failureCount > 0 || summary.successCount !== expectedSources) {
    throw new Error(
      `Round ${round}: ${summary.successCount}/${expectedSources} sources succeeded; ${summary.failureCount} failed.`,
    );
  }
  if (summary.offerCount < minimumExpectedOffers) {
    throw new Error(
      `Round ${round}: only ${summary.offerCount} offers were parsed; expected at least ${minimumExpectedOffers}.`,
    );
  }
}

async function observationCount(): Promise<number> {
  const [row] = await getDatabase()
    .select({ value: count() })
    .from(priceObservations);
  return row.value;
}

async function main(): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "DATABASE_URL is required. Run `npm run local:db:up` and configure .env.local first.",
    );
  }

  const adapters = createCollectorRegistry();
  const summaries: CollectionSummary[] = [];
  const observations: number[] = [];

  for (let round = 1; round <= 2; round += 1) {
    const summary = await runCollectors(adapters, {
      trigger: `local_stability_round_${round}`,
      concurrency: Number(process.env.COLLECTOR_CONCURRENCY ?? 5),
      onProgress: (message) => {
        if (message.startsWith("✗")) console.error(message);
      },
    });
    assertHealthySummary(summary, adapters.length, round);
    summaries.push(summary);
    observations.push(await observationCount());
    console.log(
      `Round ${round}: ${summary.successCount}/${summary.sourceCount} sources, ${summary.offerCount} offers, ${summary.changeCount} changes.`,
    );
  }

  const offerDrift = Math.abs(
    summaries[1].offerCount - summaries[0].offerCount,
  );
  const allowedOfferDrift = Math.max(
    10,
    Math.ceil(summaries[0].offerCount * maximumOfferDriftRatio),
  );
  if (offerDrift > allowedOfferDrift) {
    throw new Error(
      `Offer count drifted by ${offerDrift}; allowed drift is ${allowedOfferDrift}.`,
    );
  }

  const observationGrowth = observations[1] - observations[0];
  if (observationGrowth > summaries[1].changeCount) {
    throw new Error(
      `Second round created ${observationGrowth} observations for only ${summaries[1].changeCount} detected changes.`,
    );
  }

  const db = getDatabase();
  const [sourceCountRow] = await db.select({ value: count() }).from(sources);
  const [unhealthySourceCountRow] = await db
    .select({ value: count() })
    .from(sources)
    .where(eq(sources.consecutiveFailures, 0));
  const recentRuns = await db
    .select({
      status: collectionRuns.status,
      sourceCount: collectionRuns.sourceCount,
      successCount: collectionRuns.successCount,
      failureCount: collectionRuns.failureCount,
      finishedAt: collectionRuns.finishedAt,
    })
    .from(collectionRuns)
    .orderBy(desc(collectionRuns.startedAt))
    .limit(2);

  if (
    sourceCountRow.value !== adapters.length ||
    unhealthySourceCountRow.value !== adapters.length
  ) {
    throw new Error(
      `Database source health mismatch: ${unhealthySourceCountRow.value}/${sourceCountRow.value} sources are healthy.`,
    );
  }
  if (
    recentRuns.length !== 2 ||
    recentRuns.some(
      (run) =>
        run.status !== "success" ||
        run.successCount !== adapters.length ||
        run.failureCount !== 0 ||
        !run.finishedAt,
    )
  ) {
    throw new Error(
      "The two persisted collection runs are not both complete and successful.",
    );
  }

  console.log(
    JSON.stringify(
      {
        stable: true,
        sourceCount: adapters.length,
        offerCounts: summaries.map((summary) => summary.offerCount),
        offerDrift,
        observationCounts: observations,
        observationGrowth,
        detectedChanges: summaries.map((summary) => summary.changeCount),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
