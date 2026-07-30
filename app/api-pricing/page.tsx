import { PricingPage } from "@/components/pricing-page";
import { metadataForMode } from "@/lib/seo";

export const revalidate = 900;
export const metadata = metadataForMode("api");

export default function ApiPricingPage() {
  return <PricingPage mode="api" />;
}
