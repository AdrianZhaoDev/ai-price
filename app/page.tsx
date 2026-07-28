import { PricingExplorer } from "@/components/pricing-explorer";
import { modes } from "@/lib/data/catalog";
import { loadProviderCatalog } from "@/lib/pricing/repository";

export const revalidate = 900;

export default async function HomePage() {
  const providers = await loadProviderCatalog();
  return (
    <PricingExplorer
      modes={modes}
      providers={providers}
      contactEmail={process.env.CONTACT_EMAIL ?? "price@example.com"}
    />
  );
}
