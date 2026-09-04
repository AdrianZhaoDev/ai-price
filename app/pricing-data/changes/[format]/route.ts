import { loadSubscriptionHistory } from "@/lib/pricing/history";
import {
  renderPriceChangesCsv,
  renderPriceChangesRss,
} from "@/lib/pricing/history-export";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ format: string }> },
) {
  const { format } = await params;
  if (!["feed.xml", "prices.csv", "prices.json"].includes(format))
    return new Response("Not found", { status: 404 });
  try {
    const data = await loadSubscriptionHistory();
    if (!data.available)
      return new Response("History unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    const headers = {
      "Cache-Control": "public, max-age=300, s-maxage=900",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    };
    if (format === "prices.json")
      return Response.json(
        {
          ...data,
          methodology: "https://lowpriceradar.com/price-changes#methodology",
          notice:
            "Original-currency observations; source rights remain with their owners. Confirmed dates are not official effective dates. No price or FX forecasts.",
        },
        { headers },
      );
    return new Response(
      format === "feed.xml"
        ? renderPriceChangesRss(data.events)
        : "\uFEFF" + renderPriceChangesCsv(data.events),
      {
        headers: {
          ...headers,
          "Content-Type":
            format === "feed.xml"
              ? "application/rss+xml; charset=utf-8"
              : "text/csv; charset=utf-8",
          ...(format === "prices.csv"
            ? {
                "Content-Disposition":
                  'attachment; filename="subscription-price-changes.csv"',
              }
            : {}),
        },
      },
    );
  } catch {
    return new Response("History temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
