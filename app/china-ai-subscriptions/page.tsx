import { PricingPage } from "@/components/pricing-page";
import { metadataForMode } from "@/lib/seo";

export const revalidate = 900;
export const metadata = metadataForMode("china-subscription");

export default function ChinaAiSubscriptionsPage() {
  return <PricingPage mode="china-subscription" />;
}
