import type {
  BillingPeriod,
  PriceOffer,
  PriceStatus,
  ProviderCatalogItem,
} from "./types";
import type { Locale } from "@/lib/i18n";

export const API_INITIAL_VISIBLE_COUNT = 10;

const periodLabels: Record<Locale, Record<BillingPeriod, string>> = {
  "zh-CN": {
    week: "/周",
    month: "/月",
    quarter: "/季",
    year: "/年",
    one_time: "一次性",
    usage: "",
  },
  en: {
    week: "/week",
    month: "/month",
    quarter: "/quarter",
    year: "/year",
    one_time: "one-time",
    usage: "",
  },
};

function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}

export function formatPeriod(
  period: BillingPeriod,
  locale: Locale = "zh-CN",
): string {
  return periodLabels[locale][period];
}

export function formatCny(value?: number, locale: Locale = "zh-CN"): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatApiCny(value?: number, locale: Locale = "zh-CN"): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatOfferPrice(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
  if (offer.amountMinor === null || offer.currency === null) {
    return offer.displayPrice;
  }

  const period = formatPeriod(offer.billingPeriod, locale);
  if (!period) {
    return offer.displayPrice;
  }
  const sourcePeriods = Object.values(periodLabels).flatMap((labels) =>
    Object.values(labels).filter(Boolean),
  );
  const existingPeriod = sourcePeriods.find((candidate) =>
    offer.displayPrice.trim().endsWith(candidate),
  );
  const amount = existingPeriod
    ? offer.displayPrice.trim().slice(0, -existingPeriod.length)
    : offer.displayPrice;
  return `${amount}${period}`;
}

const hanCharacters = /[\u3400-\u9fff]/;

const englishPriceTypeLabels: Record<
  NonNullable<PriceOffer["priceType"]>,
  string
> = {
  cached_input: "Cached input",
  input: "Input",
  output: "Output",
  cache_write: "Cache write",
  other: "Other",
};

const englishPricingMetadata: Record<string, string> = {
  中国内地: "Chinese mainland",
  中国大陆: "Chinese mainland",
  全球: "Global",
  标准: "Standard",
  标准档: "Standard tier",
  高速档: "High-speed tier",
  免费层: "Free tier",
  非通用模型: "Specialized model",
  标准实时: "Standard",
  长上下文: "Long context",
  存储费: "Storage",
  模型调用: "Model inference",
  在线推理: "Online inference",
  按量付费: "Pay as you go",
  限时折扣: "Limited-time discount",
  火山方舟: "Volcano Ark",
  官方API定价: "Official API pricing",
  "官方 API 定价": "Official API pricing",
  "TeleAI 官方套餐": "Official TeleAI plan",
  "Token Plan 标准成员折算": "Token Plan standard-member equivalent",
};

function formatEnglishPricingMetadata(value: string): string | undefined {
  const translated = englishPricingMetadata[value];
  if (translated) return translated;
  const variant = value.match(/^档位\s*(\d+)$/);
  if (variant) return `Variant ${variant[1]}`;
  const table = value.match(/^价目表\s*(\d+)$/);
  if (table) return `Pricing table ${table[1]}`;
  return hanCharacters.test(value) ? undefined : value;
}

const englishProviderDescriptions: Record<string, string> = {
  chatgpt: "Official OpenAI iOS app subscriptions",
  gemini: "Google Gemini and Google AI subscriptions",
  claude: "Anthropic Claude subscriptions, including Claude Code benefits",
  grok: "Official xAI Grok iOS app subscriptions",
  "kimi-membership": "Four official membership tiers",
  "stepfun-subscription": "Official membership and Step Plan subscriptions",
  "minimax-token-plan": "Official monthly Token Plan subscriptions",
  "qwen-token-plan": "Alibaba Cloud Model Studio monthly developer plans",
  "baidu-token-package":
    "Qianfan monthly model-credit packages with standard and first-purchase prices",
  "spark-token-plan": "iFlytek MaaS Token Plan membership tiers",
  "glm-resource-package": "Limited official GLM Token resource packages",
  "glm-coding-plan":
    "Official personal coding plans with monthly, quarterly, and annual billing",
  "comate-subscription": "Official Baidu Comate personal subscriptions",
  "qoder-subscription": "Personal Qoder subscriptions with monthly Credits",
  "trae-subscription": "TRAE personal subscriptions and free plan",
  "codebuddy-subscription":
    "Official Tencent personal AI coding and productivity subscriptions",
  "mimo-token-plan": "Xiaomi MiMo monthly and annual Token Plans",
  "huawei-token-plan": "Huawei Cloud Token Plans for individual developers",
  "sensenova-token-plan":
    "Free during public beta; paid tiers have not been announced",
  "deepseek-api": "Official usage-based model API pricing",
  "doubao-api": "Official Doubao model pricing from Volcano Ark",
  "qwen-api": "Alibaba Cloud Model Studio model services",
  "kimi-api": "Official Moonshot API pricing",
  "hunyuan-api": "Tencent Cloud Hunyuan and TokenHub pricing",
  "ernie-api": "Baidu AI Cloud Qianfan model services",
  "glm-api": "Official GLM pricing from BigModel",
  "minimax-api": "Text, audio, image, and video models",
  "stepfun-api": "Step Plan developer subscriptions",
  "spark-api": "Token Plan member-price equivalents, not pay-as-you-go pricing",
  "mimo-api": "Domestic usage-based pricing for Xiaomi MiMo-V2.5 models",
  "baichuan-api": "Official API pricing for Baichuan-M3 models",
  "longcat-api": "Official limited-time pricing for LongCat-2.0",
  "siliconflow-api": "Live official model pricing from SiliconFlow",
  "huawei-maas-api": "Token-based pricing for Huawei Cloud MaaS models",
  "teleai-api": "QPS pricing for China Telecom TeleMM multimodal APIs",
  "openai-api": "Official OpenAI standard, short-context Token pricing",
  "claude-api": "Official Anthropic standard Token pricing",
  "gemini-api": "Official paid Gemini Developer API pricing",
  "grok-api": "Official xAI standard, short-context Token pricing",
};

export function formatProviderDescription(
  provider: Pick<
    ProviderCatalogItem,
    "description" | "id" | "mode" | "name" | "sourceType"
  >,
  locale: Locale = "zh-CN",
): string {
  if (locale !== "en") return provider.description;
  const translated = englishProviderDescriptions[provider.id];
  if (translated) return translated;
  if (provider.sourceType === "app_store") {
    return `${provider.name} subscriptions from the official iOS app`;
  }
  if (provider.mode === "api") {
    return `Official ${provider.name} API pricing`;
  }
  return `Official ${provider.name} subscription pricing`;
}

export function formatOfferPlanName(
  offer: Pick<PriceOffer, "modelName" | "planName" | "priceTier" | "priceType">,
  locale: Locale = "zh-CN",
): string {
  if (locale === "en" && offer.modelName && offer.priceType) {
    const tier = offer.priceTier
      ?.split(" · ")
      .map(formatEnglishPricingMetadata)
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    return [offer.modelName, englishPriceTypeLabels[offer.priceType], tier]
      .filter(Boolean)
      .join(" · ");
  }
  return offer.planName;
}

export function formatOfferDisplayPrice(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
  const formatted = formatOfferPrice(offer, locale);
  if (locale !== "en" || !hanCharacters.test(formatted)) return formatted;

  const exactTranslations: Record<string, string> = {
    等待采集: "Awaiting collection",
    等待首轮采集: "Awaiting first collection",
    等待首次核验: "Awaiting first verification",
    查看官方价目: "See official pricing",
    官方未公开统一固定价: "No single public fixed price",
  };
  const exact = exactTranslations[offer.displayPrice.trim()];
  if (exact) return exact;

  const inputOutput = offer.displayPrice.match(
    /^输入\s+(.+?)\s*·\s*输出\s+(.+)$/,
  );
  if (inputOutput) return `Input ${inputOutput[1]} · Output ${inputOutput[2]}`;
  if (offer.status === "pending" || offer.status === "unpublished") {
    return statusLabel(offer.status, locale);
  }
  return offer.status === "stale"
    ? "See official source (potentially stale)"
    : "See official source";
}

export function formatOfferUnit(
  unit: string | undefined,
  locale: Locale = "zh-CN",
  fallback = "",
): string {
  if (!unit || locale !== "en") return unit ?? fallback;
  let value = unit
    .replace(
      /(\d+(?:\.\d+)?)亿/g,
      (_, amount: string) => `${Number(amount) * 100}M`,
    )
    .replace(
      /(\d+(?:\.\d+)?)万/g,
      (_, amount: string) => `${Number(amount) / 100}M`,
    )
    .replace(/百万/g, "million")
    .replace(/（Token Plan 折算）/g, " (Token Plan equivalent)")
    .replace(/积分/g, "credits")
    .replace(/每模型/g, "per model")
    .replace(/次调用/g, "calls")
    .replace(/每千次/g, "1,000 calls")
    .replace(/千次/g, "1,000 calls")
    .replace(/每次/g, "call")
    .replace(/每张/g, "image")
    .replace(/每分钟/g, "minute")
    .replace(/每小时/g, "hour")
    .replace(/每秒/g, "second")
    .replace(/每字符/g, "character")
    .replace(/次/g, "calls")
    .replace(/张/g, "images")
    .replace(/分钟/g, "minutes")
    .replace(/个月/g, " months")
    .replace(/小时/g, "hours")
    .replace(/秒/g, "seconds")
    .replace(/字符/g, "characters")
    .replace(/天/g, " days")
    .replace(/月/g, "month")
    .replace(/按官方单位/g, "Official unit")
    .replace(/\s+/g, " ")
    .trim();
  value = value.replace(/\s*\/\s*/g, "/");
  return hanCharacters.test(value) ? fallback : value;
}

export function formatOfferAnnotation(
  offer: Pick<PriceOffer, "category" | "note" | "priceTier">,
  provider: Pick<
    ProviderCatalogItem,
    "description" | "id" | "mode" | "name" | "sourceType"
  >,
  locale: Locale = "zh-CN",
): string {
  if (locale !== "en") {
    if (offer.note) return offer.note;
    if (provider.mode === "api") {
      const metadata = [offer.category, offer.priceTier]
        .filter(Boolean)
        .join(" · ");
      if (metadata) return metadata;
    }
    return provider.description;
  }

  if (offer.note) {
    const storage = offer.note.match(/^含\s+(.+)\s+存储$/);
    if (storage) return `Includes ${storage[1]} storage`;
    const credits = offer.note.match(/^([\d,]+)\s*积分$/);
    if (credits) return `${credits[1]} credits`;
    const cacheInput = offer.note.match(/^缓存输入\s+(.+)$/);
    if (cacheInput) return `Cached input ${cacheInput[1]}`;
    const cacheRead = offer.note.match(/^缓存读取\s+(.+)$/);
    if (cacheRead) return `Cache read ${cacheRead[1]}`;
    const noteTranslations: Record<string, string> = {
      日常使用: "Everyday use",
      效率升级: "Productivity upgrade",
      专业优选: "Professional use",
      全能尊享: "Full-featured plan",
    };
    if (noteTranslations[offer.note]) return noteTranslations[offer.note];
    if (!hanCharacters.test(offer.note)) return offer.note;
  }

  const metadataTranslations: Record<string, string> = {
    官方标准实时价: "Official standard real-time pricing",
  };
  const metadata = [offer.category, offer.priceTier]
    .filter((value): value is string => Boolean(value))
    .map(
      (value) =>
        metadataTranslations[value] ?? formatEnglishPricingMetadata(value),
    )
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  return metadata || formatProviderDescription(provider, locale);
}

export function formatRegionName(
  offer: Pick<PriceOffer, "regionCode" | "regionName">,
  locale: Locale = "zh-CN",
  fallback = "—",
): string {
  if (locale === "en" && offer.regionCode) {
    try {
      return (
        new Intl.DisplayNames(["en"], { type: "region" }).of(
          offer.regionCode.toUpperCase(),
        ) ?? offer.regionCode
      );
    } catch {
      // Keep source data visible when a provider emits a nonstandard code.
    }
  }
  if (locale === "en") {
    if (offer.regionName === "全球") return "Global";
    if (offer.regionName && !hanCharacters.test(offer.regionName)) {
      return offer.regionName;
    }
    return offer.regionCode ?? fallback;
  }
  return offer.regionName ?? offer.regionCode ?? fallback;
}

const zeroDecimalCurrencies = new Set(["CLP", "IDR", "JPY", "KRW", "VND"]);

export function formatFxRate(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
  if (!offer.currency) return "—";

  const fractionDigits = zeroDecimalCurrencies.has(offer.currency.toUpperCase())
    ? 0
    : 2;
  const originalAmount =
    offer.amountMinor === null
      ? undefined
      : offer.amountMinor / 10 ** fractionDigits;
  const rate =
    offer.fxRate ??
    (offer.convertedCny !== undefined &&
    originalAmount !== undefined &&
    originalAmount > 0
      ? offer.convertedCny / originalAmount
      : undefined);

  if (rate === undefined || !Number.isFinite(rate)) {
    return locale === "en"
      ? `1 ${offer.currency} ≈ —`
      : `1 ${offer.currency} ≈ —`;
  }

  const maximumFractionDigits = rate >= 100 ? 2 : rate >= 0.01 ? 4 : 6;
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(rate);
  return `1 ${offer.currency} ≈ ¥${formatted}`;
}

export function formatFxDate(
  offer: PriceOffer,
  locale: Locale = "zh-CN",
): string {
  const date = offer.fxRateObservedAt?.slice(0, 10);
  if (date) return locale === "en" ? `FX date ${date}` : `汇率 ${date}`;
  return locale === "en" ? "FX date unknown" : "汇率日期未知";
}

/*
 * Keep these labels in this module for callers that do not render through a
 * page component yet. The optional locale keeps existing Chinese callers and
 * tests backwards compatible.
 */
export function statusLabel(
  status: PriceStatus,
  locale: Locale = "zh-CN",
): string {
  const labels: Record<Locale, Record<PriceStatus, string>> = {
    "zh-CN": {
      verified: "已核验",
      stale: "可能过期",
      pending: "等待采集",
      unpublished: "未公开固定价",
    },
    en: {
      verified: "Verified",
      stale: "Potentially stale",
      pending: "Pending collection",
      unpublished: "No public fixed price",
    },
  };

  return labels[locale][status];
}

/* The following helpers are data-shape operations and are locale agnostic. */

/*
 * Keep the old exports below this comment unchanged in behavior.
 */

export function compareCnyPrice(
  value?: number,
  minimum?: number,
): { isMinimum: boolean; difference: number; percentage: number } | undefined {
  if (
    value === undefined ||
    minimum === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(minimum) ||
    minimum <= 0
  ) {
    return undefined;
  }

  const difference = Number(Math.max(0, value - minimum).toFixed(6));
  return {
    isMinimum: difference < 0.005,
    difference,
    percentage: (difference / minimum) * 100,
  };
}

export function isComparableOffer(offer: PriceOffer): boolean {
  return (
    offer.status === "verified" &&
    offer.amountMinor !== null &&
    offer.currency !== null
  );
}

export function lowestComparableOffer(
  offers: PriceOffer[],
): PriceOffer | undefined {
  return offers
    .filter(
      (offer) => isComparableOffer(offer) && offer.convertedCny !== undefined,
    )
    .sort((a, b) => (a.convertedCny ?? 0) - (b.convertedCny ?? 0))[0];
}

export function displayableOffers(offers: PriceOffer[]): PriceOffer[] {
  const monthlyNames = new Set(
    offers
      .filter(
        (offer) =>
          offer.billingPeriod === "month" &&
          offer.amountMinor !== null &&
          !offer.planId.endsWith("-availability"),
      )
      .map((offer) => offer.planName.trim().toLocaleLowerCase()),
  );
  return offers.filter(
    (offer) =>
      offer.amountMinor !== null &&
      !offer.planId.endsWith("-availability") &&
      !(
        offer.billingPeriod === "year" &&
        monthlyNames.has(offer.planName.trim().toLocaleLowerCase())
      ),
  );
}

export function visibleApiOffers(
  offers: PriceOffer[],
  expanded: boolean,
): PriceOffer[] {
  return expanded ? offers : offers.slice(0, API_INITIAL_VISIBLE_COUNT);
}

export function sortOffersByCny(
  offers: PriceOffer[],
  direction: "asc" | "desc",
): PriceOffer[] {
  return [...offers].sort((a, b) => {
    const aValue = a.convertedCny;
    const bValue = b.convertedCny;
    if (aValue === undefined && bValue === undefined) {
      return a.planName.localeCompare(b.planName, "zh-CN");
    }
    if (aValue === undefined) return 1;
    if (bValue === undefined) return -1;
    return direction === "asc" ? aValue - bValue : bValue - aValue;
  });
}

export function plansByMinimumPrice(
  offers: PriceOffer[],
  direction: "asc" | "desc" = "asc",
): Array<{ id: string; name: string; minimumCny?: number }> {
  const plans = new Map<
    string,
    { id: string; name: string; minimumCny?: number }
  >();

  for (const offer of offers) {
    const current = plans.get(offer.planId) ?? {
      id: offer.planId,
      name: offer.planName,
    };
    if (
      offer.convertedCny !== undefined &&
      Number.isFinite(offer.convertedCny) &&
      (current.minimumCny === undefined ||
        offer.convertedCny < current.minimumCny)
    ) {
      current.minimumCny = offer.convertedCny;
    }
    plans.set(offer.planId, current);
  }

  return [...plans.values()].sort((a, b) => {
    if (a.minimumCny === undefined && b.minimumCny === undefined) {
      return a.name.localeCompare(b.name, "zh-CN");
    }
    if (a.minimumCny === undefined) return 1;
    if (b.minimumCny === undefined) return -1;
    return direction === "asc"
      ? a.minimumCny - b.minimumCny
      : b.minimumCny - a.minimumCny;
  });
}

export function lowestThreeRanks(offers: PriceOffer[]): Map<string, number> {
  const ranked = sortOffersByCny(
    offers.filter(
      (offer) => isComparableOffer(offer) && offer.convertedCny !== undefined,
    ),
    "asc",
  ).slice(0, 3);
  return new Map(ranked.map((offer, index) => [offer.id, index + 1]));
}
