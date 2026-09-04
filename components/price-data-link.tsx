"use client";

import { trackTrafficEvent } from "@/lib/analytics/traffic";

export function PriceDataLink({
  format,
}: {
  format: "feed.xml" | "prices.csv" | "prices.json";
}) {
  const label =
    format === "feed.xml" ? "RSS" : format === "prices.csv" ? "CSV" : "JSON";
  return (
    <a
      href={`/pricing-data/changes/${format}`}
      onClick={() =>
        trackTrafficEvent("pricing_data_downloaded", {
          data_format: label.toLowerCase() as "rss" | "csv" | "json",
        })
      }
    >
      {label}
    </a>
  );
}
