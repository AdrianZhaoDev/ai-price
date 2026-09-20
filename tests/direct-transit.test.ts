// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectDirectTransit,
  directTransitSources,
  parseDirectTransit,
  selectDirectTransitSources,
} from "@/lib/public-data/direct-transit";

const now = new Date("2026-09-07T00:00:00Z");
// Synthetic response with the original protocol shape; no copied station dataset.
const fixture = () => ({
  schema_version: "ai-transit.v1",
  system: "sub2api",
  generated_at: now.toISOString(),
  station: {
    name: "Test source",
    homepage_url: directTransitSources[0].origin,
  },
  billing: {
    currency: "CNY",
    credit_currency: "USD",
    recharge_multiplier: 2,
    recharge_multiplier_unit: "USD balance per 1 CNY",
    model_price_unit: "USD",
  },
  groups: [
    {
      name: "standard",
      platform: "test",
      rate_multiplier: 0.5,
      models: [
        {
          standard_model: "test-model",
          billing_mode: "token",
          price: {
            input_usd_per_token: 0.000002,
            output_usd_per_token: 0.000008,
            cache_read_usd_per_token: 0,
          },
        },
      ],
    },
  ],
  completeness: {
    has_recharge_ratio: true,
    has_group_multipliers: true,
    has_model_pricing: true,
    warnings: [],
  },
  disclosure: {
    upstream_type: "mixed",
    account_pool_type: "mixed",
    is_reverse: true,
  },
});
const parse = (value: unknown) =>
  parseDirectTransit(value, directTransitSources[0], now);

describe("original station adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  it("converts credit prices to CNY per million without claiming official multiplier or uptime", () => {
    const result = parse(fixture());
    expect(result.offers[0]).toMatchObject({
      inputPrice: 0.5,
      outputPrice: 2,
      cacheReadPrice: 0,
      currency: "CNY",
      status: "verified",
    });
    expect(result.offers[0].combinedMultiplier).toBeUndefined();
    expect(result.availabilitySamples).toEqual([]);
    expect(result.stations[0].status).toBe("unknown");
  });
  it("keeps per-request offers separate", () => {
    const raw = fixture();
    const model = {
      standard_model: "test-image",
      billing_mode: "per_request",
      price: { per_request_usd: 0.08 },
    };
    const result = parse({
      ...raw,
      groups: [{ ...raw.groups[0], models: [model] }],
    });
    expect(result.offers[0]).toMatchObject({
      fixedPrice: 0.02,
      fixedPriceCurrency: "CNY",
      fixedPriceUnit: "request",
      inputPrice: null,
    });
    expect(() =>
      parse({
        ...raw,
        groups: [{ ...raw.groups[0], models: [{ ...model, price: {} }] }],
      }),
    ).toThrow();
  });
  it("expands image-size request prices into separate offers without averaging", () => {
    const raw = fixture();
    const result = parse({
      ...raw,
      groups: [
        {
          ...raw.groups[0],
          models: [
            {
              standard_model: "test-image",
              billing_mode: "per_request",
              price: { image_size_prices: { "2k": 0.08, "1k": 0.04 } },
            },
          ],
        },
      ],
    });
    expect(result.offers).toHaveLength(2);
    expect(result.offers).toMatchObject([
      {
        groupName: "standard / image 1k",
        fixedPrice: 0.01,
        fixedPriceUnit: "image (1k)",
        billingMode: "per_request",
        payload: { adapterVersion: "sub2api-public-v2", imageSize: "1k" },
      },
      {
        groupName: "standard / image 2k",
        fixedPrice: 0.02,
        fixedPriceUnit: "image (2k)",
        billingMode: "per_request",
        payload: { adapterVersion: "sub2api-public-v2", imageSize: "2k" },
      },
    ]);
    expect(new Set(result.offers.map((offer) => offer.id)).size).toBe(2);
  });
  it("retains a generic request price alongside image-size variants", () => {
    const raw = fixture();
    const result = parse({
      ...raw,
      groups: [
        {
          ...raw.groups[0],
          models: [
            {
              standard_model: "test-image",
              billing_mode: "per_request",
              price: {
                per_request_usd: 0.08,
                image_size_prices: { "1k": 0.04 },
              },
            },
          ],
        },
      ],
    });
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]).toMatchObject({
      groupName: "standard",
      fixedPrice: 0.02,
      fixedPriceUnit: "request",
    });
    expect(result.offers[1]).toMatchObject({
      groupName: "standard / image 1k",
      fixedPrice: 0.01,
      fixedPriceUnit: "image (1k)",
    });
  });
  it.each([
    "currency",
    "credit_currency",
    "recharge_multiplier_unit",
    "model_price_unit",
  ])("fails closed on changed %s", (field) => {
    const raw = fixture();
    expect(() =>
      parse({ ...raw, billing: { ...raw.billing, [field]: "unknown" } }),
    ).toThrow();
  });
  it("rejects missing fields, bad values, warnings, stale and mismatched sources", () => {
    const raw = fixture();
    expect(() => parse({ ...raw, billing: {} })).toThrow();
    expect(() =>
      parse({ ...raw, billing: { ...raw.billing, recharge_multiplier: 0 } }),
    ).toThrow();
    expect(() =>
      parse({
        ...raw,
        completeness: { ...raw.completeness, warnings: ["partial"] },
      }),
    ).toThrow();
    expect(() =>
      parse({ ...raw, generated_at: "2026-01-01T00:00:00Z" }),
    ).toThrow();
    expect(() =>
      parse({ ...raw, generated_at: "2027-01-01T00:00:00Z" }),
    ).toThrow();
    expect(() =>
      parse({
        ...raw,
        station: { ...raw.station, homepage_url: "https://example.com" },
      }),
    ).toThrow();
    expect(() => parse({ ...raw, groups: [] })).toThrow();
    expect(() =>
      parse({
        ...raw,
        groups: [
          {
            ...raw.groups[0],
            models: [{ ...raw.groups[0].models[0], price: {} }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parse({
        ...raw,
        groups: [
          {
            ...raw.groups[0],
            models: [
              {
                ...raw.groups[0].models[0],
                price: { input_usd_per_token: -1, output_usd_per_token: 1 },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parse({
        ...raw,
        groups: [
          {
            ...raw.groups[0],
            models: [
              {
                standard_model: "test-image",
                billing_mode: "per_request",
                price: { image_size_prices: {} },
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("uses stable IDs as models are added/removed, rejects duplicates and strips extra fields", () => {
    const raw = fixture();
    const original = parse(raw).offers[0].id;
    expect(original).toBe(
      `${directTransitSources[0].id}-${createHash("sha256")
        .update(JSON.stringify(["standard", "test-model", "token"]))
        .digest("hex")
        .slice(0, 32)}`,
    );
    const added = {
      ...raw.groups[0].models[0],
      standard_model: "another-model",
    };
    const result = parse({
      ...raw,
      credentials: "never retained",
      groups: [{ ...raw.groups[0], models: [added, raw.groups[0].models[0]] }],
    });
    expect(result.offers[1].id).toBe(original);
    expect(JSON.stringify(result)).not.toContain("never retained");
    expect(() =>
      parse({ ...raw, groups: [raw.groups[0], raw.groups[0]] }),
    ).toThrow();
  });
  it("only allows reviewed source IDs", () => {
    expect(selectDirectTransitSources("sub-callai-one,wawazz")).toHaveLength(2);
    for (const value of ["", "https://example.com", "wawazz,wawazz"])
      expect(() => selectDirectTransitSources(value)).toThrow();
  });
  it("fetches sequentially through fixed discovery endpoints and rejects endpoint changes", async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValueOnce({
        schema_version: "ai-transit.v1",
        snapshot_url: `${directTransitSources[0].origin}/api/public/transit/v1/snapshot`,
      })
      .mockResolvedValueOnce(fixture());
    const result = await collectDirectTransit("sub-callai-one", fetchJson, now);
    expect(result.offers).toHaveLength(1);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson.mock.calls[0][0].pathname).toBe(
      "/.well-known/ai-transit.json",
    );
    await expect(
      collectDirectTransit(
        "sub-callai-one",
        async () => ({
          schema_version: "ai-transit.v1",
          snapshot_url: "https://example.com",
        }),
        now,
      ),
    ).rejects.toThrow();
  });
  it("does not return a partial batch if a selected source fails", async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValueOnce({
        schema_version: "ai-transit.v1",
        snapshot_url: `${directTransitSources[0].origin}/api/public/transit/v1/snapshot`,
      })
      .mockResolvedValueOnce(fixture())
      .mockRejectedValueOnce(new Error("unavailable"));
    await expect(
      collectDirectTransit("sub-callai-one,wawazz", fetchJson, now),
    ).rejects.toThrow();
  });
});
