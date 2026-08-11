import { PricingPage } from "@/components/pricing-page";
import { metadataForMode } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = metadataForMode("china-subscription", "en");

export default async function EnglishChinaAiSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PricingPage
      mode="china-subscription"
      locale="en"
      query={{
        providerId:
          typeof params.provider === "string" ? params.provider : undefined,
      }}
    />
  );
}
