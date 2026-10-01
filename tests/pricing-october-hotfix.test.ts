import { describe, expect, it, vi } from "vitest";
import {
  officialPageAdapters,
  parseMiniMaxTokenPlan,
} from "@/lib/collectors/adapters/official-pages";
import { parseMiniMaxApi } from "@/lib/collectors/adapters/api-pricing/rules";
import { hashContent } from "@/lib/collectors/http-client";

const raw = (body: string) => ({
  body,
  sourceUrl: "https://platform.minimax.io/docs/guides/pricing-paygo.md",
  status: 200,
  headers: {},
  contentHash: hashContent(body),
  observedAt: "2026-10-01T00:00:00Z",
});
const plans = (prices = "$22 /month | $55 /month | $132 /month") =>
  `| | Plus | Max | Ultra |\n| :- | :-: | -: | :- |\n| Price | ${prices} |`;

describe("official pricing page format changes", () => {
  it("reads compact MiniMax separators and keeps monthly USD prices", () => {
    expect(
      parseMiniMaxTokenPlan(raw(plans())).map((o) => o.amountMinor),
    ).toEqual([2200, 5500, 13200]);
    const adapter = officialPageAdapters.find(
      (a) => a.id === "minimax-token-plan-official",
    )!;
    expect(adapter.healthCheck(parseMiniMaxTokenPlan(raw(plans()))).ok).toBe(
      true,
    );
    for (const prices of [
      "$22 /month | | $132 /month",
      "$-22 /month | $55 /month | $132 /month",
      "$NaN /month | $55 /month | $132 /month",
    ]) {
      expect(
        adapter.healthCheck(parseMiniMaxTokenPlan(raw(plans(prices)))).ok,
      ).toBe(false);
    }
    expect(parseMiniMaxTokenPlan(raw("| | Plus | Max | Ultra |"))).toEqual([]);
    expect(
      parseMiniMaxTokenPlan(
        raw(
          plans()
            .replace("Ultra |", "Ultra | Extra |")
            .replace("$132 /month |", "$132 /month | $200 /month |"),
        ),
      ),
    ).toHaveLength(4);
  });

  it("uses current MiniMax prices instead of struck-out list prices", () => {
    const body = `    | Model | Input | Output | Prompt caching Read |\n    | :- | :- | :- | :- |\n    | MiniMax-M3 | ~~\\$0.60~~ \\$0.30 / M tokens | ~~\\$2.40~~ \\$1.20 / M tokens | ~~\\$0.12~~ \\$0.06 / M tokens |`;
    expect(parseMiniMaxApi(raw(body)).map((o) => o.amountMinor)).toEqual([
      30, 120, 6,
    ]);
    expect(
      parseMiniMaxApi(raw(body)).every(
        (o) => o.currency === "USD" && o.unit === "/百万 tokens",
      ),
    ).toBe(true);
    for (const price of ["", "$-1", "$NaN"]) {
      expect(parseMiniMaxApi(raw(body.replace("\\$0.30", price)))).toHaveLength(
        2,
      );
    }
    expect(
      parseMiniMaxApi(raw(body.split("\n").slice(0, 2).join("\n"))),
    ).toEqual([]);
    const adapter = officialPageAdapters.find(
      (a) => a.id === "minimax-paygo-official",
    )!;
    expect(adapter.healthCheck(parseMiniMaxApi(raw(body))).ok).toBe(false);
  });

  it("fetches Claude's official Markdown endpoint and preserves the public source URL", async () => {
    const adapter = officialPageAdapters.find(
      (a) => a.id === "claude-api-pricing-official",
    )!;
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("# Pricing", { status: 200 }));
    try {
      const collected = await adapter.collect({
        observedAt: new Date("2026-10-01T00:00:00Z"),
      });
      expect(mock.mock.calls[0][0]).toBe(
        "https://platform.claude.com/docs/en/about-claude/pricing.md",
      );
      expect(collected.sourceUrl).toBe(adapter.sourceUrl);
      expect(adapter.parserVersion).toBe("claude-api-v4");
      expect(adapter.healthCheck(await adapter.parse(collected)).ok).toBe(
        false,
      );
    } finally {
      mock.mockRestore();
    }
  });
});
