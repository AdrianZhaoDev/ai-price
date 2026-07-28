import { currencyFractionDigits } from "@/lib/collectors/price-parser";
import { fetchPage } from "@/lib/collectors/http-client";
import { getDatabase } from "@/lib/db/client";
import { fxRates } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export const fxSourceUrl = "https://api.frankfurter.dev/v2/rates";

export type FxRate = {
  currency: string;
  cnyPerUnit: number;
  rateDate: string;
  observedAt: Date;
  sourceUrl: string;
};

type FrankfurterRate = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

function normalizeCurrencies(currencies: string[]): string[] {
  return [...new Set(currencies.map((currency) => currency.toUpperCase()))];
}

function isFreshEnough(rateDate: string, observedAt: Date): boolean {
  const timestamp = Date.parse(`${rateDate}T23:59:59Z`);
  return (
    Number.isFinite(timestamp) &&
    timestamp <= observedAt.getTime() + 24 * 60 * 60 * 1000 &&
    observedAt.getTime() - timestamp <= 10 * 24 * 60 * 60 * 1000
  );
}

async function fetchFrankfurterRates(
  currencies: string[],
  observedAt: Date,
): Promise<FxRate[]> {
  const quotes = normalizeCurrencies(currencies).filter(
    (currency) => currency !== "CNY",
  );
  if (quotes.length === 0) return [];

  const url = new URL(fxSourceUrl);
  url.searchParams.set("base", "CNY");
  url.searchParams.set("quotes", quotes.join(","));
  const raw = await fetchPage(url.toString(), {
    observedAt,
    timeoutMs: 15_000,
    attempts: 3,
    headers: { accept: "application/json" },
  });
  const payload = JSON.parse(raw.body) as FrankfurterRate[];
  if (!Array.isArray(payload)) {
    throw new Error("FX service returned an unexpected payload.");
  }

  const rates = payload.map((row) => {
    if (
      row.base !== "CNY" ||
      !quotes.includes(row.quote) ||
      !Number.isFinite(row.rate) ||
      row.rate <= 0 ||
      !isFreshEnough(row.date, observedAt)
    ) {
      throw new Error(`Invalid or stale FX rate for ${row.quote || "?"}.`);
    }
    return {
      currency: row.quote,
      cnyPerUnit: 1 / row.rate,
      rateDate: row.date,
      observedAt,
      sourceUrl: url.toString(),
    };
  });
  const returned = new Set(rates.map((rate) => rate.currency));
  const missing = quotes.filter((currency) => !returned.has(currency));
  if (missing.length > 0) {
    throw new Error(`FX service omitted currencies: ${missing.join(", ")}.`);
  }
  return rates;
}

async function persistRates(rates: FxRate[]): Promise<void> {
  if (rates.length === 0) return;
  const db = getDatabase();
  for (const rate of rates) {
    await db
      .insert(fxRates)
      .values({
        quoteCurrency: rate.currency,
        cnyPerUnit: rate.cnyPerUnit,
        rateDate: rate.rateDate,
        sourceUrl: rate.sourceUrl,
        observedAt: rate.observedAt,
      })
      .onConflictDoUpdate({
        target: [fxRates.baseCurrency, fxRates.quoteCurrency, fxRates.rateDate],
        set: {
          cnyPerUnit: rate.cnyPerUnit,
          sourceUrl: rate.sourceUrl,
          observedAt: rate.observedAt,
        },
      });
  }
}

async function loadLatestRates(currencies: string[]): Promise<FxRate[]> {
  const quotes = normalizeCurrencies(currencies).filter(
    (currency) => currency !== "CNY",
  );
  if (quotes.length === 0) return [];
  const rows = await getDatabase()
    .selectDistinctOn([fxRates.quoteCurrency])
    .from(fxRates)
    .where(inArray(fxRates.quoteCurrency, quotes))
    .orderBy(fxRates.quoteCurrency, desc(fxRates.observedAt));
  return rows.map((row) => ({
    currency: row.quoteCurrency,
    cnyPerUnit: row.cnyPerUnit,
    rateDate: row.rateDate,
    observedAt: row.observedAt,
    sourceUrl: row.sourceUrl,
  }));
}

export async function refreshFxRates(
  currencies: string[],
  observedAt = new Date(),
): Promise<Map<string, FxRate>> {
  const requested = normalizeCurrencies(currencies);
  let rates: FxRate[] = [];
  try {
    rates = await fetchFrankfurterRates(requested, observedAt);
    await persistRates(rates);
  } catch (error) {
    console.warn(
      "Live FX refresh failed; using the latest persisted snapshot.",
      error,
    );
    rates = await loadLatestRates(requested);
  }

  const result = new Map(rates.map((rate) => [rate.currency, rate]));
  result.set("CNY", {
    currency: "CNY",
    cnyPerUnit: 1,
    rateDate: observedAt.toISOString().slice(0, 10),
    observedAt,
    sourceUrl: fxSourceUrl,
  });
  const missing = requested.filter((currency) => !result.has(currency));
  if (missing.length > 0) {
    throw new Error(
      `No live or persisted RMB exchange rate for: ${missing.join(", ")}.`,
    );
  }
  return result;
}

export function convertMinorToCny(
  amountMinor: number | null,
  currency: string,
  rate: FxRate | undefined,
): number | null {
  if (amountMinor === null) return null;
  if (!rate) {
    throw new Error(`Missing RMB exchange rate for ${currency}.`);
  }
  const major = amountMinor / 10 ** currencyFractionDigits(currency);
  return Number((major * rate.cnyPerUnit).toFixed(6));
}

export async function latestFxRate(currency: string): Promise<FxRate | null> {
  const [row] = await getDatabase()
    .select()
    .from(fxRates)
    .where(eq(fxRates.quoteCurrency, currency.toUpperCase()))
    .orderBy(desc(fxRates.observedAt))
    .limit(1);
  return row
    ? {
        currency: row.quoteCurrency,
        cnyPerUnit: row.cnyPerUnit,
        rateDate: row.rateDate,
        observedAt: row.observedAt,
        sourceUrl: row.sourceUrl,
      }
    : null;
}
