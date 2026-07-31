import { load } from "cheerio";
import { fetchPage } from "@/lib/collectors/http-client";
import { errorDiagnosticDetails } from "@/lib/collectors/diagnostics";
import {
  parseBaichuanApi,
  parseBaiduApi,
  parseDeepSeekApi,
  parseDoubaoApi,
  parseGlmApi,
  parseHuaweiMaaSApi,
  parseHunyuanApi,
  parseKimiApi,
  parseLongCatApi,
  parseMimoApi,
  parseMiniMaxApi,
  parseQwenApi,
  parseSiliconFlowApi,
  parseSparkApi,
  parseStepFunApi,
  parseTeleAiApi,
} from "@/lib/collectors/adapters/api-pricing/rules";
import {
  parseLocalizedPrice,
  slugifyPlan,
} from "@/lib/collectors/price-parser";
import type {
  CollectionContext,
  NormalizedOffer,
  PriceSourceAdapter,
  RawCollectionResult,
  SourceHealth,
} from "@/lib/collectors/types";
import { CollectionError } from "@/lib/collectors/types";

type Parser = (raw: RawCollectionResult) => NormalizedOffer[];

let sharedLargeOfficialFetch:
  | {
      key: string;
      promise: Promise<RawCollectionResult>;
    }
  | undefined;

function tableRows(html: string, tableIndex = 0): string[][] {
  const $ = load(html);
  const rows: string[][] = [];
  $("table")
    .eq(tableIndex)
    .find("tr")
    .each((_, row) => {
      rows.push(
        $(row)
          .find("th,td")
          .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
          .get(),
      );
    });
  return rows;
}

function allTableRows(html: string): string[][][] {
  const $ = load(html);
  const tables: string[][][] = [];
  $("table").each((index) => {
    tables.push(tableRows(html, index));
  });
  return tables;
}

function numbers(value: string): number[] {
  return [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function lastNumber(value: string): number | null {
  const values = numbers(value);
  return values.at(-1) ?? null;
}

function usageOffers(input: {
  providerSlug: string;
  modelSlug: string;
  modelName: string;
  prices: Array<{ suffix: string; label: string; value: number }>;
  sourceUrl: string;
  observedAt: string;
  parserVersion: string;
  unit?: string;
}): NormalizedOffer[] {
  return input.prices.map((price) =>
    cnyOffer({
      providerSlug: input.providerSlug,
      planSlug: `${input.modelSlug}-${price.suffix}`,
      planName: `${input.modelName} · ${price.label}`,
      displayPrice: `¥${price.value}`,
      billingPeriod: "usage",
      channel: "official_api",
      sourceUrl: input.sourceUrl,
      observedAt: input.observedAt,
      parserVersion: input.parserVersion,
      unit: input.unit ?? "/百万 tokens",
    }),
  );
}

function cnyOffer(input: {
  providerSlug: string;
  planSlug: string;
  planName: string;
  displayPrice: string;
  billingPeriod: NormalizedOffer["billingPeriod"];
  channel: NormalizedOffer["channel"];
  sourceUrl: string;
  observedAt: string;
  parserVersion: string;
  unit?: string;
}): NormalizedOffer {
  return {
    providerSlug: input.providerSlug,
    productSlug: input.providerSlug,
    canonicalPlanSlug: input.planSlug,
    rawPlanName: input.planName,
    mode: input.billingPeriod === "usage" ? "api" : "subscription",
    channel: input.channel,
    region: "中国大陆",
    storefront: null,
    currency: "CNY",
    amountMinor: parseLocalizedPrice(input.displayPrice, "CNY"),
    displayPrice: input.displayPrice,
    status: "verified",
    billingPeriod: input.billingPeriod,
    unit: input.unit ?? null,
    taxIncluded: null,
    sourceUrl: input.sourceUrl,
    observedAt: input.observedAt,
    parserVersion: input.parserVersion,
  };
}

export function parseKimiMembership(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  return tableRows(raw.body)
    .slice(1)
    .filter((cells) => cells.length >= 3 && /¥|￥/.test(cells[2] ?? ""))
    .map((cells) =>
      cnyOffer({
        providerSlug: "kimi-membership",
        planSlug: `kimi-${slugifyPlan(cells[0])}-monthly`,
        planName: cells[0],
        displayPrice: cells[2],
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "kimi-membership-v1",
      }),
    );
}

export function parseMiniMaxTokenPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  const names = rows[0]?.slice(1) ?? [];
  const prices = rows.find((cells) => cells[0] === "价格")?.slice(1) ?? [];

  return names
    .map((name, index) => ({ name, price: prices[index] }))
    .filter((item): item is { name: string; price: string } =>
      Boolean(item.name && item.price && /¥|￥/.test(item.price)),
    )
    .map(({ name, price }) =>
      cnyOffer({
        providerSlug: "minimax-token-plan",
        planSlug: `minimax-token-${slugifyPlan(name)}`,
        planName: name,
        displayPrice: price,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "minimax-token-plan-v1",
      }),
    );
}

export function parseStepPlan(raw: RawCollectionResult): NormalizedOffer[] {
  const periods = [
    { index: 3, slug: "monthly", period: "month" as const },
    { index: 4, slug: "quarterly", period: "quarter" as const },
    { index: 5, slug: "yearly", period: "year" as const },
  ];
  const offers: NormalizedOffer[] = [];

  for (const cells of tableRows(raw.body).slice(1)) {
    if (cells.length < 6) continue;
    for (const period of periods) {
      const displayPrice = cells[period.index];
      if (!/¥|￥/.test(displayPrice ?? "")) continue;
      offers.push(
        cnyOffer({
          providerSlug: "stepfun-api",
          planSlug: `step-plan-${slugifyPlan(cells[0])}-${period.slug}`,
          planName: `${cells[0]} · ${
            period.period === "month"
              ? "月付"
              : period.period === "quarter"
                ? "季付"
                : "年付"
          }`,
          displayPrice,
          billingPeriod: period.period,
          channel: "official_api",
          sourceUrl: raw.sourceUrl,
          observedAt: raw.observedAt,
          parserVersion: "step-plan-v1",
          unit: cells[2],
        }),
      );
    }
  }
  return offers;
}

export function parseDeepSeekPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  const modelSlugs = rows[0]
    ?.slice(1)
    .map((value) => value.replace(/\(\d+\)$/, "").trim());
  const modelNames = rows[3]?.slice(1);
  if (!modelSlugs?.length) return [];

  const priceRows = [
    {
      match: /缓存命中/,
      suffix: "cached-input",
      label: "缓存命中输入",
    },
    {
      match: /缓存未命中/,
      suffix: "uncached-input",
      label: "缓存未命中输入",
    },
    { match: /百万tokens输出/i, suffix: "output", label: "输出" },
  ];
  const offers: NormalizedOffer[] = [];

  for (const priceRow of priceRows) {
    const cells = rows.find((row) =>
      row.some((cell) => priceRow.match.test(cell)),
    );
    if (!cells) continue;
    const labelIndex = cells.findIndex((cell) => priceRow.match.test(cell));
    modelSlugs.forEach((modelSlug, index) => {
      const displayPrice = cells[labelIndex + index + 1];
      if (!displayPrice || !/\d/.test(displayPrice)) return;
      const modelName = modelNames?.[index] || modelSlug;
      offers.push(
        cnyOffer({
          providerSlug: "deepseek-api",
          planSlug: `${slugifyPlan(modelSlug)}-${priceRow.suffix}`,
          planName: `${modelName} · ${priceRow.label}`,
          displayPrice,
          billingPeriod: "usage",
          channel: "official_api",
          sourceUrl: raw.sourceUrl,
          observedAt: raw.observedAt,
          parserVersion: "deepseek-pricing-v1",
          unit: "/百万 tokens",
        }),
      );
    });
  }
  return offers;
}

export function parseQwenPricing(raw: RawCollectionResult): NormalizedOffer[] {
  const table = allTableRows(raw.body).find(
    (rows) =>
      rows[0]?.some((cell) => /模型 ID/.test(cell)) &&
      rows.some((cells) => cells[0] === "qwen-max"),
  );
  const row = table?.find((cells) => cells[0] === "qwen-max");
  if (!row) return [];
  const input = lastNumber(row[4] ?? "");
  const output = lastNumber(row[5] ?? "");
  if (input === null || output === null) return [];
  return usageOffers({
    providerSlug: "qwen-api",
    modelSlug: "qwen-max",
    modelName: "Qwen Max",
    prices: [
      { suffix: "input", label: "输入", value: input },
      { suffix: "output", label: "输出", value: output },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "qwen-pricing-v1",
  });
}

export function parseQwenTokenPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  const names = rows[0]?.slice(1) ?? [];
  const prices = rows.find((cells) => cells[0] === "定价")?.slice(1) ?? [];
  return names.flatMap((name, index) => {
    const value = lastNumber(prices[index] ?? "");
    if (!name || value === null) return [];
    const cleanName = name.replace(/\s*套餐\s*$/, "").trim();
    return [
      cnyOffer({
        providerSlug: "qwen-token-plan",
        planSlug: `qwen-token-${slugifyPlan(cleanName)}`,
        planName: `${cleanName} 套餐`,
        displayPrice: `¥${value}`,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "qwen-token-plan-v1",
      }),
    ];
  });
}

export function parseBaiduPricing(raw: RawCollectionResult): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  const modelIndex = rows.findIndex((cells) => cells[0] === "ERNIE 5.1");
  if (modelIndex < 0) return [];
  const inputRow = rows[modelIndex];
  const outputRow = rows[modelIndex + 1] ?? [];
  const inputPerThousand = Number(inputRow[4]);
  const outputPerThousand = Number(outputRow[1]);
  if (
    !Number.isFinite(inputPerThousand) ||
    !Number.isFinite(outputPerThousand)
  ) {
    return [];
  }
  return usageOffers({
    providerSlug: "ernie-api",
    modelSlug: "ernie-5-1-32k",
    modelName: "ERNIE 5.1（≤32K）",
    prices: [
      { suffix: "input", label: "输入", value: inputPerThousand * 1000 },
      { suffix: "output", label: "输出", value: outputPerThousand * 1000 },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "baidu-pricing-v1",
  });
}

export function parseBaiduTokenPackage(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  return tableRows(raw.body)
    .slice(1)
    .filter(
      (cells) =>
        cells.length >= 4 &&
        /个月/.test(cells[1] ?? "") &&
        /¥|￥/.test(cells[2] ?? ""),
    )
    .map((cells) =>
      cnyOffer({
        providerSlug: "baidu-token-package",
        planSlug: `baidu-token-${slugifyPlan(cells[0])}`,
        planName: `${cells[0]} 积分包`,
        displayPrice: cells[2],
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "baidu-token-package-v1",
        unit: `${cells[0]} 积分`,
      }),
    );
}

export function parseSparkTokenPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = allTableRows(raw.body).find((table) =>
    table[0]?.includes("成员类型"),
  );
  if (!rows) return [];
  return rows
    .slice(1)
    .filter((cells) => cells.length >= 3 && Number.isFinite(Number(cells[1])))
    .map((cells) =>
      cnyOffer({
        providerSlug: "spark-token-plan",
        planSlug: `spark-token-${slugifyPlan(cells[0])}`,
        planName: cells[0],
        displayPrice: `¥${Number(cells[1])}`,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "spark-token-plan-v1",
        unit: `${cells[2]} 积分/月`,
      }),
    );
}

export function parseSparkEffectivePricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const tables = allTableRows(raw.body);
  const memberRows = tables.find((table) => table[0]?.includes("成员类型"));
  const modelRows = tables.find((table) =>
    table[0]?.some((cell) => /输入.*积分.*百万/.test(cell)),
  );
  const standard = memberRows?.find((cells) => cells[0] === "标准成员");
  const spark = modelRows?.find((cells) => cells[0] === "Spark X2");
  if (!standard || !spark) return [];
  const monthlyPrice = Number(standard[1]);
  const monthlyPoints = Number(standard[2]);
  const inputPoints = Number(spark[3]);
  const cachePoints = Number(spark[4]);
  const outputPoints = Number(spark[5]);
  if (
    [monthlyPrice, monthlyPoints, inputPoints, cachePoints, outputPoints].some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  ) {
    return [];
  }
  const yuanPerPoint = monthlyPrice / monthlyPoints;
  return usageOffers({
    providerSlug: "spark-api",
    modelSlug: "spark-x2-standard-plan",
    modelName: "Spark X2（标准成员折算）",
    prices: [
      { suffix: "input", label: "输入", value: inputPoints * yuanPerPoint },
      { suffix: "cache", label: "缓存命中", value: cachePoints * yuanPerPoint },
      { suffix: "output", label: "输出", value: outputPoints * yuanPerPoint },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "spark-effective-pricing-v1",
    unit: "/百万 tokens（Token Plan 折算）",
  });
}

export function parseHunyuanPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const row = tableRows(raw.body).find((cells) => cells[0] === "Hy3");
  if (!row) return [];
  const input = Number(row[2]);
  const output = Number(row[3]);
  const cache = Number(row[4]);
  if ([input, output, cache].some((value) => !Number.isFinite(value))) {
    return [];
  }
  return usageOffers({
    providerSlug: "hunyuan-api",
    modelSlug: "hunyuan-hy3",
    modelName: "Hy3",
    prices: [
      { suffix: "input", label: "输入", value: input },
      { suffix: "cache", label: "缓存命中", value: cache },
      { suffix: "output", label: "输出", value: output },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "hunyuan-pricing-v1",
  });
}

export function parseMiniMaxPaygo(raw: RawCollectionResult): NormalizedOffer[] {
  const table = allTableRows(raw.body).find((rows) =>
    rows.some((cells) => cells[0] === "MiniMax-M2.7"),
  );
  const row = table?.find((cells) => cells[0] === "MiniMax-M2.7");
  if (!row) return [];
  const values = row.slice(1, 5).map(Number);
  if (values.some((value) => !Number.isFinite(value))) return [];
  return usageOffers({
    providerSlug: "minimax-api",
    modelSlug: "minimax-m2-7",
    modelName: "MiniMax M2.7",
    prices: [
      { suffix: "input", label: "输入", value: values[0] },
      { suffix: "output", label: "输出", value: values[1] },
      { suffix: "cache-read", label: "缓存读取", value: values[2] },
      { suffix: "cache-write", label: "缓存写入", value: values[3] },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "minimax-paygo-v1",
  });
}

export function parseKimiK3Pricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const match = raw.body.match(
    /\["kimi-k3",\s*"1M tokens",\s*"¥([\d.]+)",\s*"¥([\d.]+)",\s*"¥([\d.]+)"/,
  );
  if (!match) return [];
  return usageOffers({
    providerSlug: "kimi-api",
    modelSlug: "kimi-k3",
    modelName: "Kimi K3",
    prices: [
      {
        suffix: "cached-input",
        label: "缓存命中输入",
        value: Number(match[1]),
      },
      {
        suffix: "uncached-input",
        label: "缓存未命中输入",
        value: Number(match[2]),
      },
      { suffix: "output", label: "输出", value: Number(match[3]) },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "kimi-k3-pricing-v1",
  });
}

export function parseGlmPricing(raw: RawCollectionResult): NormalizedOffer[] {
  const match = raw.body.match(
    /name:"GLM-5\.2"[^}]*inPrice:\["([\d.]+)元"\][^}]*outPrice:\["([\d.]+)元"\][^}]*hit:\["([\d.]+)元"\]/,
  );
  if (!match) return [];
  return usageOffers({
    providerSlug: "glm-api",
    modelSlug: "glm-5-2",
    modelName: "GLM-5.2",
    prices: [
      { suffix: "input", label: "输入", value: Number(match[1]) },
      { suffix: "cache", label: "缓存命中", value: Number(match[3]) },
      { suffix: "output", label: "输出", value: Number(match[2]) },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "glm-pricing-v1",
  });
}

export function parseGlmResourcePackages(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const pattern =
    /productName:"(GLM-5\.2(?:尊享包)?)"[^}]*productSize:"([^"]+)"[^}]*productDateRange:"([^"]+)"[^}]*salePrice:"?([\d.]+)"?/g;
  return [...raw.body.matchAll(pattern)].map((match) =>
    cnyOffer({
      providerSlug: "glm-resource-package",
      planSlug: `glm-resource-${slugifyPlan(match[1])}-${slugifyPlan(match[2])}`,
      planName: `${match[1]} · ${match[2]}`,
      displayPrice: `¥${Number(match[4])}`,
      billingPeriod: "quarter",
      channel: "official_web",
      sourceUrl: raw.sourceUrl,
      observedAt: raw.observedAt,
      parserVersion: "glm-resource-package-v1",
      unit: match[3],
    }),
  );
}

export function parseDoubaoPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const $ = load(raw.body);
  const card = $(".rank-item")
    .filter((_, element) => $(element).find("h4").text().includes("豆包大模型"))
    .first();
  if (!card.length) return [];
  const priceByLabel = new Map<string, number>();
  card.find(".rank-item__price-row").each((_, row) => {
    const label = $(row).find(".rank-item__price-label").text().trim();
    const value = Number($(row).find(".rank-item__price-value").text().trim());
    if (label && Number.isFinite(value)) priceByLabel.set(label, value);
  });
  const input = priceByLabel.get("推理输入");
  const output = priceByLabel.get("推理输出");
  if (input === undefined || output === undefined) return [];
  return usageOffers({
    providerSlug: "doubao-api",
    modelSlug: "doubao-evolving",
    modelName: "豆包大模型 Evolving",
    prices: [
      { suffix: "input", label: "输入", value: input },
      { suffix: "output", label: "输出", value: output },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "doubao-pricing-v1",
  });
}

export function parseStepFunMembership(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const text = load(raw.body).text().replace(/\s+/g, "");
  const plans: Array<{
    key: string;
    name: string;
    period: "week" | "month";
    unit: string;
  }> = [
    { key: "尝鲜", name: "尝鲜周卡", period: "week", unit: "250 积分" },
    { key: "入门", name: "入门月卡", period: "month", unit: "1300 积分" },
    { key: "高级", name: "高级月卡", period: "month", unit: "4500 积分" },
    { key: "进阶", name: "进阶月卡", period: "month", unit: "10000 积分" },
    { key: "专业", name: "专业月卡", period: "month", unit: "27000 积分" },
  ];

  return plans.flatMap((plan) => {
    const periodPattern =
      plan.period === "week" ? "(?:Everyweek|一周)" : "(?:Everymonth|每月)";
    const match = text.match(
      new RegExp(`${plan.key}¥([\\d.]+)${periodPattern}`, "i"),
    );
    if (!match) return [];
    return [
      cnyOffer({
        providerSlug: "stepfun-subscription",
        planSlug: `stepfun-${slugifyPlan(plan.name)}`,
        planName: plan.name,
        displayPrice: `¥${match[1]}`,
        billingPeriod: plan.period,
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "stepfun-membership-v2",
        unit: plan.unit,
      }),
    ];
  });
}

export function parseComatePricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  const names = rows[0]?.slice(1) ?? [];
  const prices = rows.find((cells) => cells[0] === "单价")?.slice(1) ?? [];
  const periodByLabel = {
    月: "month",
    季: "quarter",
    年: "year",
  } as const;

  return names.flatMap((name, index) => {
    const price = prices[index] ?? "";
    if (/免费/.test(price)) {
      return [
        cnyOffer({
          providerSlug: "comate-subscription",
          planSlug: `comate-${slugifyPlan(name)}-monthly`,
          planName: name,
          displayPrice: "¥0",
          billingPeriod: "month",
          channel: "official_web",
          sourceUrl: raw.sourceUrl,
          observedAt: raw.observedAt,
          parserVersion: "comate-pricing-v1",
        }),
      ];
    }
    return [...price.matchAll(/[¥￥]\s*([\d.]+)\/(月|季|年)/g)].map((match) => {
      const periodLabel = match[2] as keyof typeof periodByLabel;
      return cnyOffer({
        providerSlug: "comate-subscription",
        planSlug: `comate-${slugifyPlan(name)}-${periodByLabel[periodLabel]}`,
        planName: `${name} · ${match[2]}付`,
        displayPrice: `¥${match[1]}`,
        billingPeriod: periodByLabel[periodLabel],
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "comate-pricing-v1",
      });
    });
  });
}

export function parseQoderPricing(raw: RawCollectionResult): NormalizedOffer[] {
  const table = allTableRows(raw.body).find(
    (rows) =>
      rows[0]?.includes("个人专业版（Pro）") &&
      rows[0]?.includes("个人高级版（Pro+）"),
  );
  if (!table) return [];
  const names = table[0].slice(1, 4);
  const prices = table.find((cells) => cells[0] === "单价")?.slice(1, 4) ?? [];

  return names.flatMap((name, index) => {
    const price = prices[index] ?? "";
    const value = /免费/.test(price)
      ? 0
      : Number(price.match(/([\d.]+)\s*元/)?.[1]);
    if (!Number.isFinite(value)) return [];
    return [
      cnyOffer({
        providerSlug: "qoder-subscription",
        planSlug: `qoder-${slugifyPlan(name)}-monthly`,
        planName: name,
        displayPrice: `¥${value}`,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "qoder-pricing-v1",
      }),
    ];
  });
}

export function parseTraePricing(raw: RawCollectionResult): NormalizedOffer[] {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.body);
  } catch {
    return [];
  }
  if (!Array.isArray(payload)) return [];

  const plans = [
    { id: "free", name: "免费", slug: "trae-免费-monthly" },
    {
      id: "pro",
      name: "速通 Pro",
      slug: "trae-速通-pro-monthly",
    },
    {
      id: "pro-plus",
      name: "速通 Pro+",
      slug: "trae-速通-pro-monthly-plus",
    },
    {
      id: "ultra",
      name: "速通 Ultra",
      slug: "trae-速通-ultra-monthly",
    },
    {
      id: "express",
      name: "优速通 Express",
      slug: "trae-优速通-express-monthly",
    },
  ];

  return plans.flatMap((plan) => {
    const item = payload.find(
      (candidate): candidate is Record<string, unknown> =>
        typeof candidate === "object" &&
        candidate !== null &&
        candidate.id === plan.id,
    );
    const price = typeof item?.price === "string" ? item.price : "";
    const value = Number(price.match(/^¥\s*([\d.]+)$/)?.[1]);
    if (!Number.isFinite(value) || value < 0) return [];
    return [
      cnyOffer({
        providerSlug: "trae-subscription",
        planSlug: plan.slug,
        planName: plan.name,
        displayPrice: `¥${value}`,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "trae-pricing-v3",
      }),
    ];
  });
}

export function parseSenseNovaTokenPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const text = load(raw.body).text().replace(/\s+/g, "");
  if (!/Free·公测.*?¥0\/月/.test(text)) return [];
  return [
    cnyOffer({
      providerSlug: "sensenova-token-plan",
      planSlug: "sensenova-free-beta",
      planName: "Free · 公测",
      displayPrice: "¥0",
      billingPeriod: "month",
      channel: "official_web",
      sourceUrl: raw.sourceUrl,
      observedAt: raw.observedAt,
      parserVersion: "sensenova-token-plan-v1",
      unit: "每模型 1,500 次调用 / 5 小时",
    }),
  ];
}

export function parseMimoTokenPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  return allTableRows(raw.body)
    .slice(0, 2)
    .flatMap((rows, tableIndex) => {
      const names = rows[0]?.slice(1) ?? [];
      const prices = rows.find((cells) => cells[0] === "定价")?.slice(1) ?? [];
      const credits = rows[2]?.slice(1) ?? [];
      const billingPeriod = tableIndex === 0 ? "month" : "year";
      return names.flatMap((name, index) => {
        const price = prices[index]?.match(/¥\s*([\d.]+)\/(?:月|年)/)?.[1];
        if (!price) return [];
        return [
          cnyOffer({
            providerSlug: "mimo-token-plan",
            planSlug: `mimo-token-${slugifyPlan(name)}-${billingPeriod}`,
            planName: `${name} · ${billingPeriod === "month" ? "月付" : "年付"}`,
            displayPrice: `¥${price}`,
            billingPeriod,
            channel: "official_web",
            sourceUrl: raw.sourceUrl,
            observedAt: raw.observedAt,
            parserVersion: "mimo-token-plan-v1",
            unit: credits[index],
          }),
        ];
      });
    });
}

export function parseHuaweiTokenPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  return tableRows(raw.body)
    .slice(1)
    .flatMap((cells) => {
      const name = cells.length >= 5 ? cells[1] : cells[0];
      const price = cells.at(-1)?.match(/¥\s*([\d.]+)\/月/)?.[1];
      const unit = cells.length >= 5 ? cells[3] : cells[2];
      if (!name || !price) return [];
      return [
        cnyOffer({
          providerSlug: "huawei-token-plan",
          planSlug: `huawei-token-${slugifyPlan(name)}`,
          planName: name,
          displayPrice: `¥${price}`,
          billingPeriod: "month",
          channel: "official_web",
          sourceUrl: raw.sourceUrl,
          observedAt: raw.observedAt,
          parserVersion: "huawei-token-plan-v1",
          unit,
        }),
      ];
    });
}

export function parseGlmCodingPlan(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const periodNames = {
    month: "月付",
    quarter: "季付",
    year: "年付",
  } as const;
  const compactOffers = new Map<string, NormalizedOffer>();
  for (const product of raw.body.matchAll(
    /\{type:"(lite|pro|max)",unitKey:"(month|quarter|year)",productId:"[^"]+"[^}]{0,600}\}/gi,
  )) {
    const plan = `${product[1][0].toUpperCase()}${product[1].slice(1).toLowerCase()}`;
    const unit = product[2] as keyof typeof periodNames;
    const salePrice = Number(product[0].match(/salePrice:([\d.]+)/)?.[1]);
    const renewalTotal = Number(product[0].match(/renewAmount:([\d.]+)/)?.[1]);
    const price =
      unit === "month" || !Number.isFinite(renewalTotal)
        ? salePrice
        : renewalTotal;
    if (!Number.isFinite(price)) continue;

    compactOffers.set(
      `${plan}-${unit}`,
      cnyOffer({
        providerSlug: "glm-coding-plan",
        planSlug: `glm-coding-${plan.toLowerCase()}-${unit}`,
        planName: `${plan} · ${periodNames[unit]}`,
        displayPrice: `¥${price}`,
        billingPeriod: unit,
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "glm-coding-plan-v5",
      }),
    );
  }
  if (compactOffers.size > 0) return [...compactOffers.values()];

  const dynamicOffers = [
    ...raw.body.matchAll(
      /\{productId:"[^"]+",productName:"(Lite|Pro|Max)"[^}]{0,1000}\}/g,
    ),
  ].flatMap((product) => {
    if (!product[0].includes('version:"v2"')) return [];
    const salePrice = product[0].match(/salePrice:([\d.]+)/)?.[1];
    const unit = product[0].match(/unit:"(month|quarter|year)"/)?.[1] as
      keyof typeof periodNames | undefined;
    if (!salePrice || !unit) return [];
    return [
      cnyOffer({
        providerSlug: "glm-coding-plan",
        planSlug: `glm-coding-${product[1].toLowerCase()}-${unit}`,
        planName: `${product[1]} · ${periodNames[unit]}`,
        displayPrice: `¥${salePrice}`,
        billingPeriod: unit,
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "glm-coding-plan-v5",
      }),
    ];
  });
  if (dynamicOffers.length > 0) return dynamicOffers;

  return [
    ...raw.body.matchAll(
      /(?:^|\n)(Lite|Pro|Max)\s*\n([\s\S]*?)(?=\n(?:Lite|Pro|Max)\s*\n|$)/g,
    ),
  ].flatMap((product) => {
    const monthlyPrices = [...product[2].matchAll(/[¥￥]\s*([\d.]+)\/月/g)].map(
      (match) => Number(match[1]),
    );
    const quarterTotal = Number(
      product[2].match(/下个季度续费金额[：:]\s*[¥￥]\s*([\d.]+)/)?.[1],
    );
    const standardMonth = monthlyPrices[1] ?? monthlyPrices[0];
    if (!Number.isFinite(standardMonth) || !Number.isFinite(quarterTotal)) {
      return [];
    }

    const planName = product[1];
    return [
      cnyOffer({
        providerSlug: "glm-coding-plan",
        planSlug: `glm-coding-${planName.toLowerCase()}-month`,
        planName: `${planName} · ${periodNames.month}`,
        displayPrice: `¥${standardMonth}`,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "glm-coding-plan-v5",
      }),
      cnyOffer({
        providerSlug: "glm-coding-plan",
        planSlug: `glm-coding-${planName.toLowerCase()}-quarter`,
        planName: `${planName} · ${periodNames.quarter}`,
        displayPrice: `¥${quarterTotal}`,
        billingPeriod: "quarter",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "glm-coding-plan-v5",
      }),
    ];
  });
}

export function parseCodeBuddyPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const plans = [
    { id: "free", title: "体验版", price: 0 },
    { id: "youth", title: "青春版", priceKey: "monthly" },
    { id: "standard", title: "标准版", priceKey: "monthly-auto" },
    { id: "advanced", title: "高级版", priceKey: "monthly-auto" },
    { id: "flagship", title: "旗舰版", priceKey: "monthly-auto" },
  ];

  return plans.flatMap((plan) => {
    const start = raw.body.indexOf(`id:"${plan.id}"`);
    if (start < 0) return [];
    const segment = raw.body.slice(start, start + 1_700);
    const price =
      plan.price ??
      Number(
        segment.match(
          new RegExp(`"?${plan.priceKey}"?:\\{price:"[¥￥]\\s*([\\d.]+)"`),
        )?.[1],
      );
    if (!Number.isFinite(price)) return [];
    return [
      cnyOffer({
        providerSlug: "codebuddy-subscription",
        planSlug: `codebuddy-${plan.id}-monthly`,
        planName:
          plan.priceKey === "monthly-auto"
            ? `${plan.title} · 连续包月`
            : plan.title,
        displayPrice: `¥${price}`,
        billingPeriod: "month",
        channel: "official_web",
        sourceUrl: raw.sourceUrl,
        observedAt: raw.observedAt,
        parserVersion: "codebuddy-pricing-v2",
      }),
    ];
  });
}

export function parseMimoApiPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  return rows.slice(1).flatMap((cells) => {
    if (cells.length < 4 || !cells[0].startsWith("mimo-v2.5")) return [];
    const values = cells.slice(1, 4).map((cell) => lastNumber(cell));
    if (values.some((value) => value === null)) return [];
    return usageOffers({
      providerSlug: "mimo-api",
      modelSlug: slugifyPlan(cells[0]),
      modelName: cells[0],
      prices: [
        { suffix: "cache", label: "缓存命中输入", value: values[0]! },
        { suffix: "input", label: "缓存未命中输入", value: values[1]! },
        { suffix: "output", label: "输出", value: values[2]! },
      ],
      sourceUrl: raw.sourceUrl,
      observedAt: raw.observedAt,
      parserVersion: "mimo-api-pricing-v1",
    });
  });
}

export function parseBaichuanPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const row = tableRows(raw.body).find((cells) =>
    cells[0]?.includes("Baichuan-M3-Plus"),
  );
  const priceText = row?.[3] ?? "";
  const input = Number(priceText.match(/输入：([\d.]+)元\/千tokens/i)?.[1]);
  const output = Number(priceText.match(/输出：([\d.]+)元\/千tokens/i)?.[1]);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return [];
  return usageOffers({
    providerSlug: "baichuan-api",
    modelSlug: "baichuan-m3-plus",
    modelName: "Baichuan-M3-Plus",
    prices: [
      { suffix: "input", label: "输入", value: input * 1_000 },
      { suffix: "output", label: "输出", value: output * 1_000 },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "baichuan-pricing-v1",
  });
}

export function parseLongCatPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const prices = tableRows(raw.body)
    .slice(1)
    .map((cells) => ({
      label: cells[0],
      value: lastNumber(cells[2] ?? ""),
    }));
  if (prices.length !== 3 || prices.some((price) => price.value === null)) {
    return [];
  }
  return usageOffers({
    providerSlug: "longcat-api",
    modelSlug: "longcat-2-0-discount",
    modelName: "LongCat-2.0 · 限时折扣",
    prices: prices.map((price) => ({
      suffix: slugifyPlan(price.label),
      label: price.label,
      value: price.value!,
    })),
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "longcat-pricing-v1",
  });
}

export function parseSiliconFlowPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const text = load(raw.body).text().replace(/\s+/g, "");
  const match = text.match(
    /DeepSeek-V4-Flashdeepseek-ai\/DeepSeek-V4-Flash¥([\d.]+)¥([\d.]+)¥([\d.]+)/,
  );
  if (!match) return [];
  return usageOffers({
    providerSlug: "siliconflow-api",
    modelSlug: "deepseek-v4-flash",
    modelName: "DeepSeek-V4-Flash",
    prices: [
      { suffix: "input", label: "输入", value: Number(match[1]) },
      { suffix: "output", label: "输出", value: Number(match[2]) },
      { suffix: "cache", label: "缓存命中", value: Number(match[3]) },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "siliconflow-pricing-v1",
  });
}

export function parseHuaweiMaaSPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const rows = tableRows(raw.body);
  const index = rows.findIndex((cells) => cells[0] === "DeepSeek-V4-Pro");
  if (index < 0) return [];
  const input = Number(rows[index]?.[2]);
  const output = Number(rows[index + 1]?.[1]);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return [];
  return usageOffers({
    providerSlug: "huawei-maas-api",
    modelSlug: "deepseek-v4-pro",
    modelName: "DeepSeek-V4-Pro",
    prices: [
      { suffix: "input", label: "输入", value: input * 1_000 },
      { suffix: "output", label: "输出", value: output * 1_000 },
    ],
    sourceUrl: raw.sourceUrl,
    observedAt: raw.observedAt,
    parserVersion: "huawei-maas-pricing-v1",
  });
}

export function parseTeleAiPricing(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const body = raw.body.replace(/\\"/g, '"');
  const entries = [
    ...body.matchAll(
      /"discountedPrice":"([\d.]+)","discountedUnit":"元\/([^"]+QPS)"/g,
    ),
  ];
  return entries.slice(0, 2).map((match, index) =>
    cnyOffer({
      providerSlug: "teleai-api",
      planSlug: index === 0 ? "telemm-trial-qps" : "telemm-monthly-qps",
      planName: index === 0 ? "TeleMM · 新客体验" : "TeleMM · 月度 QPS",
      displayPrice: `¥${match[1]}`,
      billingPeriod: "usage",
      channel: "official_api",
      sourceUrl: raw.sourceUrl,
      observedAt: raw.observedAt,
      parserVersion: "teleai-pricing-v1",
      unit: `/${match[2]}`,
    }),
  );
}

export function officialPageHealthCheck(
  offers: NormalizedOffer[],
  minimumOffers = 1,
): SourceHealth {
  if (offers.length === 0) {
    return {
      ok: false,
      code: "EMPTY_RESULT",
      message: "Official price table produced no offers.",
    };
  }
  if (
    offers.some(
      (offer) =>
        !offer.rawPlanName ||
        !offer.currency ||
        offer.amountMinor === null ||
        !Number.isFinite(offer.amountMinor) ||
        offer.amountMinor < 0,
    )
  ) {
    return {
      ok: false,
      code: "MISSING_PRICE",
      message: "Official price table contains an invalid offer.",
    };
  }
  if (offers.length < minimumOffers) {
    return {
      ok: false,
      code: "MISSING_PRICE",
      message: `Official price table produced ${offers.length} offers; expected at least ${minimumOffers}.`,
    };
  }
  return {
    ok: true,
    code: "OK",
    message: `${offers.length} official offers parsed.`,
  };
}

const minimumOffersByAdapterId: Record<string, number> = {
  "stepfun-membership-official": 5,
  "comate-pricing-official": 7,
  "qoder-pricing-official": 3,
  "trae-pricing-official": 5,
  "mimo-token-plan-official": 8,
  "huawei-token-plan-official": 4,
  "sensenova-token-plan-official": 1,
  "mimo-api-pricing-official": 6,
  "baichuan-pricing-official": 2,
  "longcat-pricing-official": 3,
  "siliconflow-pricing-official": 3,
  "huawei-maas-pricing-official": 2,
  "teleai-pricing-official": 2,
};

export class OfficialPageAdapter implements PriceSourceAdapter {
  constructor(
    readonly id: string,
    readonly providerSlug: string,
    readonly sourceUrl: string,
    readonly parserVersion: string,
    private readonly parser: Parser,
    private readonly collectUrl = sourceUrl,
  ) {}

  async collect(context: CollectionContext): Promise<RawCollectionResult> {
    const isLargeSharedAsset = this.collectUrl.includes(
      "static.bigmodel.cn/wd-paas-front/js/",
    );
    const key = `${this.collectUrl}:${context.observedAt.toISOString()}`;
    let request: Promise<RawCollectionResult>;
    if (isLargeSharedAsset && sharedLargeOfficialFetch?.key === key) {
      request = sharedLargeOfficialFetch.promise;
    } else {
      request = fetchPage(this.collectUrl, {
        observedAt: context.observedAt,
        signal: context.signal,
        timeoutMs: isLargeSharedAsset ? 45_000 : undefined,
        attempts: isLargeSharedAsset ? 4 : undefined,
      });
      if (isLargeSharedAsset) {
        sharedLargeOfficialFetch = { key, promise: request };
      }
    }
    const raw = await request;
    return { ...raw, sourceUrl: this.sourceUrl };
  }

  async parse(raw: RawCollectionResult): Promise<NormalizedOffer[]> {
    return this.parser(raw);
  }

  healthCheck(offers: NormalizedOffer[]): SourceHealth {
    return officialPageHealthCheck(
      offers,
      minimumOffersByAdapterId[this.id] ?? 1,
    );
  }
}

class GlmCodingPlanAdapter implements PriceSourceAdapter {
  readonly id = "glm-coding-plan-official";
  readonly providerSlug = "glm-coding-plan";
  readonly sourceUrl = "https://www.bigmodel.cn/claude-code";
  readonly parserVersion = "glm-coding-plan-v5";

  async collect(context: CollectionContext): Promise<RawCollectionResult> {
    try {
      const page = await fetchPage(this.sourceUrl, {
        observedAt: context.observedAt,
        signal: context.signal,
        timeoutMs: 12_000,
        attempts: 1,
      });
      const $ = load(page.body);
      const runtimePath = $("script[src]")
        .map((_, element) => $(element).attr("src"))
        .get()
        .find((src) => /\/runtime\.[a-f0-9]+\.js$/i.test(src));
      if (!runtimePath) {
        throw new Error("GLM Coding Plan runtime asset was not found.");
      }
      const runtimeUrl = new URL(
        runtimePath.startsWith("//") ? `https:${runtimePath}` : runtimePath,
        this.sourceUrl,
      ).toString();
      const runtime = await fetchPage(runtimeUrl, {
        observedAt: context.observedAt,
        signal: context.signal,
      });
      const hash = runtime.body.match(
        /"ClaudeCode~subscribe-overview":"([a-f0-9]+)"/,
      )?.[1];
      if (!hash) {
        throw new Error("GLM Coding Plan price chunk hash was not found.");
      }
      const chunkUrl = new URL(
        `ClaudeCode~subscribe-overview.${hash}.js`,
        runtimeUrl,
      ).toString();
      const raw = await fetchPage(chunkUrl, {
        observedAt: context.observedAt,
        signal: context.signal,
        timeoutMs: 35_000,
      });
      return { ...raw, sourceUrl: this.sourceUrl };
    } catch (primaryError) {
      const renderedFallbackUrl =
        "https://r.jina.ai/https://bigmodel.cn/claude-code";
      try {
        const rendered = await fetchPage(renderedFallbackUrl, {
          observedAt: context.observedAt,
          signal: context.signal,
          timeoutMs: 30_000,
          attempts: 2,
        });
        return { ...rendered, sourceUrl: this.sourceUrl };
      } catch (fallbackError) {
        throw new CollectionError(
          "FETCH_FAILED",
          "GLM Coding Plan official page and rendered fallback both failed.",
          {
            primaryUrl: this.sourceUrl,
            fallbackUrl: renderedFallbackUrl,
            primaryError: errorDiagnosticDetails(primaryError),
            fallbackError: errorDiagnosticDetails(fallbackError),
          },
        );
      }
    }
  }

  async parse(raw: RawCollectionResult): Promise<NormalizedOffer[]> {
    return parseGlmCodingPlan(raw);
  }

  healthCheck(offers: NormalizedOffer[]): SourceHealth {
    return officialPageHealthCheck(offers, 6);
  }
}

class CodeBuddyPricingAdapter implements PriceSourceAdapter {
  readonly id = "codebuddy-pricing-official";
  readonly providerSlug = "codebuddy-subscription";
  readonly sourceUrl = "https://www.codebuddy.cn/pricing/";
  readonly parserVersion = "codebuddy-pricing-v2";

  async collect(context: CollectionContext): Promise<RawCollectionResult> {
    const page = await fetchPage(this.sourceUrl, {
      observedAt: context.observedAt,
      signal: context.signal,
    });
    const $ = load(page.body);
    const pricingPath = $("script[src]")
      .map((_, element) => $(element).attr("src"))
      .get()
      .find((src) => /\/assets\/pricing-[\w-]+\.js$/i.test(src));
    if (!pricingPath) {
      throw new Error("CodeBuddy pricing asset was not found.");
    }
    const pricingUrl = new URL(
      pricingPath.startsWith("//") ? `https:${pricingPath}` : pricingPath,
      this.sourceUrl,
    ).toString();
    const pricing = await fetchPage(pricingUrl, {
      observedAt: context.observedAt,
      signal: context.signal,
    });
    const candidates = [
      ...new Set(
        [...pricing.body.matchAll(/assets\/(index-[\w-]+\.js)/g)].map(
          (match) => match[1],
        ),
      ),
    ];
    const results = await Promise.allSettled(
      candidates.map((candidate) =>
        fetchPage(new URL(candidate, pricingUrl).toString(), {
          observedAt: context.observedAt,
          signal: context.signal,
        }),
      ),
    );
    const asset = results
      .filter(
        (result): result is PromiseFulfilledResult<RawCollectionResult> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .find(
        (result) =>
          result.body.includes("每月基础2000积分") &&
          result.body.includes('id:"flagship"'),
      );
    if (!asset) {
      throw new Error("CodeBuddy plan data asset was not found.");
    }
    return { ...asset, sourceUrl: this.sourceUrl };
  }

  async parse(raw: RawCollectionResult): Promise<NormalizedOffer[]> {
    return parseCodeBuddyPricing(raw);
  }

  healthCheck(offers: NormalizedOffer[]): SourceHealth {
    return officialPageHealthCheck(offers, 5);
  }
}

export const officialPageAdapters: PriceSourceAdapter[] = [
  new OfficialPageAdapter(
    "kimi-membership-official",
    "kimi-membership",
    "https://www.kimi.com/zh-cn/help/membership/membership-pricing",
    "kimi-membership-v1",
    parseKimiMembership,
  ),
  new OfficialPageAdapter(
    "stepfun-membership-official",
    "stepfun-subscription",
    "https://chat.stepfun.com/subscription",
    "stepfun-membership-v2",
    parseStepFunMembership,
  ),
  new OfficialPageAdapter(
    "minimax-token-plan-official",
    "minimax-token-plan",
    "https://platform.minimaxi.com/docs/guides/pricing-token-plan",
    "minimax-token-plan-v1",
    parseMiniMaxTokenPlan,
  ),
  new OfficialPageAdapter(
    "step-plan-official",
    "stepfun-api",
    "https://platform.stepfun.com/docs/zh/step-plan/overview",
    "stepfun-api-v4",
    parseStepFunApi,
  ),
  new OfficialPageAdapter(
    "deepseek-pricing-official",
    "deepseek-api",
    "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
    "deepseek-api-v5",
    parseDeepSeekApi,
  ),
  new OfficialPageAdapter(
    "qwen-pricing-official",
    "qwen-api",
    "https://help.aliyun.com/zh/model-studio/model-pricing",
    "qwen-api-v5",
    parseQwenApi,
  ),
  new OfficialPageAdapter(
    "qwen-token-plan-official",
    "qwen-token-plan",
    "https://help.aliyun.com/zh/model-studio/token-plan-personal-overview",
    "qwen-token-plan-v1",
    parseQwenTokenPlan,
  ),
  new OfficialPageAdapter(
    "baidu-pricing-official",
    "ernie-api",
    "https://cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a",
    "baidu-api-v4",
    parseBaiduApi,
  ),
  new OfficialPageAdapter(
    "baidu-token-package-official",
    "baidu-token-package",
    "https://cloud.baidu.com/doc/qianfan/s/Smoghsq3g",
    "baidu-token-package-v1",
    parseBaiduTokenPackage,
  ),
  new OfficialPageAdapter(
    "spark-token-plan-official",
    "spark-token-plan",
    "https://www.xfyun.cn/doc/spark/TokenPlan.html",
    "spark-token-plan-v1",
    parseSparkTokenPlan,
  ),
  new OfficialPageAdapter(
    "spark-effective-pricing-official",
    "spark-api",
    "https://www.xfyun.cn/doc/spark/TokenPlan.html",
    "spark-api-v4",
    parseSparkApi,
  ),
  new OfficialPageAdapter(
    "hunyuan-pricing-official",
    "hunyuan-api",
    "https://cloud.tencent.com/document/product/1823/130055",
    "hunyuan-api-v4",
    parseHunyuanApi,
  ),
  new OfficialPageAdapter(
    "minimax-paygo-official",
    "minimax-api",
    "https://platform.minimaxi.com/docs/guides/pricing-paygo",
    "minimax-api-v5",
    parseMiniMaxApi,
  ),
  new OfficialPageAdapter(
    "kimi-k3-pricing-official",
    "kimi-api",
    "https://platform.kimi.com/docs/pricing/chat-k3",
    "kimi-api-v4",
    parseKimiApi,
    "https://platform.kimi.com/docs/pricing/chat-k3.md",
  ),
  new OfficialPageAdapter(
    "glm-pricing-official",
    "glm-api",
    "https://bigmodel.cn/pricing",
    "glm-api-v4",
    parseGlmApi,
    "https://static.bigmodel.cn/wd-paas-front/js/app.10cd8030.js",
  ),
  new OfficialPageAdapter(
    "glm-resource-package-official",
    "glm-resource-package",
    "https://bigmodel.cn/activity",
    "glm-resource-package-v1",
    parseGlmResourcePackages,
    "https://static.bigmodel.cn/wd-paas-front/js/app.10cd8030.js",
  ),
  new GlmCodingPlanAdapter(),
  new OfficialPageAdapter(
    "comate-pricing-official",
    "comate-subscription",
    "https://cloud.baidu.com/doc/COMATE/s/rlnvnio4a",
    "comate-pricing-v1",
    parseComatePricing,
  ),
  new OfficialPageAdapter(
    "qoder-pricing-official",
    "qoder-subscription",
    "https://help.aliyun.com/zh/lingma/billing-description",
    "qoder-pricing-v1",
    parseQoderPricing,
  ),
  new OfficialPageAdapter(
    "trae-pricing-official",
    "trae-subscription",
    "https://www.trae.cn/pricing",
    "trae-pricing-v3",
    parseTraePricing,
    "https://www.trae.cn/api/tcc/commerce?key=tocPlansConfig",
  ),
  new CodeBuddyPricingAdapter(),
  new OfficialPageAdapter(
    "mimo-token-plan-official",
    "mimo-token-plan",
    "https://mimo.mi.com/docs/zh-CN/price/token-plan",
    "mimo-token-plan-v1",
    parseMimoTokenPlan,
  ),
  new OfficialPageAdapter(
    "huawei-token-plan-official",
    "huawei-token-plan",
    "https://support.huaweicloud.com/price-maas/price-maas-0035.html",
    "huawei-token-plan-v1",
    parseHuaweiTokenPlan,
  ),
  new OfficialPageAdapter(
    "sensenova-token-plan-official",
    "sensenova-token-plan",
    "https://www.sensenova.cn/token-plan",
    "sensenova-token-plan-v1",
    parseSenseNovaTokenPlan,
  ),
  new OfficialPageAdapter(
    "doubao-pricing-official",
    "doubao-api",
    "https://www.volcengine.com/product/ark",
    "doubao-api-v4",
    parseDoubaoApi,
    "https://www.volcengine.com/",
  ),
  new OfficialPageAdapter(
    "mimo-api-pricing-official",
    "mimo-api",
    "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go",
    "mimo-api-v4",
    parseMimoApi,
  ),
  new OfficialPageAdapter(
    "baichuan-pricing-official",
    "baichuan-api",
    "https://platform.baichuan-ai.com/prices",
    "baichuan-api-v4",
    parseBaichuanApi,
  ),
  new OfficialPageAdapter(
    "longcat-pricing-official",
    "longcat-api",
    "https://longcat.chat/platform/docs/zh/pricing/long-cat-2.0",
    "longcat-api-v5",
    parseLongCatApi,
  ),
  new OfficialPageAdapter(
    "siliconflow-pricing-official",
    "siliconflow-api",
    "https://siliconflow.cn/pricing",
    "siliconflow-api-v5",
    parseSiliconFlowApi,
  ),
  new OfficialPageAdapter(
    "huawei-maas-pricing-official",
    "huawei-maas-api",
    "https://support.huaweicloud.com/price-maas/price-maas-0002.html",
    "huawei-maas-api-v4",
    parseHuaweiMaaSApi,
  ),
  new OfficialPageAdapter(
    "teleai-pricing-official",
    "teleai-api",
    "https://www.teleai.com.cn/product/Multimodal",
    "teleai-api-v4",
    parseTeleAiApi,
  ),
];
