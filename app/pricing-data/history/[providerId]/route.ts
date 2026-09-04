import { providerCatalog } from "@/lib/data/catalog";
import { loadSubscriptionHistory } from "@/lib/pricing/history";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params;
  if (
    !providerCatalog.some(
      (provider) => provider.id === providerId && provider.mode !== "api",
    )
  ) {
    return Response.json(
      { error: "Unknown subscription provider" },
      { status: 404 },
    );
  }
  try {
    const data = await loadSubscriptionHistory(providerId);
    return Response.json(data, {
      status: data.available ? 200 : 503,
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": data.available
          ? "public, max-age=300, s-maxage=900"
          : "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Price history temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
