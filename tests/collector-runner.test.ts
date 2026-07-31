import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NormalizedOffer,
  PriceSourceAdapter,
} from "@/lib/collectors/types";
import { CollectionError } from "@/lib/collectors/types";
import type { PriceChange } from "@/lib/collectors/persistence";

const state = vi.hoisted(() => ({
  databaseConfigured: false,
  startCollectionRun: vi.fn(async () => "run-1"),
  ensureSource: vi.fn(async () => ({
    id: "source-1",
    productId: "product-1",
    lastOfferCount: null as number | null,
  })),
  markSourceAttempt: vi.fn(async () => undefined),
  recordSuccessfulCollection: vi.fn<() => Promise<PriceChange[]>>(
    async () => [],
  ),
  recordCollectionFailure: vi.fn(async () => ({
    errorId: "error-1",
    consecutiveFailures: 3,
    shouldAlert: true,
  })),
  finishCollectionRun: vi.fn(async () => undefined),
  markCollectionAlertFailed: vi.fn(async () => undefined),
  markCollectionAlertSent: vi.fn(async () => undefined),
  markPriceChangesNotified: vi.fn(async () => undefined),
  buildPriceChangeDigests: vi.fn(
    async (_runId: string, changes: PriceChange[]) => ({
      digests: changes.length
        ? [
            {
              runId: "run-1",
              eventIds: changes.map((change) => change.eventId),
              providerSlug: changes[0].providerSlug,
              planSlug: changes[0].planSlug,
              planName: changes[0].planName,
              changes,
              topThree: [],
            },
          ]
        : [],
      ignoredEventIds: [],
    }),
  ),
  notifyPriceChangeDigest: vi.fn(async () => 1),
  sendAdminCollectionAlert: vi.fn(async () => true),
  refreshFxRates: vi.fn(
    async () =>
      new Map([
        [
          "USD",
          {
            currency: "USD",
            cnyPerUnit: 7,
            rateDate: "2026-07-23",
            observedAt: new Date("2026-07-23T10:00:00Z"),
            sourceUrl: "https://fx.example",
          },
        ],
        [
          "CNY",
          {
            currency: "CNY",
            cnyPerUnit: 1,
            rateDate: "2026-07-23",
            observedAt: new Date("2026-07-23T10:00:00Z"),
            sourceUrl: "https://fx.example",
          },
        ],
      ]),
  ),
}));

vi.mock("@/lib/db/client", () => ({
  isDatabaseConfigured: () => state.databaseConfigured,
}));

vi.mock("@/lib/collectors/persistence", () => ({
  startCollectionRun: state.startCollectionRun,
  ensureSource: state.ensureSource,
  markSourceAttempt: state.markSourceAttempt,
  recordSuccessfulCollection: state.recordSuccessfulCollection,
  recordCollectionFailure: state.recordCollectionFailure,
  finishCollectionRun: state.finishCollectionRun,
  markCollectionAlertFailed: state.markCollectionAlertFailed,
  markCollectionAlertSent: state.markCollectionAlertSent,
  markPriceChangesNotified: state.markPriceChangesNotified,
  buildPriceChangeDigests: state.buildPriceChangeDigests,
}));

vi.mock("@/lib/alerts/notifier", () => ({
  notifyPriceChangeDigest: state.notifyPriceChangeDigest,
  sendAdminCollectionAlert: state.sendAdminCollectionAlert,
}));

vi.mock("@/lib/collectors/fx", () => ({
  refreshFxRates: state.refreshFxRates,
}));

import { runCollectors } from "@/lib/collectors/runner";

const offer: NormalizedOffer = {
  providerSlug: "chatgpt",
  productSlug: "chatgpt",
  canonicalPlanSlug: "chatgpt-plus-monthly",
  rawPlanName: "ChatGPT Plus",
  mode: "subscription",
  channel: "app_store",
  region: "美国",
  storefront: "US",
  currency: "USD",
  amountMinor: 1999,
  displayPrice: "$19.99",
  status: "verified",
  billingPeriod: "month",
  unit: null,
  taxIncluded: null,
  sourceUrl: "https://apps.apple.com/example",
  observedAt: "2026-07-23T10:00:00.000Z",
  parserVersion: "test-v1",
};

function adapter(
  id: string,
  overrides: Partial<PriceSourceAdapter> = {},
): PriceSourceAdapter {
  return {
    id,
    providerSlug: "chatgpt",
    sourceUrl: offer.sourceUrl,
    parserVersion: "test-v1",
    collect: vi.fn(async () => ({
      sourceUrl: offer.sourceUrl,
      status: 200,
      headers: {},
      body: "fixture",
      contentHash: "hash",
      observedAt: offer.observedAt,
    })),
    parse: vi.fn(async () => [offer]),
    healthCheck: vi.fn(() => ({
      ok: true,
      code: "OK" as const,
      message: "ok",
    })),
    ...overrides,
  };
}

describe("collector runner", () => {
  beforeEach(() => {
    state.databaseConfigured = false;
    vi.clearAllMocks();
  });

  it("summarizes dry-run successes and failures", async () => {
    const summary = await runCollectors(
      [
        adapter("success"),
        adapter("empty", {
          healthCheck: () => ({
            ok: false,
            code: "EMPTY_RESULT",
            message: "empty",
          }),
        }),
        adapter("network", {
          collect: async () => {
            throw new CollectionError("FETCH_FAILED", "offline");
          },
        }),
      ],
      { concurrency: 2 },
    );
    expect(summary).toEqual({
      sourceCount: 3,
      successCount: 1,
      failureCount: 2,
      offerCount: 1,
      changeCount: 0,
    });
  });

  it("persists changes, alerts jumps and escalates repeated failures", async () => {
    state.databaseConfigured = true;
    state.recordSuccessfulCollection.mockResolvedValueOnce([
      {
        eventId: "event-1",
        planId: "plan-db-1",
        previousObservationId: "observation-1",
        currentObservationId: "observation-2",
        providerSlug: "chatgpt",
        planSlug: "chatgpt-plus-monthly",
        planName: "ChatGPT Plus",
        region: "美国",
        previousPrice: "$19.99",
        currentPrice: "$39.99",
        previousCny: 140,
        currentCny: 280,
        sourceUrl: offer.sourceUrl,
        changePercent: 100,
      },
    ]);

    const summary = await runCollectors([
      adapter("changed"),
      adapter("failed", {
        collect: async () => {
          throw new Error("broken parser");
        },
      }),
    ]);

    expect(summary.changeCount).toBe(1);
    expect(state.notifyPriceChangeDigest).toHaveBeenCalledOnce();
    expect(state.sendAdminCollectionAlert).toHaveBeenCalledTimes(2);
    expect(state.markCollectionAlertSent).toHaveBeenCalledWith("error-1");
    expect(state.finishCollectionRun).toHaveBeenCalledWith({
      runId: "run-1",
      successCount: 1,
      failureCount: 1,
    });
  });

  it("rejects a plan-count collapse before persistence", async () => {
    state.databaseConfigured = true;
    state.ensureSource.mockResolvedValueOnce({
      id: "source-1",
      productId: "product-1",
      lastOfferCount: 10,
    });
    const summary = await runCollectors([adapter("collapsed")]);
    expect(summary.failureCount).toBe(1);
    expect(state.recordSuccessfulCollection).not.toHaveBeenCalled();
    expect(state.recordCollectionFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PLAN_COUNT_COLLAPSE" }),
    );
  });

  it("persists actionable health-check details", async () => {
    state.databaseConfigured = true;
    const summary = await runCollectors([
      adapter("duplicate-plan", {
        healthCheck: () => ({
          ok: false,
          code: "STRUCTURE_CHANGED",
          message: "duplicate identity",
          details: {
            duplicateIdentities: [
              {
                identity: "supergrok-monthly:PH:month",
                offers: ["SuperGrok", "SuperGrok Plus"],
              },
            ],
          },
        }),
      }),
    ]);
    expect(summary.failureCount).toBe(1);
    expect(state.recordCollectionFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "STRUCTURE_CHANGED",
        details: expect.objectContaining({
          duplicateIdentities: expect.any(Array),
        }),
      }),
    );
  });

  it("rejects universal offer identity collisions before persistence", async () => {
    state.databaseConfigured = true;
    const summary = await runCollectors([
      adapter("duplicate-official-plan", {
        parse: async () => [
          offer,
          {
            ...offer,
            rawPlanName: "ChatGPT Plus annual",
            amountMinor: 19900,
            displayPrice: "$199.00",
          },
        ],
      }),
    ]);
    expect(summary.failureCount).toBe(1);
    expect(state.recordSuccessfulCollection).not.toHaveBeenCalled();
    expect(state.recordCollectionFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "STRUCTURE_CHANGED",
        details: expect.objectContaining({
          duplicateIdentities: expect.any(Array),
        }),
      }),
    );
  });

  it("does not repeat an alert for an already-alerted open incident", async () => {
    state.databaseConfigured = true;
    state.recordCollectionFailure.mockResolvedValueOnce({
      errorId: "error-2",
      consecutiveFailures: 4,
      shouldAlert: false,
    });
    const summary = await runCollectors([
      adapter("still-failing", {
        collect: async () => {
          throw new Error("upstream still unavailable");
        },
      }),
    ]);
    expect(summary.failureCount).toBe(1);
    expect(state.sendAdminCollectionAlert).not.toHaveBeenCalled();
    expect(state.markCollectionAlertSent).not.toHaveBeenCalled();
  });

  it("releases the alert claim when delivery fails", async () => {
    state.databaseConfigured = true;
    state.sendAdminCollectionAlert.mockResolvedValueOnce(false);
    const summary = await runCollectors([
      adapter("delivery-failed", {
        collect: async () => {
          throw new Error("upstream unavailable");
        },
      }),
    ]);
    expect(summary.failureCount).toBe(1);
    expect(state.markCollectionAlertFailed).toHaveBeenCalledWith("error-1");
    expect(state.markCollectionAlertSent).not.toHaveBeenCalled();
  });

  it("accepts a one-offer change in a small App Store plan set", async () => {
    state.databaseConfigured = true;
    state.ensureSource.mockResolvedValueOnce({
      id: "source-1",
      productId: "product-1",
      lastOfferCount: 3,
    });
    const secondOffer: NormalizedOffer = {
      ...offer,
      canonicalPlanSlug: "chatgpt-pro-monthly",
      rawPlanName: "ChatGPT Pro",
      amountMinor: 3999,
      displayPrice: "$39.99",
    };
    const summary = await runCollectors([
      adapter("small-plan-set", {
        parse: async () => [offer, secondOffer],
      }),
    ]);
    expect(summary.failureCount).toBe(0);
    expect(summary.successCount).toBe(1);
    expect(state.recordSuccessfulCollection).toHaveBeenCalledOnce();
  });

  it("allows a manually verified plan-count baseline change", async () => {
    state.databaseConfigured = true;
    state.ensureSource.mockResolvedValueOnce({
      id: "source-1",
      productId: "product-1",
      lastOfferCount: 10,
    });
    const summary = await runCollectors([adapter("verified-collapse")], {
      acceptPlanCountChange: true,
    });
    expect(summary.failureCount).toBe(0);
    expect(state.recordSuccessfulCollection).toHaveBeenCalledOnce();
  });

  it("requests adapter quote currencies before publishing USD offers", async () => {
    state.databaseConfigured = true;
    await runCollectors([
      adapter("global-usd", {
        quoteCurrencies: ["USD"],
      }),
    ]);
    expect(state.refreshFxRates).toHaveBeenCalledWith(
      expect.arrayContaining(["CNY", "USD"]),
      expect.any(Date),
    );
    expect(state.recordSuccessfulCollection).toHaveBeenCalledOnce();
  });

  it("does not publish when no live or historical USD rate exists", async () => {
    state.databaseConfigured = true;
    state.refreshFxRates.mockRejectedValueOnce(
      new Error("No live or persisted RMB exchange rate for: USD."),
    );
    await expect(
      runCollectors([
        adapter("global-usd", {
          quoteCurrencies: ["USD"],
        }),
      ]),
    ).rejects.toThrow("No live or persisted RMB exchange rate for: USD.");
    expect(state.recordSuccessfulCollection).not.toHaveBeenCalled();
  });

  it("does not treat a partial App Store purchase list as a source collapse", async () => {
    state.databaseConfigured = true;
    state.ensureSource.mockResolvedValueOnce({
      id: "source-1",
      productId: "product-1",
      lastOfferCount: 5,
    });
    const secondOffer: NormalizedOffer = {
      ...offer,
      canonicalPlanSlug: "google-ai-pro-monthly",
      rawPlanName: "Google AI Pro",
      amountMinor: 2999,
      displayPrice: "$29.99",
    };
    const summary = await runCollectors([
      adapter("gemini-app-store-br", {
        parse: async () => [offer, secondOffer],
      }),
    ]);
    expect(summary.failureCount).toBe(0);
    expect(state.recordSuccessfulCollection).toHaveBeenCalledOnce();
  });
});
