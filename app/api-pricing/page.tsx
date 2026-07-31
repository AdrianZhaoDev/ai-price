import { PricingPage } from "@/components/pricing-page";
import { metadataForMode } from "@/lib/seo";

// CI builds do not have production database access. Render pricing routes on
// the server so a verified artifact never ships the seed catalog as live data.
export const dynamic = "force-dynamic";
export const metadata = metadataForMode("api");

export default function ApiPricingPage() {
  return <PricingPage mode="api" />;
}
