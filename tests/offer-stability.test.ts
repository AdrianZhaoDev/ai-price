import { describe, expect, it } from "vitest";
import {
  decidePriceSample,
  offerIdentityHealthCheck,
  priceFingerprint,
} from "@/lib/collectors/offer-stability";
import type { NormalizedOffer } from "@/lib/collectors/types";

const offer: NormalizedOffer = {
  providerSlug: "trae-subscription",
  productSlug: "trae-subscription",
  canonicalPlanSlug: "trae-速通-pro-monthly",
  rawPlanName: "速通 Pro",
  mode: "subscription",
  channel: "official_web",
  region: "中国",
  storefront: null,
  currency: "CNY",
  amountMinor: 5900,
  displayPrice: "¥59",
  status: "verified",
  billingPeriod: "month",
  unit: null,
  taxIncluded: null,
  sourceUrl: "https://www.trae.cn/pricing",
  observedAt: "2026-07-29T00:00:00.000Z",
  parserVersion: "test-v1",
};

describe("offer stability", () => {
  it("rejects multiple offers collapsed into one persistence identity", () => {
    expect(
      offerIdentityHealthCheck([
        offer,
        {
          ...offer,
          rawPlanName: "速通 Pro+",
          amountMinor: 23900,
          displayPrice: "¥239",
        },
      ]),
    ).toMatchObject({
      ok: false,
      code: "STRUCTURE_CHANGED",
      details: {
        duplicateIdentities: [
          {
            identity: "trae-速通-pro-monthly:default",
            offers: [
              { rawPlanName: "速通 Pro", displayPrice: "¥59" },
              { rawPlanName: "速通 Pro+", displayPrice: "¥239" },
            ],
          },
        ],
      },
    });
  });

  it("requires a changed price in two different runs before confirmation", () => {
    const baselineFingerprint = priceFingerprint(offer);
    const changedFingerprint = priceFingerprint({
      ...offer,
      amountMinor: 23900,
    });

    expect(
      decidePriceSample({
        baselineFingerprint,
        baselineObservationId: "observation-a",
        currentFingerprint: changedFingerprint,
        currentRunId: "run-1",
      }),
    ).toBe("stage");
    expect(
      decidePriceSample({
        baselineFingerprint,
        baselineObservationId: "observation-a",
        currentFingerprint: changedFingerprint,
        currentRunId: "run-1",
        candidate: {
          fingerprint: changedFingerprint,
          previousObservationId: "observation-a",
          lastCollectionRunId: "run-1",
        },
      }),
    ).toBe("hold");
    expect(
      decidePriceSample({
        baselineFingerprint,
        baselineObservationId: "observation-a",
        currentFingerprint: changedFingerprint,
        currentRunId: "run-2",
        candidate: {
          fingerprint: changedFingerprint,
          previousObservationId: "observation-a",
          lastCollectionRunId: "run-1",
        },
      }),
    ).toBe("confirm");
  });

  it("cancels A to B to A and resets B to C candidates", () => {
    const baselineFingerprint = priceFingerprint(offer);
    const changedFingerprint = priceFingerprint({
      ...offer,
      amountMinor: 23900,
    });
    const otherFingerprint = priceFingerprint({
      ...offer,
      amountMinor: 69900,
    });
    const candidate = {
      fingerprint: changedFingerprint,
      previousObservationId: "observation-a",
      lastCollectionRunId: "run-1",
    };

    expect(
      decidePriceSample({
        baselineFingerprint,
        baselineObservationId: "observation-a",
        currentFingerprint: baselineFingerprint,
        currentRunId: "run-2",
        candidate,
      }),
    ).toBe("unchanged");
    expect(
      decidePriceSample({
        baselineFingerprint,
        baselineObservationId: "observation-a",
        currentFingerprint: otherFingerprint,
        currentRunId: "run-2",
        candidate,
      }),
    ).toBe("stage");
  });
});
