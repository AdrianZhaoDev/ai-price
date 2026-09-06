import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ApiTransitDetailPage,
  apiTransitDetailMetadata,
} from "@/components/api-transit-detail-page";
import { loadTransitDetail } from "@/lib/transit/detail";
import { isPublicDirectoryIndexingEnabled } from "@/lib/public-data/indexing";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await loadTransitDetail(slug);
  if (!detail) return {};
  const metadata = apiTransitDetailMetadata("en", detail.station.slug);
  return isPublicDirectoryIndexingEnabled()
    ? metadata
    : { ...metadata, robots: { index: false, follow: true } };
}

export default async function EnglishApiTransitDetailRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await loadTransitDetail(slug);
  if (!detail) notFound();
  return <ApiTransitDetailPage locale="en" {...detail} />;
}
