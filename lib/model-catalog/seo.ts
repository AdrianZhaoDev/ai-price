import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import type { ModelDetail } from "@/lib/model-catalog/types";
import { isSearchEligibleModelSummary } from "@/lib/model-catalog/discovery";
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

export function modelDecisionNotes(
  model: ModelDetail,
  locale: Locale = "zh-CN",
): string[] {
  const context = model.context?.toLocaleString(
    locale === "en" ? "en-US" : "zh-CN",
  );
  const output = model.output?.toLocaleString(
    locale === "en" ? "en-US" : "zh-CN",
  );
  const enabledCapabilities = [
    model.capabilities.reasoning
      ? locale === "en"
        ? "reasoning"
        : "推理"
      : undefined,
    model.capabilities.toolCall
      ? locale === "en"
        ? "tool calling"
        : "工具调用"
      : undefined,
    model.capabilities.structuredOutput
      ? locale === "en"
        ? "structured output"
        : "结构化输出"
      : undefined,
    model.capabilities.attachment
      ? locale === "en"
        ? "attachments"
        : "附件"
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const modalities = model.inputModalities.join(" / ");
  const updated = (model.detailChangedAt ?? model.updatedDate).slice(0, 10);

  if (locale === "en") {
    return [
      context || output
        ? `${model.name} offers${context ? ` a ${context}-token context window` : ""}${output ? ` and up to ${output} output tokens` : ""}; compare those limits with the size of your prompts and expected responses.`
        : `${model.name} does not expose complete context and output limits in the current catalog, so confirm workload limits with the serving provider.`,
      enabledCapabilities.length
        ? `The catalog marks ${enabledCapabilities.join(", ")} as supported. Its recorded input modalities are ${modalities || "not specified"}.`
        : `No optional capability is confirmed in the current catalog. Its recorded input modalities are ${modalities || "not specified"}.`,
      `There are ${model.providerIds.length} active serving options in this snapshot. Compare provider status, model ID, context limits, and both input and output prices before choosing one. Data last changed on ${updated}.`,
    ];
  }

  return [
    context || output
      ? `${model.name}${context ? `提供 ${context} tokens 上下文` : ""}${output ? `、最大输出 ${output} tokens` : ""}；选择前应把这些限制与提示词长度和预期回复规模对应起来。`
      : `${model.name} 当前目录未提供完整上下文和输出上限，实际工作负载限制需要向服务商再次确认。`,
    enabledCapabilities.length
      ? `目录已标记支持${enabledCapabilities.join("、")}，记录的输入模态为${modalities || "未说明"}。`
      : `当前目录没有确认额外能力，记录的输入模态为${modalities || "未说明"}。`,
    `本快照包含 ${model.providerIds.length} 个有效服务选项。选择前应同时比较服务状态、模型 ID、上下文限制以及输入和输出单价；数据最近变更于 ${updated}。`,
  ];
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
    robots: isSearchEligibleModelSummary(model)
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
