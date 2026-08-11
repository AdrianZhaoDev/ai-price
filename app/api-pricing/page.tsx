import { ApiPricingPage } from "@/components/api-pricing-page";
import { metadataForMode } from "@/lib/seo";
import type { Metadata } from "next";

export const revalidate = false;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const metadata = metadataForMode("api", "zh-CN");
  return Object.keys(params).length > 0
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export default function ApiPricingRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ApiPricingPage locale="zh-CN" searchParams={searchParams} />;
}
