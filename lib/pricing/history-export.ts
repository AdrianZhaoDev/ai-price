import { absoluteUrl } from "@/lib/seo";
import { currencyFractionDigits } from "@/lib/collectors/price-parser";
import type { SubscriptionPriceChange } from "./history-types";

function xml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

function csv(value: string | number | null) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function renderPriceChangesCsv(events: SubscriptionPriceChange[]) {
  const header = [
    "provider",
    "plan",
    "region",
    "currency",
    "previous_amount",
    "current_amount",
    "billing_period",
    "confirmed_at",
    "source_url",
  ];
  return [
    header.map(csv).join(","),
    ...events.map((event) => {
      const divisor = 10 ** currencyFractionDigits(event.currency);
      return [
        event.providerId,
        event.planId,
        event.regionCode ?? event.regionName,
        event.currency,
        event.previousAmountMinor / divisor,
        event.currentAmountMinor / divisor,
        event.billingPeriod,
        event.confirmedAt,
        event.sourceUrl,
      ]
        .map(csv)
        .join(",");
    }),
  ].join("\r\n");
}

export function renderPriceChangesRss(events: SubscriptionPriceChange[]) {
  const url = absoluteUrl("/price-changes");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Low Price Radar · Subscription price changes</title><link>${xml(url)}</link>
<description>Confirmed original-currency subscription price changes. FX-only changes are excluded. Confirmation dates are not official effective dates.</description>
<atom:link href="${xml(absoluteUrl("/pricing-data/changes/feed.xml"))}" rel="self" type="application/rss+xml"/>
${events.map((event) => `<item><guid isPermaLink="true">${xml(`${url}#change-${event.id}`)}</guid><link>${xml(`${url}#change-${event.id}`)}</link><title>${xml(`${event.providerName} · ${event.planName} · ${event.regionCode ?? event.regionName ?? ""}: ${event.previousDisplayPrice} → ${event.currentDisplayPrice} ${event.currency}`)}</title><description>${xml(`Confirmed ${event.confirmedAt}. Official source: ${event.sourceUrl}`)}</description><pubDate>${new Date(event.confirmedAt).toUTCString()}</pubDate></item>`).join("\n")}
</channel></rss>`;
}
