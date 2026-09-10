import { describe, expect, it } from "vitest";
import {
  modelDecisionNotes,
  modelSnapshotSummary,
} from "@/lib/model-catalog/seo";
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

  it("builds model-specific evaluation notes from searchable facts", () => {
    const notes = modelDecisionNotes(
      detail({
        name: "Reasoner",
        output: 8_192,
        providerIds: ["one", "two"],
        capabilities: { reasoning: true, toolCall: true, temperature: true },
      }),
    );

    expect(notes).toHaveLength(3);
    expect(notes.join(" ")).toContain("Reasoner");
    expect(notes.join(" ")).toContain("100,000 tokens 上下文");
    expect(notes.join(" ")).toContain("2 个有效服务选项");
    expect(notes.join(" ")).toContain("推理、工具调用、温度控制");
  });

  it("labels retained provider entries as historical for archived models", () => {
    const notes = modelDecisionNotes(detail({ active: false }));

    expect(notes.join(" ")).toContain("归档快照");
    expect(notes.join(" ")).toContain("不代表当前仍可使用");
    expect(notes.join(" ")).not.toContain("有效服务选项");
  });
});
