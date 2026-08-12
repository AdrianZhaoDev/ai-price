import { describe, expect, it } from "vitest";
import {
  buildModelCatalogFacets,
  isIndexableModelSummary,
  relatedModelsFor,
} from "@/lib/model-catalog/discovery";
import type {
  ModelCatalogSummary,
  ModelDetail,
} from "@/lib/model-catalog/types";

function summary(
  id: string,
  overrides: Partial<ModelCatalogSummary> = {},
): ModelCatalogSummary {
  return {
    id,
    name: id.split("/").at(-1) ?? id,
    labId: id.split("/")[0] ?? "lab",
    labName: id.split("/")[0] ?? "Lab",
    context: 128_000,
    inputModalities: ["text"],
    releaseDate: "2026-01-01",
    updatedDate: "2026-08-11",
    providerCount: 1,
    providerIds: ["provider"],
    providerNames: ["Provider"],
    active: true,
    origin: "models.dev",
    ...overrides,
  };
}

function detail(overrides: Partial<ModelDetail> = {}): ModelDetail {
  return {
    ...summary("lab/atlas", { family: "atlas" }),
    openWeights: false,
    outputModalities: ["text"],
    capabilities: {},
    providers: [],
    catalogVersion: "a".repeat(40),
    sourceUrl: "https://example.com/models/lab/atlas.toml",
    ...overrides,
  };
}

describe("model catalog discovery", () => {
  it("requires an active, served model with useful content for indexing", () => {
    expect(isIndexableModelSummary(summary("lab/served"))).toBe(true);
    expect(
      isIndexableModelSummary(
        summary("lab/unserved", {
          providerCount: 0,
          providerIds: [],
          providerNames: [],
        }),
      ),
    ).toBe(false);
    expect(
      isIndexableModelSummary(
        summary("lab/free", {
          context: undefined,
          output: undefined,
          description: undefined,
          minInputPrice: undefined,
          minOutputPrice: undefined,
          hasZeroInputPrice: true,
        }),
      ),
    ).toBe(true);
    expect(
      isIndexableModelSummary(
        summary("lab/empty", {
          context: undefined,
          output: undefined,
          description: undefined,
          minInputPrice: undefined,
          minOutputPrice: undefined,
        }),
      ),
    ).toBe(false);
    expect(
      isIndexableModelSummary(summary("lab/archived", { active: false })),
    ).toBe(false);
  });

  it("builds deduplicated facets from indexable summaries", () => {
    expect(
      buildModelCatalogFacets([
        summary("lab/atlas", {
          providerIds: ["a", "b"],
          providerNames: ["Provider A", "Provider B"],
          inputModalities: ["text", "image"],
        }),
        summary("lab/atlas-mini", {
          providerIds: ["a"],
          providerNames: ["Provider A"],
          inputModalities: ["text"],
        }),
      ]),
    ).toEqual({
      labs: [["lab", "lab"]],
      providers: [
        ["a", "Provider A"],
        ["b", "Provider B"],
      ],
      modalities: ["image", "text"],
    });
  });

  it("prefers related models from the same lab and family", () => {
    const related = relatedModelsFor(detail(), [
      summary("other/newest", { updatedDate: "2026-12-01" }),
      summary("lab/different-family", { family: "other" }),
      summary("lab/atlas-mini", { family: "atlas" }),
      summary("lab/atlas"),
    ]);

    expect(related.map((model) => model.id)).toEqual([
      "lab/atlas-mini",
      "lab/different-family",
      "other/newest",
    ]);
  });

  it("reserves stable neighbors so every indexable model receives model-page links", () => {
    const models = [
      summary("lab/atlas"),
      summary("lab/bravo"),
      summary("lab/charlie"),
      summary("lab/delta"),
      summary("lab/echo"),
    ];

    const related = relatedModelsFor(detail(), models, 3).map(
      (model) => model.id,
    );

    expect(related).toContain("lab/bravo");
    expect(related).toContain("lab/echo");
    expect(new Set(related).size).toBe(related.length);
  });

  it("deduplicates the wraparound neighbor in a two-model catalog", () => {
    const related = relatedModelsFor(
      detail(),
      [summary("lab/atlas"), summary("lab/bravo")],
      6,
    );

    expect(related.map((model) => model.id)).toEqual(["lab/bravo"]);
  });
});
