import { describe, expect, it } from "vitest";
import { modes, providerCatalog, providersForMode } from "@/lib/data/catalog";

describe("catalog contract", () => {
  it("contains the requested modes and all integrated official providers", () => {
    expect(modes.map((mode) => mode.id)).toEqual([
      "global",
      "china-subscription",
      "api",
    ]);
    expect(providersForMode("global").map((item) => item.id)).toEqual([
      "chatgpt",
      "claude",
      "gemini",
      "grok",
    ]);
    expect(providersForMode("china-subscription")[0].id).toBe(
      "glm-resource-package",
    );
    expect(providersForMode("china-subscription")).toHaveLength(15);
    expect(
      providersForMode("china-subscription").map((item) => item.id),
    ).toEqual(
      expect.arrayContaining([
        "glm-coding-plan",
        "comate-subscription",
        "qoder-subscription",
        "trae-subscription",
        "codebuddy-subscription",
        "mimo-token-plan",
        "huawei-token-plan",
        "sensenova-token-plan",
      ]),
    );
    expect(providersForMode("api")).toHaveLength(20);
    expect(providersForMode("api").map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "mimo-api",
        "baichuan-api",
        "longcat-api",
        "siliconflow-api",
        "huawei-maas-api",
        "teleai-api",
        "openai-api",
        "claude-api",
        "gemini-api",
        "grok-api",
      ]),
    );
    expect(
      providersForMode("api")
        .slice(16)
        .map((item) => item.id),
    ).toEqual(["openai-api", "claude-api", "gemini-api", "grok-api"]);
  });

  it("keeps every record traceable to an official HTTPS source", () => {
    for (const provider of providerCatalog) {
      expect(provider.sourceUrl).toMatch(/^https:\/\//);
      expect(provider.offers.length).toBeGreaterThan(0);
      for (const offer of provider.offers) {
        expect(offer.planId).toBeTruthy();
        expect(offer.displayPrice).toBeTruthy();
      }
    }
  });

  it("keeps the Grok fallback catalog on the current mainline allowlist", () => {
    const grok = providerCatalog.find((provider) => provider.id === "grok-api");
    expect(grok).toBeDefined();
    expect(new Set(grok?.offers.map((offer) => offer.modelSlug))).toEqual(
      new Set(["grok-4-6", "grok-4-5", "grok-4-3"]),
    );
  });
});
