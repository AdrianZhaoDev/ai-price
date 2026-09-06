// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  collectDirectChannels,
  parseDirectChannels,
  verifyOriginalCurrency,
} from "@/lib/public-data/direct-channels";
const fixture = () => ({
  code: 200,
  total: 1,
  data: [
    {
      id: 89,
      name: "支付宝 - 1个月PLUS代充 订阅质保掉订阅 不可囤卡 IOS 渠道",
      status: 1,
      hide: 0,
      price: 130,
      has_wholesale: false,
      seckill_active: false,
    },
  ],
});
describe("original merchant adapter", () => {
  it("maps only a reviewed SKU, preserves guest list price, and does not infer hidden stock", () => {
    const result = parseDirectChannels(fixture());
    expect(result.offers[0]).toMatchObject({
      priceMinor: 13000,
      currency: "CNY",
      availability: "unknown",
    });
    expect(result.sourceCount).toBe(1);
  });
  it.each([
    { price: -1 },
    { price: 99999 },
    { price: 1.001 },
    { name: "different plan" },
    { status: 0 },
    { hide: 1 },
    { has_wholesale: true },
    { seckill_active: true },
  ])("rejects changed price/plan conditions %j", (change) => {
    const raw = fixture();
    expect(() =>
      parseDirectChannels({ ...raw, data: [{ ...raw.data[0], ...change }] }),
    ).toThrow();
  });
  it("rejects missing, duplicate, oversized and incomplete catalogues", () => {
    const raw = fixture();
    for (const data of [
      {},
      { ...raw, total: 2 },
      { ...raw, total: 51 },
      { ...raw, total: 0, data: [] },
      { ...raw, total: 2, data: [raw.data[0], raw.data[0]] },
    ])
      expect(() => parseDirectChannels(data)).toThrow();
  });
  it("ignores unrelated SKU additions and strips all extra fields", () => {
    const raw = fixture();
    const result = parseDirectChannels({
      ...raw,
      total: 2,
      data: [
        { ...raw.data[0], id: 90 },
        { ...raw.data[0], user_price: 1, secret: "never retained" },
      ],
    });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].priceMinor).toBe(13000);
    expect(JSON.stringify(result)).not.toContain("never retained");
  });
  it("uses one fixed public read-only endpoint and rejects arbitrary targets", async () => {
    const fetchJson = vi.fn().mockResolvedValue(fixture());
    await collectDirectChannels(
      "redeemgpt-public",
      fetchJson,
      new Date(),
      async () => 'setVar("CURRENCY",{"code":"CNY","rate":"1","decimals":2});',
    );
    expect(fetchJson).toHaveBeenCalledTimes(1);
    await expect(
      collectDirectChannels("https://example.com", fetchJson),
    ).rejects.toThrow();
  });
  it("rejects a currency switch or missing declaration without evaluating page scripts", () => {
    expect(() =>
      verifyOriginalCurrency(
        'setVar("CURRENCY",{"code":"USD","rate":"1","decimals":2});',
      ),
    ).toThrow();
    expect(() => verifyOriginalCurrency("no declaration")).toThrow();
  });
});
