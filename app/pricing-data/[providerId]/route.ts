import { providerCatalog } from "@/lib/data/catalog";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await context.params;
  const catalogProvider = providerCatalog.find(
    (provider) => provider.id === providerId,
  );

  if (!catalogProvider) {
    return NextResponse.json(
      { error: "Provider not found" },
      {
        status: 404,
        headers: { "X-Robots-Tag": "noindex, nofollow" },
      },
    );
  }

  const providers = await loadProviderCatalog(catalogProvider.mode, providerId);
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    return NextResponse.json(
      { error: "Provider not found" },
      {
        status: 404,
        headers: { "X-Robots-Tag": "noindex, nofollow" },
      },
    );
  }

  return NextResponse.json(
    { provider },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
