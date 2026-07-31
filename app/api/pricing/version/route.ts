import { loadCachedPricingPageData } from "@/lib/pricing/page-cache";
import type { PriceMode } from "@/lib/pricing/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const validModes = new Set<PriceMode>(["global", "china-subscription", "api"]);

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get(
    "mode",
  ) as PriceMode | null;
  if (!mode || !validModes.has(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const data = await loadCachedPricingPageData(mode);
  return NextResponse.json({
    mode,
    version: data.lastCheckedAt ?? null,
  });
}
