import type { Metadata } from "next";
import {
  ApiTransitPage,
  apiTransitPageMetadata,
} from "@/components/api-transit-page";
import type { PublicDirectorySearchParams } from "@/components/channels-page";
import { isPublicDirectoryIndexingEnabled } from "@/lib/public-data/indexing";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: PublicDirectorySearchParams;
}): Promise<Metadata> {
  const metadata = apiTransitPageMetadata("zh-CN");
  const params = await searchParams;
  return Object.keys(params).length || !isPublicDirectoryIndexingEnabled()
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export default function ApiTransitRoute({
  searchParams,
}: {
  searchParams: PublicDirectorySearchParams;
}) {
  return <ApiTransitPage locale="zh-CN" searchParams={searchParams} />;
}
