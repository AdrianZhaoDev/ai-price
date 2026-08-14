import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import type { ModelDetail } from "@/lib/model-catalog/types";
import { isIndexableModelSummary } from "@/lib/model-catalog/discovery";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { absoluteUrl, normalizeSeoDescription, SITE_NAME } from "@/lib/seo";

type ModelSeoIdentity = Pick<ModelDetail, "id" | "name">;
type ModelSeoSummary = Pick<ModelDetail, "id" | "name" | "description">;

export const MODEL_TITLE_MAX_LENGTH = 60;
export const MODEL_DESCRIPTION_MAX_LENGTH = 155;

function stableIdSuffix(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function compactModelId(id: string, maxLength: number): string {
  if (id.length <= maxLength) return id;
  const lab = id.split("/")[0] ?? "model";
  const hash = stableIdSuffix(id);
  const fixedLength = lab.length + hash.length + 3;
  if (fixedLength >= maxLength) {
    return `${truncate(lab, Math.max(3, maxLength - hash.length - 1))}#${hash}`;
  }
  const tailLength = maxLength - fixedLength;
  return `${lab}/…${id.slice(-tailLength)}#${hash}`;
}

export function modelSeoTitle(
  model: ModelSeoIdentity,
  locale: Locale = "zh-CN",
): string {
  const suffix = locale === "en" ? " API Prices" : " API 价格";
  const name = truncate(model.name, 26);
  const idBudget = Math.max(
    12,
    MODEL_TITLE_MAX_LENGTH - name.length - suffix.length - 3,
  );
  return `${name} · ${compactModelId(model.id, idBudget)}${suffix}`;
}

export function modelSeoDescription(
  model: ModelSeoSummary,
  locale: Locale = "zh-CN",
): string {
  const description = [
    locale === "en" ? `Model ID: ${model.id}.` : `模型 ID：${model.id}。`,
    model.description,
    locale === "en"
      ? `Compare ${model.name} context, output limits, modalities, capabilities, and API prices by provider.`
      : `查看 ${model.name} 的上下文、最大输出、输入输出模态、能力与各提供商 API 价格。`,
    locale === "en"
      ? "Includes source attribution and the latest catalog change."
      : "包含来源说明与最近目录变更。",
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeSeoDescription(description, locale);
}

export function modelSnapshotSummary(
  model: ModelDetail,
  locale: Locale = "zh-CN",
): string {
  const context = model.context?.toLocaleString(
    locale === "en" ? "en-US" : "zh-CN",
  );
  const inputPrice = model.minInputPrice?.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
  const outputPrice = model.minOutputPrice?.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
  const updated = (model.detailChangedAt ?? model.updatedDate).slice(0, 10);

  if (locale === "en") {
    const priceParts = [
      inputPrice ? `input from $${inputPrice}` : undefined,
      outputPrice ? `output from $${outputPrice}` : undefined,
    ].filter((value): value is string => Boolean(value));
    const prices = priceParts.length
      ? ` Non-zero API prices per million tokens: ${priceParts.join(", ")}.`
      : "";
    return `${model.labName}'s ${model.name} (${model.id})${model.family ? ` belongs to the ${model.family} family` : ""}. This snapshot compares ${model.providerIds.length} active providers${context ? ` and a ${context}-token context window` : ""}.${prices} Last catalog change: ${updated}.`;
  }

  return `${model.labName} 的 ${model.name}（${model.id}）${model.family ? `属于 ${model.family} 系列，` : ""}当前汇总 ${model.providerIds.length} 个有效提供商${context ? `、${context} tokens 上下文` : ""}${inputPrice ? `、每百万 tokens 最低非零输入价 $${inputPrice}` : ""}${outputPrice ? `、最低非零输出价 $${outputPrice}` : ""}。最近目录变更：${updated}。`;
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
    title: { absolute: title },
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
    robots: isIndexableModelSummary(model)
      ? undefined
      : { index: false, follow: true },
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
