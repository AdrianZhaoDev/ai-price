import { z } from "zod";
import { fetchPublicSnapshot, fetchPublicText } from "./fetch";
import { channelSnapshotSchema, type ChannelSnapshot } from "./snapshot";

export const directChannelSourceId = "redeemgpt-public";
const origin = "https://faka.redeemgpt.com";
const endpoint = `${origin}/user/api/index/commodity?limit=50&page=1`;
const responseSchema = z.object({
  code: z.literal(200),
  total: z.number().int().nonnegative().max(50),
  data: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(500),
        status: z.number().int(),
        hide: z.number().int(),
        price: z.number().finite().nonnegative(),
        has_wholesale: z.boolean(),
        seckill_active: z.boolean(),
      }),
    )
    .max(50),
});

/** Narrow reviewed SKU mapping; never infer a subscription from arbitrary titles. */
export function parseDirectChannels(
  value: unknown,
  now = new Date(),
): ChannelSnapshot {
  const raw = responseSchema.parse(value);
  if (
    raw.data.length !== raw.total ||
    new Set(raw.data.map((item) => item.id)).size !== raw.total
  )
    throw new Error("Incomplete original merchant catalogue.");
  const item = raw.data.find((row) => row.id === 89);
  if (
    !item ||
    item.status !== 1 ||
    item.hide !== 0 ||
    item.has_wholesale ||
    item.seckill_active ||
    item.name.replace(/\s+/g, " ").trim() !==
      "支付宝 - 1个月PLUS代充 订阅质保掉订阅 不可囤卡 IOS 渠道" ||
    item.price <= 0 ||
    item.price >= 10_000
  )
    throw new Error("Reviewed merchant SKU changed; review required.");
  const minor = item.price * 100;
  if (Math.abs(minor - Math.round(minor)) > 0.000001)
    throw new Error("Original currency precision changed.");
  const time = now.toISOString();
  return channelSnapshotSchema.parse({
    schemaVersion: 1,
    domain: "channels",
    generatedAt: time,
    sourceCount: 1,
    merchants: [
      {
        id: directChannelSourceId,
        slug: directChannelSourceId,
        name: "86 / RedeemGPT",
        host: "faka.redeemgpt.com",
        websiteUrl: origin,
        status: "active",
        platforms: ["ChatGPT"],
        riskLabels: [
          "商家自报 / Merchant reported",
          "代充风险 / Third-party recharge risk",
        ],
      },
    ],
    products: [
      {
        id: "redeemgpt-plus-recharge-89",
        slug: "redeemgpt-plus-recharge-89",
        displayName: "ChatGPT Plus 代充（原站商品 89）",
        platform: "ChatGPT",
        productType: "recharge",
        spec: "原站标称 1 个月 / Merchant advertises one month",
        summary:
          "仅记录原站未登录列表报价；不是官方直营价格。 / Public guest-list price, not an official offer.",
      },
    ],
    offers: [
      {
        id: "redeemgpt-offer-89",
        merchantId: directChannelSourceId,
        productId: "redeemgpt-plus-recharge-89",
        sourceName: "公开 API / Original merchant catalogue",
        sourceUrl: endpoint,
        offerUrl: origin,
        title: item.name,
        priceMinor: Math.round(minor),
        currency: "CNY",
        availability: "unknown",
        status: "verified",
        observedAt: time,
        lastSeenAt: time,
        tags: ["列表报价 / Listed price"],
        riskLabels: [
          "成交价及规格以原站为准 / Confirm final price and variant at source",
          "不收集账号凭据 / No credentials collected",
        ],
      },
    ],
  });
}

export function verifyOriginalCurrency(html: string): void {
  const matches = [...html.matchAll(/setVar\("CURRENCY",(\{[^;]*?\})\);/g)];
  if (matches.length !== 1)
    throw new Error("Original currency declaration changed.");
  z.object({
    code: z.literal("CNY"),
    rate: z.literal("1"),
    decimals: z.literal(2),
  }).parse(JSON.parse(matches[0][1]));
}

export async function collectDirectChannels(
  ids: string,
  fetchJson = fetchPublicSnapshot,
  now = new Date(),
  fetchHtml = fetchPublicText,
): Promise<ChannelSnapshot> {
  if (ids.trim() !== directChannelSourceId)
    throw new Error("Unknown reviewed merchant source.");
  verifyOriginalCurrency(await fetchHtml(new URL(origin)));
  return parseDirectChannels(await fetchJson(new URL(endpoint)), now);
}
