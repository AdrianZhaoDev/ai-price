import { hashContent } from "@/lib/collectors/http-client";
import type { NormalizedOffer, SourceHealth } from "@/lib/collectors/types";

type PriceFingerprintInput = {
  amountMinor: number | null;
  currency: string;
  billingPeriod: string | null;
  unit: string | null;
  taxIncluded: boolean | null;
  status: string;
};

export type StoredPriceCandidate = {
  fingerprint: string;
  previousObservationId: string;
  lastCollectionRunId: string;
};

export type PriceSampleDecision = "unchanged" | "stage" | "hold" | "confirm";

export function offerPlanSlug(offer: NormalizedOffer): string {
  return (
    offer.canonicalPlanSlug ??
    `${offer.providerSlug}-${hashContent(offer.rawPlanName).slice(0, 12)}`
  );
}

export function offerIdentity(offer: NormalizedOffer): string {
  return `${offerPlanSlug(offer)}:${offer.storefront ?? "default"}`;
}

export function priceFingerprint(input: PriceFingerprintInput): string {
  return hashContent(
    JSON.stringify({
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      billingPeriod: input.billingPeriod,
      unit: input.unit,
      taxIncluded: input.taxIncluded,
      status: input.status,
    }),
  );
}

export function offerIdentityHealthCheck(
  offers: NormalizedOffer[],
): SourceHealth {
  const byIdentity = new Map<string, NormalizedOffer[]>();
  for (const offer of offers) {
    const identity = offerIdentity(offer);
    const matches = byIdentity.get(identity) ?? [];
    matches.push(offer);
    byIdentity.set(identity, matches);
  }

  const duplicateIdentities = [...byIdentity.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([identity, matches]) => ({
      identity,
      offers: matches.map((offer) => ({
        rawPlanName: offer.rawPlanName,
        displayPrice: offer.displayPrice,
        billingPeriod: offer.billingPeriod,
      })),
    }));

  if (duplicateIdentities.length > 0) {
    return {
      ok: false,
      code: "STRUCTURE_CHANGED",
      message:
        "Multiple offers collapsed into the same source, plan and storefront identity.",
      details: { duplicateIdentities },
    };
  }

  return {
    ok: true,
    code: "OK",
    message: `${offers.length} unique offer identities validated.`,
  };
}

export function decidePriceSample(input: {
  baselineFingerprint: string;
  baselineObservationId: string;
  currentFingerprint: string;
  currentRunId: string;
  candidate?: StoredPriceCandidate;
}): PriceSampleDecision {
  if (input.currentFingerprint === input.baselineFingerprint) {
    return "unchanged";
  }
  if (
    input.candidate?.fingerprint !== input.currentFingerprint ||
    input.candidate.previousObservationId !== input.baselineObservationId
  ) {
    return "stage";
  }
  return input.candidate.lastCollectionRunId === input.currentRunId
    ? "hold"
    : "confirm";
}
