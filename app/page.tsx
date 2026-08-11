import { PricingPage } from "@/components/pricing-page";
import { metadataForMode } from "@/lib/seo";

// CI builds do not have production database access. Render pricing routes on
// the server so a verified artifact never ships the seed catalog as live data.
export const dynamic = "force-dynamic";
export const metadata = metadataForMode("global");

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PricingPage
      mode="global"
      locale="zh-CN"
      query={{
        providerId:
          typeof params.provider === "string" ? params.provider : undefined,
        planId: typeof params.plan === "string" ? params.plan : undefined,
      }}
    />
  );
}
