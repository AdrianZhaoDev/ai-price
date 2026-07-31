import { LandingPage } from "@/components/landing-page";
import {
  landingPageBySlug,
  landingPages,
  metadataForLandingPage,
} from "@/lib/landing-pages";
import { loadLandingPageData } from "@/lib/landing-page-data";
import { notFound } from "next/navigation";
import { cache } from "react";

export const dynamic = "force-dynamic";

const loadLandingRoute = cache(async (landingSlug: string) => {
  const page = landingPageBySlug.get(landingSlug);
  if (!page) return undefined;
  return loadLandingPageData(page);
});

export function generateStaticParams() {
  return landingPages.map((page) => ({ landingSlug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ landingSlug: string }>;
}) {
  const { landingSlug } = await params;
  const data = await loadLandingRoute(landingSlug);
  return data ? metadataForLandingPage(data.page, data.quality.indexable) : {};
}

export default async function SeoLandingRoute({
  params,
}: {
  params: Promise<{ landingSlug: string }>;
}) {
  const { landingSlug } = await params;
  const data = await loadLandingRoute(landingSlug);
  if (!data) notFound();

  return <LandingPage data={data} />;
}
