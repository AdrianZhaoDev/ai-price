import { ModelDetailPage } from "@/components/model-detail-page";
import { loadCachedModelDetail } from "@/lib/model-catalog/cache";
import { metadataForModel } from "@/lib/model-catalog/seo";
import { modelIdFromPath } from "@/lib/model-catalog/paths";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const revalidate = false;
export const dynamic = "force-dynamic";
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ modelPath: string[] }>;
}): Promise<Metadata> {
  const { modelPath } = await params;
  const model = await loadCachedModelDetail(modelIdFromPath(modelPath));
  return model ? metadataForModel(model, "zh-CN") : {};
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ modelPath: string[] }>;
}) {
  const { modelPath } = await params;
  const model = await loadCachedModelDetail(modelIdFromPath(modelPath));
  if (!model) notFound();
  return <ModelDetailPage model={model} locale="zh-CN" />;
}
