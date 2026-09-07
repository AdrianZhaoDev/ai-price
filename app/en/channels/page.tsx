import type { Metadata } from "next";
import {
  ChannelsPage,
  type PublicDirectorySearchParams,
} from "@/components/channels-page";
import { channelsPageMetadata } from "@/components/channels-page";
import { isPublicDirectoryIndexingEnabled } from "@/lib/public-data/indexing";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: PublicDirectorySearchParams;
}): Promise<Metadata> {
  const metadata = channelsPageMetadata("en");
  const params = await searchParams;
  return Object.keys(params).length || !isPublicDirectoryIndexingEnabled()
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export default function EnglishChannelsRoute({
  searchParams,
}: {
  searchParams: PublicDirectorySearchParams;
}) {
  return <ChannelsPage locale="en" searchParams={searchParams} />;
}
