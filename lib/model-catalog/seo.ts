import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import type { ModelDetail } from "@/lib/model-catalog/types";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

type ModelSeoIdentity = Pick<ModelDetail, "id" | "name">;
type ModelSeoSummary = Pick<ModelDetail, "id" | "name" | "description">;

export function modelSeoTitle(
  model: ModelSeoIdentity,
  locale: Locale = "zh-CN",
): string {
  return locale === "en"
    ? `${model.name} (${model.id}) API prices and model specifications`
    : `${model.name}（${model.id}）API 价格与模型规格`;
}

export function modelSeoDescription(
  model: ModelSeoSummary,
  locale: Locale = "zh-CN",
): string {
  return [
    locale === "en" ? `Model ID: ${model.id}.` : `模型 ID：${model.id}。`,
    model.description,
    locale === "en"
      ? `Compare ${model.name} context, output limits, modalities, capabilities, and API prices by provider.`
      : `查看 ${model.name} 的上下文、最大输出、输入输出模态、能力与各提供商 API 价格。`,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 180);
}

export function metadataForModel(
  model: ModelDetail,
  locale: Locale = "zh-CN",
): Metadata {
  const path = modelDetailPath(model.id, locale);
  const title = modelSeoTitle(model, locale);
  const description = modelSeoDescription(model, locale);
  const imageUrl = absoluteUrl("/og.png");

  return {
    title,
    description,
    keywords: [
      model.name,
      model.id,
      locale === "en" ? `${model.name} API price` : `${model.name} API 价格`,
      locale === "en" ? `${model.labName} model` : `${model.labName} 模型`,
      locale === "en" ? "AI model API prices" : "AI 模型 API 价格",
      model.family,
    ].filter((value): value is string => Boolean(value)),
    alternates: {
      canonical: path,
      languages: {
        "zh-CN": modelDetailPath(model.id, "zh-CN"),
        en: modelDetailPath(model.id, "en"),
        "x-default": modelDetailPath(model.id, "zh-CN"),
      },
    },
    robots: model.active ? undefined : { index: false, follow: true },
    openGraph: {
      type: "article",
      locale: locale === "en" ? "en_US" : "zh_CN",
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      publishedTime: model.releaseDate,
      modifiedTime: model.detailChangedAt ?? model.updatedDate,
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
