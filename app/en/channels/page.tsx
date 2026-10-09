import type { Metadata } from "next";
import {
  ChannelsPage,
  type PublicDirectorySearchParams,
} from "@/components/channels-page";
import { channelsPageMetadata } from "@/components/channels-page";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: PublicDirectorySearchParams;
}): Promise<Metadata> {
  const metadata = channelsPageMetadata("en");
  await searchParams;
  return { ...metadata, robots: { index: false, follow: true } };
}

export default function EnglishChannelsRoute({
  searchParams,
}: {
  searchParams: PublicDirectorySearchParams;
}) {
  return <ChannelsPage locale="en" searchParams={searchParams} />;
}
