import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ApiTransitDetailPage,
  apiTransitDetailMetadata,
} from "@/components/api-transit-detail-page";
import { getTransitStationBySlug } from "@/lib/transit/repository";
import { isPublicDirectoryIndexingEnabled } from "@/lib/public-data/indexing";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const station = await getTransitStationBySlug(slug);
  if (!station) return {};
  const metadata = apiTransitDetailMetadata("zh-CN", station.slug);
  return isPublicDirectoryIndexingEnabled()
    ? metadata
    : { ...metadata, robots: { index: false, follow: true } };
}

export default async function ApiTransitDetailRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const station = await getTransitStationBySlug(slug);
  if (!station) notFound();
  return <ApiTransitDetailPage locale="zh-CN" slug={station.slug} />;
}
