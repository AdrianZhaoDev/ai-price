import { SubscriptionResultPage } from "@/components/subscription-result-page";
import { getMessages } from "@/lib/i18n";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: getMessages("en").result.statusTitle,
  robots: { index: false, follow: false },
};

export default async function EnglishSubscriptionResultRoute({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return <SubscriptionResultPage status={status} locale="en" />;
}
