import {
  loadCachedPricingPageData,
  PRICING_PAGE_CACHE_TAG,
  warmPricingPageData,
} from "@/lib/pricing/page-cache";
import { loadLandingCatalogSnapshot } from "@/lib/landing-page-data";
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hasValidBearerToken(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const suppliedDigest = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expectedDigest = createHash("sha256").update(secret).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export async function POST(request: Request) {
  if (!hasValidBearerToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(PRICING_PAGE_CACHE_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/china-ai-subscriptions");
  revalidatePath("/api-pricing");
  revalidatePath("/[landingSlug]", "page");
  revalidatePath("/sitemap.xml");

  await Promise.all([warmPricingPageData(), loadLandingCatalogSnapshot()]);
  const versions = await Promise.all(
    (["global", "china-subscription", "api"] as const).map(async (mode) => ({
      mode,
      version: (await loadCachedPricingPageData(mode)).lastCheckedAt ?? null,
    })),
  );

  return NextResponse.json({ revalidated: true, versions });
}
