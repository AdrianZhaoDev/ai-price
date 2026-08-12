import { describe, expect, it } from "vitest";
import { modelSnapshotSummary } from "@/lib/model-catalog/seo";
import type { ModelDetail } from "@/lib/model-catalog/types";

function detail(overrides: Partial<ModelDetail> = {}): ModelDetail {
  return {
    id: "lab/free",
    name: "Free",
    labId: "lab",
    labName: "Lab",
    context: 100_000,
    inputModalities: ["text"],
    releaseDate: "2026-01-01",
    updatedDate: "2026-08-11",
    providerCount: 1,
    providerIds: ["provider"],
    providerNames: ["Provider"],
    active: true,
    origin: "models.dev",
    openWeights: false,
    outputModalities: ["text"],
    capabilities: {},
    providers: [],
    catalogVersion: "a".repeat(40),
    sourceUrl: "https://example.com",
    ...overrides,
  };
}

describe("model catalog snapshot SEO", () => {
  it("does not attach the price unit to context when no non-zero minimum exists", () => {
    const summary = modelSnapshotSummary(detail(), "en");

    expect(summary).toContain("a 100,000-token context window.");
    expect(summary).not.toContain("context window per million tokens");
  });

  it("keeps the unit inside the non-zero price sentence", () => {
    const summary = modelSnapshotSummary(
      detail({ minInputPrice: 1.25, minOutputPrice: 3 }),
      "en",
    );

    expect(summary).toContain(
      "Non-zero API prices per million tokens: input from $1.25, output from $3.",
    );
  });
});
