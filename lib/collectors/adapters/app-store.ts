import { load } from "cheerio";
import { fetchPage } from "@/lib/collectors/http-client";
import {
  inferBillingPeriod,
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

export type AppStorefront = {
  code: string;
  countryName: string;
  currency: string;
};

export const appStorefronts: AppStorefront[] = [
  { code: "us", countryName: "美国", currency: "USD" },
  { code: "gb", countryName: "英国", currency: "GBP" },
  { code: "ca", countryName: "加拿大", currency: "CAD" },
  { code: "au", countryName: "澳大利亚", currency: "AUD" },
  { code: "nz", countryName: "新西兰", currency: "NZD" },
  { code: "jp", countryName: "日本", currency: "JPY" },
  { code: "kr", countryName: "韩国", currency: "KRW" },
  { code: "cn", countryName: "中国大陆", currency: "CNY" },
  { code: "hk", countryName: "中国香港", currency: "HKD" },
  { code: "tw", countryName: "中国台湾", currency: "TWD" },
  { code: "sg", countryName: "新加坡", currency: "SGD" },
  { code: "in", countryName: "印度", currency: "INR" },
  { code: "tr", countryName: "土耳其", currency: "TRY" },
  { code: "br", countryName: "巴西", currency: "BRL" },
  { code: "mx", countryName: "墨西哥", currency: "MXN" },
  { code: "cl", countryName: "智利", currency: "CLP" },
  { code: "co", countryName: "哥伦比亚", currency: "COP" },
  { code: "de", countryName: "德国", currency: "EUR" },
  { code: "fr", countryName: "法国", currency: "EUR" },
  { code: "it", countryName: "意大利", currency: "EUR" },
  { code: "es", countryName: "西班牙", currency: "EUR" },
  { code: "nl", countryName: "荷兰", currency: "EUR" },
  { code: "pl", countryName: "波兰", currency: "PLN" },
  { code: "se", countryName: "瑞典", currency: "SEK" },
  { code: "no", countryName: "挪威", currency: "NOK" },
  { code: "dk", countryName: "丹麦", currency: "DKK" },
  { code: "ch", countryName: "瑞士", currency: "CHF" },
  { code: "ae", countryName: "阿联酋", currency: "AED" },
  { code: "sa", countryName: "沙特阿拉伯", currency: "SAR" },
  { code: "za", countryName: "南非", currency: "ZAR" },
  { code: "ph", countryName: "菲律宾", currency: "PHP" },
  { code: "pk", countryName: "巴基斯坦", currency: "PKR" },
  { code: "vn", countryName: "越南", currency: "VND" },
  { code: "id", countryName: "印度尼西亚", currency: "IDR" },
  { code: "eg", countryName: "埃及", currency: "EGP" },
  { code: "ar", countryName: "阿根廷", currency: "USD" },
  { code: "my", countryName: "马来西亚", currency: "MYR" },
  { code: "th", countryName: "泰国", currency: "THB" },
  { code: "ng", countryName: "尼日利亚", currency: "NGN" },
  { code: "pe", countryName: "秘鲁", currency: "PEN" },
  { code: "il", countryName: "以色列", currency: "ILS" },
  { code: "ro", countryName: "罗马尼亚", currency: "RON" },
  { code: "hu", countryName: "匈牙利", currency: "HUF" },
  { code: "cz", countryName: "捷克", currency: "CZK" },
  { code: "qa", countryName: "卡塔尔", currency: "QAR" },
  { code: "kw", countryName: "科威特", currency: "USD" },
];

const canonicalPlanMatchers: Record<string, Array<[RegExp, string]>> = {
  chatgpt: [
    [/go/i, "chatgpt-go-monthly"],
    [/plus/i, "chatgpt-plus-monthly"],
    [/pro.*20|20.*pro/i, "chatgpt-pro-20x-monthly"],
    [/pro.*5|5.*pro/i, "chatgpt-pro-5x-monthly"],
    [/pro/i, "chatgpt-pro-monthly"],
  ],
  gemini: [
    [/ultra/i, "google-ai-ultra-monthly"],
    [/plus/i, "google-ai-plus-monthly"],
    [/pro/i, "google-ai-pro-monthly"],
  ],
  claude: [
    [/max.*20|20.*max/i, "claude-max-20x-monthly"],
    [/max.*5|5.*max/i, "claude-max-5x-monthly"],
    [/max/i, "claude-max-monthly"],
    [/pro/i, "claude-pro-monthly"],
  ],
  grok: [
    [/heavy/i, "supergrok-heavy-monthly"],
    [/lite/i, "supergrok-lite-monthly"],
    [/plus/i, "supergrok-plus-monthly"],
    [/supergrok|super grok/i, "supergrok-monthly"],
  ],
};

export function canonicalAppStorePlan(
  providerSlug: string,
  rawPlanName: string,
  billingPeriod: NormalizedOffer["billingPeriod"] = "month",
): string {
  const match = canonicalPlanMatchers[providerSlug]?.find(([pattern]) =>
    pattern.test(rawPlanName),
  );
  const base = match?.[1] ?? `${providerSlug}-${slugifyPlan(rawPlanName)}`;
  let periodBase =
    billingPeriod === "year" ? base.replace(/-monthly$/, "-annual") : base;
  const multiplier = rawPlanName.match(/\b(\d+)\s*x\b/i)?.[1];
  if (multiplier && !periodBase.includes(`-${multiplier}x-`)) {
    periodBase = periodBase.replace(/-(monthly|annual)$/, `-${multiplier}x-$1`);
  }
  const storageTier = rawPlanName.match(/\b(\d+)\s*(gb|tb)\b/i);
  if (!storageTier) return periodBase;
  return periodBase.replace(
    /-(monthly|annual)$/,
    `-${storageTier[1]}${storageTier[2].toLowerCase()}-$1`,
  );
}

function looksLikeLocalizedPrice(value: string, currency: string): boolean {
  if (!/\d/.test(value)) return false;
  if (/\p{Sc}/u.test(value)) return true;
  const currencyCode = currency.replace(/[^A-Z]/gi, "");
  return new RegExp(
    `^(?:(?:${currencyCode}|R|RM|Rp|Rs|S/|zł|kr|CHF|AED|SAR|TL)\\s*)?[\\d.,\\s]+(?:\\s*(?:${currencyCode}|元|円|원|zł|kr|đ|₫|ribu|lei|Kč))?$`,
    "i",
  ).test(value.trim());
}

function extractPurchasePairs(
  html: string,
  currency: string,
): Array<{ planName: string; displayPrice: string }> {
  const $ = load(html);
  const pairs: Array<{ planName: string; displayPrice: string }> = [];

  $("dt").each((_, element) => {
    const container = $(element).next("dd");
    container.find(".text-pair").each((__, pair) => {
      const values = $(pair)
        .find("span")
        .map((___, span) => $(span).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean);
      const displayPrice = values.find((value) =>
        looksLikeLocalizedPrice(value, currency),
      );
      const planName = values.find((value) => value !== displayPrice);

      if (planName && displayPrice) pairs.push({ planName, displayPrice });
    });
  });

  return pairs;
}

export function parseAppStoreHtml(input: {
  html: string;
  providerSlug: string;
  storefront: AppStorefront;
  sourceUrl: string;
  observedAt: string;
  parserVersion?: string;
  status?: number;
}): NormalizedOffer[] {
  if (input.status === 404) {
    return [
      {
        providerSlug: input.providerSlug,
        productSlug: input.providerSlug,
        canonicalPlanSlug: `${input.providerSlug}-availability`,
        rawPlanName: "App Store 上架状态",
        mode: "subscription",
        channel: "app_store",
        region: input.storefront.countryName,
        storefront: input.storefront.code.toUpperCase(),
        currency: input.storefront.currency,
        amountMinor: null,
        displayPrice: "此区未上架",
        status: "unpublished",
        billingPeriod: null,
        unit: null,
        taxIncluded: null,
        sourceUrl: input.sourceUrl,
        observedAt: input.observedAt,
        parserVersion: input.parserVersion ?? "app-store-v3",
      },
    ];
  }

  const offers: NormalizedOffer[] = [];

  const parsedPairs = extractPurchasePairs(
    input.html,
    input.storefront.currency,
  )
    .filter(
      (pair) =>
        !/credits?/i.test(pair.planName) &&
        !/^\d+\s*(?:gb|tb)\b/i.test(pair.planName),
    )
    .map((pair) => ({
      ...pair,
      amountMinor: parseLocalizedPrice(
        pair.displayPrice,
        input.storefront.currency,
      ),
    }));
  const lowestByPlan = new Map<string, number>();
  for (const pair of parsedPairs) {
    const key = pair.planName.toLowerCase();
    lowestByPlan.set(
      key,
      Math.min(
        lowestByPlan.get(key) ?? Number.POSITIVE_INFINITY,
        pair.amountMinor,
      ),
    );
  }

  const stablePairs = new Map<
    string,
    (typeof parsedPairs)[number] & {
      billingPeriod: NormalizedOffer["billingPeriod"];
    }
  >();
  for (const pair of parsedPairs) {
    const inferredPeriod = inferBillingPeriod(pair.planName);
    const lowestSamePlan =
      lowestByPlan.get(pair.planName.toLowerCase()) ?? pair.amountMinor;
    const billingPeriod =
      inferredPeriod === "month" &&
      lowestSamePlan > 0 &&
      pair.amountMinor / lowestSamePlan >= 6
        ? "year"
        : inferredPeriod;
    const identity = `${pair.planName.toLowerCase()}:${billingPeriod}`;
    const current = stablePairs.get(identity);
    if (!current || pair.amountMinor < current.amountMinor) {
      stablePairs.set(identity, { ...pair, billingPeriod });
    }
  }

  for (const pair of stablePairs.values()) {
    try {
      const amountMinor = pair.amountMinor;
      offers.push({
        providerSlug: input.providerSlug,
        productSlug: input.providerSlug,
        canonicalPlanSlug: canonicalAppStorePlan(
          input.providerSlug,
          pair.planName,
          pair.billingPeriod,
        ),
        rawPlanName: pair.planName,
        mode: "subscription",
        channel: "app_store",
        region: input.storefront.countryName,
        storefront: input.storefront.code.toUpperCase(),
        currency: input.storefront.currency,
        amountMinor,
        displayPrice: pair.displayPrice,
        status: "verified",
        billingPeriod: pair.billingPeriod,
        unit: null,
        taxIncluded: null,
        sourceUrl: input.sourceUrl,
        observedAt: input.observedAt,
        parserVersion: input.parserVersion ?? "app-store-v3",
      });
    } catch {
      // App Store can include non-price metadata in text pairs. Ignore it.
    }
  }

  return offers;
}

export function appStoreHealthCheck(offers: NormalizedOffer[]): SourceHealth {
  if (offers.length === 0) {
    return {
      ok: false,
      code: "EMPTY_RESULT",
      message: "App Store page did not expose any in-app purchase prices.",
    };
  }
  if (
    offers.some(
      (offer) =>
        (offer.amountMinor !== null && offer.amountMinor < 0) ||
        !offer.currency,
    )
  ) {
    return {
      ok: false,
      code: "MISSING_PRICE",
      message: "At least one App Store offer has an invalid price.",
    };
  }
  const offersByIdentity = new Map<string, NormalizedOffer[]>();
  for (const offer of offers) {
    const identity = `${offer.canonicalPlanSlug}:${offer.storefront}:${offer.billingPeriod}`;
    const matches = offersByIdentity.get(identity) ?? [];
    matches.push(offer);
    offersByIdentity.set(identity, matches);
  }
  const duplicateIdentities = [...offersByIdentity.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([identity, matches]) => ({
      identity,
      offers: matches.map((offer) => ({
        rawPlanName: offer.rawPlanName,
        displayPrice: offer.displayPrice,
        amountMinor: offer.amountMinor,
      })),
    }));
  if (duplicateIdentities.length > 0) {
    return {
      ok: false,
      code: "STRUCTURE_CHANGED",
      message:
        "Multiple App Store offers collapsed into the same plan identity.",
      details: { duplicateIdentities },
    };
  }
  return {
    ok: true,
    code: "OK",
    message: `${offers.length} App Store offers parsed.`,
  };
}

export class AppStoreAdapter implements PriceSourceAdapter {
  readonly parserVersion = "app-store-v3";
  readonly id: string;
  readonly sourceUrl: string;

  constructor(
    readonly providerSlug: string,
    readonly appId: string,
    readonly storefront: AppStorefront,
  ) {
    this.id = `${providerSlug}-app-store-${storefront.code}`;
    this.sourceUrl = `https://apps.apple.com/${storefront.code}/app/id${appId}`;
  }

  collect(context: CollectionContext): Promise<RawCollectionResult> {
    return fetchPage(this.sourceUrl, {
      observedAt: context.observedAt,
      signal: context.signal,
      allowedStatuses: [404],
    });
  }

  async parse(raw: RawCollectionResult): Promise<NormalizedOffer[]> {
    return parseAppStoreHtml({
      html: raw.body,
      providerSlug: this.providerSlug,
      storefront: this.storefront,
      sourceUrl: raw.sourceUrl,
      observedAt: raw.observedAt,
      parserVersion: this.parserVersion,
      status: raw.status,
    });
  }

  healthCheck(offers: NormalizedOffer[]): SourceHealth {
    return appStoreHealthCheck(offers);
  }
}
