import { describe, expect, it } from "vitest";
import {
  buildApiRankingEventValues,
  buildPendingApiRankingBatches,
  type ApiRankingSnapshotRow,
} from "@/lib/pricing/ranking-history";

function snapshot(
  metric: ApiRankingSnapshotRow["metric"],
  entryKey: string,
  rank: number,
  priceCny: number,
): ApiRankingSnapshotRow {
  return {
    metric,
    entryKey,
    providerSlug: entryKey.split("-")[0],
    providerName: entryKey.split("-")[0],
    providerColor: "#000",
    modelSlug: entryKey,
    modelName: entryKey,
    modelOrder: rank,
    offerPlanSlug: `${entryKey}-${metric}`,
    rank,
    priceCny,
    displayPrice: `¥${priceCny}`,
  };
}

function previous(row: ApiRankingSnapshotRow, active = true) {
  return {
    metric: row.metric,
    entryKey: row.entryKey,
    providerSlug: row.providerSlug,
    providerName: row.providerName,
    modelSlug: row.modelSlug,
    modelName: row.modelName,
    rank: row.rank,
    priceCny: row.priceCny,
    displayPrice: row.displayPrice,
    active,
  };
}

describe("API ranking history diff", () => {
  it("uses the first collection only as a baseline across all metrics", () => {
    const current = [
      snapshot("cached_input", "alpha-model", 1, 1),
      snapshot("input", "alpha-model", 1, 2),
      snapshot("output", "alpha-model", 1, 3),
    ];
    const result = buildApiRankingEventValues("run-1", [], current);

    expect(result.baseline).toBe(true);
    expect(result.eventValues).toEqual([]);
  });

  it("records rank, price, new-entry and removal changes once per batch", () => {
    const oldAlpha = snapshot("input", "alpha-model", 1, 2);
    const oldBeta = snapshot("input", "beta-model", 2, 3);
    const current = [
      snapshot("input", "alpha-model", 2, 2.5),
      snapshot("input", "gamma-model", 1, 1.5),
    ];
    const result = buildApiRankingEventValues(
      "run-2",
      [previous(oldAlpha), previous(oldBeta)],
      current,
    );

    expect(result.baseline).toBe(false);
    expect(result.eventValues).toHaveLength(3);
    expect(result.eventValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryKey: "alpha-model",
          previousRank: 1,
          currentRank: 2,
          previousPriceCny: 2,
          currentPriceCny: 2.5,
        }),
        expect.objectContaining({
          entryKey: "gamma-model",
          previousRank: null,
          currentRank: 1,
        }),
        expect.objectContaining({
          entryKey: "beta-model",
          previousRank: 2,
          currentRank: null,
        }),
      ]),
    );
    expect(result.removedRows.map((row) => row.entryKey)).toEqual([
      "beta-model",
    ]);
  });

  it("does not emit an event when the same batch values are unchanged", () => {
    const current = snapshot("output", "alpha-model", 1, 8);
    const result = buildApiRankingEventValues(
      "run-3",
      [previous(current)],
      [current],
    );

    expect(result.eventValues).toEqual([]);
    expect(result.removedRows).toEqual([]);
  });

  it("updates no event for exchange-rate-only price and rank movement", () => {
    const oldAlpha = snapshot("input", "alpha-model", 1, 2);
    const oldBeta = snapshot("input", "beta-model", 2, 3);
    const newAlpha = { ...oldAlpha, rank: 2, priceCny: 4 };
    const newBeta = { ...oldBeta, rank: 1, priceCny: 2.5 };
    const result = buildApiRankingEventValues(
      "run-fx",
      [previous(oldAlpha), previous(oldBeta)],
      [newBeta, newAlpha],
    );

    expect(result.eventValues).toEqual([]);
  });

  it("regroups unnotified events by their original collection batch", () => {
    const current = snapshot("input", "alpha-model", 1, 1);
    const event = (id: string, collectionRunId: string, createdAt: Date) => ({
      id,
      collectionRunId,
      metric: "input",
      entryKey: "alpha-model",
      providerSlug: "alpha",
      providerName: "Alpha",
      modelSlug: "alpha-model",
      modelName: "Alpha Model",
      previousRank: 2,
      currentRank: 1,
      previousPriceCny: 2,
      currentPriceCny: 1,
      previousDisplayPrice: "¥2",
      currentDisplayPrice: "¥1",
      rankingSnapshot: [current],
      notifiedAt: null,
      createdAt,
    });
    const rankings = {
      cached_input: [],
      input: [current],
      output: [],
    };
    const batches = buildPendingApiRankingBatches(
      [
        event("event-1", "run-old", new Date("2026-07-31T00:00:00Z")),
        event("event-2", "run-new", new Date("2026-07-31T04:00:00Z")),
      ],
      rankings,
    );

    expect(batches.map((batch) => batch.runId)).toEqual(["run-old", "run-new"]);
    expect(batches[0].result.changes[0].id).toBe("event-1");
    expect(batches[0].result.rankings.input).toEqual([current]);
  });
});
