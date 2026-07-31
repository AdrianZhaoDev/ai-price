import { describe, expect, it } from "vitest";
import { createCollectorRegistry } from "@/lib/collectors/registry";

describe("global API adapter registry", () => {
  it("registers all four USD adapters with official sources", () => {
    const adapters = createCollectorRegistry().filter((adapter) =>
      [
        "openai-api-pricing-official",
        "claude-api-pricing-official",
        "gemini-api-pricing-official",
        "grok-api-pricing-official",
      ].includes(adapter.id),
    );
    expect(adapters.map((adapter) => adapter.providerSlug)).toEqual([
      "openai-api",
      "claude-api",
      "gemini-api",
      "grok-api",
    ]);
    expect(
      adapters.every(
        (adapter) =>
          adapter.sourceUrl.startsWith("https://") &&
          adapter.quoteCurrencies?.includes("USD"),
      ),
    ).toBe(true);
  });
});
