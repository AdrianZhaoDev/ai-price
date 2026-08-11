import { PricingPage } from "@/components/pricing-page";
import { metadataForMode } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = metadataForMode("global", "en");

export default async function EnglishHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PricingPage
      mode="global"
      locale="en"
      query={{
        providerId:
          typeof params.provider === "string" ? params.provider : undefined,
        planId: typeof params.plan === "string" ? params.plan : undefined,
      }}
    />
  );
}
