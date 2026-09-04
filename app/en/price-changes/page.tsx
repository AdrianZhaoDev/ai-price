import { PriceChangesPage } from "@/components/price-changes-page";
import { metadataForDocument } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = metadataForDocument({
  path: "/price-changes",
  title: "AI Subscription Price Changes and History",
  description:
    "Confirmed original-currency AI subscription price changes with official sources, confirmation dates, RSS, CSV and JSON.",
  locale: "en",
  keywords: [
    "AI subscription price history",
    "AI price changes",
    "subscription price RSS",
  ],
});
export default function Page() {
  return <PriceChangesPage locale="en" />;
}
