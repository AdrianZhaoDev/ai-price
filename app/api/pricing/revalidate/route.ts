import {
  loadCachedPricingPageData,
  PRICING_PAGE_CACHE_TAG,
  warmPricingPageData,
} from "@/lib/pricing/page-cache";
import { loadLandingCatalogSnapshot } from "@/lib/landing-page-data";
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MODEL_CATALOG_CACHE_TAG,
  modelCacheTag,
} from "@/lib/model-catalog/cache";
import { isSafeModelId, modelDetailPath } from "@/lib/model-catalog/paths";

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

  let body: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const parsed = z
    .object({
      catalogVersion: z.string().max(80).optional(),
      catalogChanged: z.boolean().optional().default(false),
      changedModelIds: z
        .array(z.string().refine(isSafeModelId))
        .max(1000)
        .optional()
        .default([]),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid catalog revalidation request" },
      { status: 400 },
    );
  }

  revalidateTag(PRICING_PAGE_CACHE_TAG, { expire: 0 });
  if (parsed.data.catalogChanged || parsed.data.changedModelIds.length > 0) {
    revalidateTag(MODEL_CATALOG_CACHE_TAG, { expire: 0 });
    revalidatePath("/api-pricing");
  }
  revalidatePath("/");
  revalidatePath("/china-ai-subscriptions");
  revalidatePath("/[landingSlug]", "page");
  revalidatePath("/sitemap.xml");
  for (const modelId of parsed.data.changedModelIds) {
    revalidateTag(modelCacheTag(modelId), { expire: 0 });
    revalidatePath(modelDetailPath(modelId));
  }

  await Promise.all([warmPricingPageData(), loadLandingCatalogSnapshot()]);
  const versions = await Promise.all(
    (["global", "china-subscription", "api"] as const).map(async (mode) => ({
      mode,
      version: (await loadCachedPricingPageData(mode)).lastCheckedAt ?? null,
    })),
  );

  return NextResponse.json({
    revalidated: true,
    versions,
    catalogVersion: parsed.data.catalogVersion ?? null,
    catalogChanged: parsed.data.catalogChanged,
    changedModelIds: parsed.data.changedModelIds,
  });
}
