import { load } from "cheerio";
import { slugifyPlan } from "@/lib/collectors/price-parser";
import type {
  ApiPriceType,
  NormalizedOffer,
  RawCollectionResult,
} from "@/lib/collectors/types";

export type PriceColumn = {
  index: number;
  label: string;
  type: ApiPriceType;
};

export type OfficialTable = {
  context: string;
  rows: string[][];
};

type PendingCell = {
  value: string;
  remaining: number;
};

export function officialTables(html: string): OfficialTable[] {
  const $ = load(html);
  return $("table")
    .map((_, table) => {
      const pending = new Map<number, PendingCell>();
      const rows: string[][] = [];

      $(table)
        .find("tr")
        .each((__, row) => {
          const values: string[] = [];
          let column = 0;
          const fillPending = () => {
            while (pending.has(column)) {
              const item = pending.get(column)!;
              values[column] = item.value;
              if (item.remaining <= 1) pending.delete(column);
              else
                pending.set(column, { ...item, remaining: item.remaining - 1 });
              column += 1;
            }
          };

          fillPending();
          $(row)
            .children("th,td")
            .each((___, cell) => {
              fillPending();
              const value = $(cell).text().replace(/\s+/g, " ").trim();
              const colspan = Math.max(1, Number($(cell).attr("colspan") ?? 1));
              const rowspan = Math.max(1, Number($(cell).attr("rowspan") ?? 1));
              for (let offset = 0; offset < colspan; offset += 1) {
                values[column + offset] = value;
                if (rowspan > 1) {
                  pending.set(column + offset, {
                    value,
                    remaining: rowspan - 1,
                  });
                }
              }
              column += colspan;
            });
          fillPending();
          if (values.some(Boolean)) rows.push(values);
        });

      const heading = $(table)
        .prevAll("h1,h2,h3,h4,h5,p")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      return { context: heading, rows };
    })
    .get();
}

export function numberFrom(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "");
  const values = [...normalized.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
    Number(match[0]),
  );
  return values.at(-1) ?? null;
}

export function firstNumberFrom(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function priceTypeFrom(label: string): ApiPriceType {
  const normalized = label.replace(/\s+/g, "").toLowerCase();
  if (/缓存.*写|cache.*write/.test(normalized)) return "cache_write";
  if (/缓存未命中|未命中缓存|uncached|cachemiss/.test(normalized)) {
    return "input";
  }
  if (/缓存|cache|命中/.test(normalized)) return "cached_input";
  if (/输出|output|生成/.test(normalized)) return "output";
  if (/输入|input|提示/.test(normalized)) return "input";
  return "other";
}

export function priceColumns(headers: string[]): PriceColumn[] {
  const candidates = headers.flatMap((label, index) => {
    const type = priceTypeFrom(label);
    if (type === "other" && !/价格|单价|费用|price|元\/|¥|￥/i.test(label)) {
      return [];
    }
    return [{ index, label, type }];
  });
  const explicitlyPriced = candidates.filter(({ label }) =>
    /价格|单价|费用|price|元\/|¥|￥|积分\/|积分.*百万/i.test(label),
  );
  return explicitlyPriced.length > 0 ? explicitlyPriced : candidates;
}

export function normalizeTokenUnit(text: string): {
  unit: string;
  multiplier: number;
} {
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  if (/百万|1m|million/.test(normalized)) {
    return { unit: "/百万 tokens", multiplier: 1 };
  }
  if (/千.*token|1k.*token/.test(normalized)) {
    return { unit: "/百万 tokens", multiplier: 1_000 };
  }
  if (/万.*token/.test(normalized)) {
    return { unit: "/百万 tokens", multiplier: 100 };
  }
  if (/token/.test(normalized)) {
    return { unit: "/百万 tokens", multiplier: 1_000_000 };
  }
  if (/千次/.test(normalized)) return { unit: "/千次", multiplier: 1 };
  if (/次|张|分钟|小时|秒|字符|积分|qps/i.test(normalized)) {
    return {
      unit: text.trim().startsWith("/") ? text.trim() : `/${text.trim()}`,
      multiplier: 1,
    };
  }
  return { unit: text.trim() || "按官方单位", multiplier: 1 };
}

export function apiOffer(input: {
  raw: RawCollectionResult;
  providerSlug: string;
  parserVersion: string;
  modelName: string;
  modelOrder: number;
  priceLabel: string;
  priceType?: ApiPriceType;
  value: number;
  unit?: string;
  multiplier?: number;
  category?: string;
  tier?: string;
  tierOrder?: number;
  planSuffix?: string;
}): NormalizedOffer {
  const modelSlug = slugifyPlan(input.modelName);
  const priceType = input.priceType ?? priceTypeFrom(input.priceLabel);
  const priceSlug =
    input.planSuffix ??
    `${priceType}-${slugifyPlan(input.priceLabel || "price")}`;
  const multiplier = input.multiplier ?? 1;
  const value = input.value * multiplier;
  const display = `¥${Number(value.toFixed(6))}`;
  return {
    providerSlug: input.providerSlug,
    productSlug: input.providerSlug,
    canonicalPlanSlug: `${modelSlug}-${priceSlug}${
      input.category ? `-${slugifyPlan(input.category)}` : ""
    }${input.tier ? `-${slugifyPlan(input.tier)}` : ""}`,
    rawPlanName: `${input.modelName} · ${input.priceLabel}${
      input.tier ? ` · ${input.tier}` : ""
    }`,
    mode: "api",
    channel: "official_api",
    region: "中国大陆",
    storefront: null,
    currency: "CNY",
    amountMinor: Number((value * 100).toFixed(6)),
    displayPrice: display,
    status: "verified",
    billingPeriod: "usage",
    unit: input.unit ?? "/百万 tokens",
    taxIncluded: null,
    sourceUrl: input.raw.sourceUrl,
    observedAt: input.raw.observedAt,
    parserVersion: input.parserVersion,
    modelName: input.modelName,
    modelSlug,
    modelOrder: input.modelOrder,
    priceType,
    priceTier: input.tier,
    tierOrder: input.tierOrder,
    category: input.category,
  };
}

export function dedupeOffers(offers: NormalizedOffer[]): NormalizedOffer[] {
  const seen = new Set<string>();
  const exact = offers.filter((offer) => {
    const identity = [
      offer.providerSlug,
      offer.canonicalPlanSlug,
      offer.unit,
      offer.displayPrice,
    ].join("|");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  const byPlan = new Map<string, NormalizedOffer[]>();
  for (const offer of exact) {
    const key = offer.canonicalPlanSlug ?? offer.rawPlanName;
    const group = byPlan.get(key) ?? [];
    group.push(offer);
    byPlan.set(key, group);
  }
  return [...byPlan.values()].flatMap((group) => {
    if (group.length === 1) return group;
    return [...group]
      .sort(
        (a, b) =>
          (a.amountMinor ?? Number.POSITIVE_INFINITY) -
            (b.amountMinor ?? Number.POSITIVE_INFINITY) ||
          a.rawPlanName.localeCompare(b.rawPlanName, "zh-CN") ||
          a.displayPrice.localeCompare(b.displayPrice, "zh-CN"),
      )
      .map((offer, index) => ({
        ...offer,
        canonicalPlanSlug: `${offer.canonicalPlanSlug}-variant-${index + 1}`,
        rawPlanName: `${offer.rawPlanName} · 档位 ${index + 1}`,
        priceTier: [offer.priceTier, `档位 ${index + 1}`]
          .filter(Boolean)
          .join(" · "),
        tierOrder: (offer.tierOrder ?? 0) + index,
      }));
  });
}

export function compactLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[（(]\s*[）)]/g, "")
    .trim();
}
