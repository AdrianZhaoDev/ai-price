import overlayData from "@/lib/data/model-catalog-overlay.json";
import type {
  ModelCapabilitySet,
  ModelCatalogOrigin,
  ModelCatalogSummary,
  ModelProviderOffering,
  NormalizedCatalog,
} from "@/lib/model-catalog/types";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { parse as parseToml } from "smol-toml";
import { extract } from "tar-stream";
import { z } from "zod";

const MODELS_DEV_REPOSITORY = "anomalyco/models.dev";
const MODELS_DEV_BRANCH = "dev";
const LAB_NAME_OVERRIDES: Record<string, string> = {
  alibaba: "Alibaba",
  anthropic: "Anthropic",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  google: "Google",
  meta: "Meta",
  minimax: "MiniMax",
  mistral: "Mistral AI",
  moonshotai: "Moonshot AI",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  perplexity: "Perplexity",
  poolside: "Poolside",
  stepfun: "StepFun",
  tencent: "Tencent",
  xai: "xAI",
  xiaomi: "Xiaomi",
  zhipuai: "Zhipu AI",
};

function labName(id: string, authored?: string): string {
  return (
    authored ??
    LAB_NAME_OVERRIDES[id] ??
    id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/);
const modalitiesSchema = z
  .object({
    input: z.array(z.string()).default([]),
    output: z.array(z.string()).default([]),
  })
  .partial()
  .default({});
const limitSchema = z
  .object({
    context: z.number().nonnegative().optional(),
    input: z.number().nonnegative().optional(),
    output: z.number().nonnegative().optional(),
  })
  .passthrough()
  .optional();
const costSchema = z
  .object({
    input: z.number().nonnegative().optional(),
    output: z.number().nonnegative().optional(),
  })
  .passthrough()
  .optional();
const modelShape = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    family: z.string().optional(),
    attachment: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    tool_call: z.boolean().optional(),
    structured_output: z.boolean().optional(),
    temperature: z.boolean().optional(),
    knowledge: dateSchema.optional(),
    release_date: dateSchema,
    last_updated: dateSchema,
    open_weights: z.boolean(),
    modalities: modalitiesSchema,
    limit: limitSchema,
    cost: costSchema,
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
  })
  .passthrough();
const authoredProviderModelShape = modelShape.partial().extend({
  base_model: z.string().min(1).optional(),
  base_model_omit: z.array(z.string()).optional(),
});
const providerShape = z
  .object({
    name: z.string().min(1),
    doc: z.string().optional(),
    api: z.string().optional(),
    npm: z.string().optional(),
  })
  .passthrough();

const overlaySchema = z.object({
  labs: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      override: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      doc: z.string().url().optional(),
      api: z.string().url().optional(),
      npm: z.string().optional(),
      override: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  ),
  models: z.array(
    z.object({
      id: z.string().min(3),
      data: modelShape,
      override: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  ),
  offerings: z.array(
    z.object({
      providerId: z.string().min(1),
      providerModelId: z.string().min(1),
      canonicalModelId: z.string().min(3),
      data: modelShape,
      sourceUrl: z.string().url(),
      override: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  ),
});

type ModelRecord = z.infer<typeof modelShape>;
type AuthoredProviderModel = z.infer<typeof authoredProviderModelShape>;
type ProviderRecord = z.infer<typeof providerShape>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function contentHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] =
      current &&
      value &&
      typeof current === "object" &&
      typeof value === "object" &&
      !Array.isArray(current) &&
      !Array.isArray(value)
        ? deepMerge(
            current as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : structuredClone(value);
  }
  return result;
}

function omitPaths(target: Record<string, unknown>, paths: string[]): void {
  for (const path of paths) {
    const parts = path.split(".");
    let current: Record<string, unknown> | undefined = target;
    for (const part of parts.slice(0, -1)) {
      const nextValue: unknown = current?.[part];
      current =
        nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)
          ? (nextValue as Record<string, unknown>)
          : undefined;
      if (!current) break;
    }
    if (current) delete current[parts.at(-1)!];
  }
}

function capabilities(model: ModelRecord): ModelCapabilitySet {
  return {
    attachment: model.attachment,
    reasoning: model.reasoning,
    toolCall: model.tool_call,
    structuredOutput: model.structured_output,
    temperature: model.temperature,
  };
}

function stripArchiveRoot(name: string): string | null {
  const normalized = name.replaceAll("\\", "/");
  if (normalized.includes("../") || normalized.startsWith("/")) return null;
  const slash = normalized.indexOf("/");
  return slash === -1 ? null : normalized.slice(slash + 1);
}

async function tarEntries(buffer: Buffer): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const parser = extract();
  const completed = new Promise<void>((resolve, reject) => {
    parser.on("entry", (header, stream, next) => {
      const path = stripArchiveRoot(header.name);
      const relevant =
        path?.startsWith("models/") ||
        path?.startsWith("labs/") ||
        path?.startsWith("providers/");
      const chunks: Buffer[] = [];
      stream.on(
        "data",
        (chunk: Buffer) => relevant && chunks.push(Buffer.from(chunk)),
      );
      stream.on("end", () => {
        if (relevant && path && header.type === "file")
          files.set(path, Buffer.concat(chunks).toString("utf8"));
        next();
      });
      stream.on("error", reject);
      stream.resume();
    });
    parser.on("finish", resolve);
    parser.on("error", reject);
  });
  parser.end(gunzipSync(buffer));
  await completed;
  return files;
}

function tomlId(path: string, prefix: string): string {
  return path.slice(prefix.length, -".toml".length);
}

function requireOverride(
  item: { override?: boolean; reason?: string },
  identity: string,
): void {
  if (!item.override || !item.reason?.trim())
    throw new Error(
      `Overlay conflict for ${identity}; override and reason are required.`,
    );
}

export async function fetchModelsDevCatalog(
  fetchImplementation: typeof fetch = fetch,
): Promise<NormalizedCatalog> {
  const commitResponse = await fetchImplementation(
    `https://api.github.com/repos/${MODELS_DEV_REPOSITORY}/commits/${MODELS_DEV_BRANCH}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "low-price-radar-model-catalog",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!commitResponse.ok)
    throw new Error(
      `models.dev commit lookup failed with HTTP ${commitResponse.status}.`,
    );
  const commit = z
    .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
    .parse(await commitResponse.json());
  const archiveResponse = await fetchImplementation(
    `https://codeload.github.com/${MODELS_DEV_REPOSITORY}/tar.gz/${commit.sha}`,
    {
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!archiveResponse.ok)
    throw new Error(
      `models.dev archive download failed with HTTP ${archiveResponse.status}.`,
    );
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  const files = await tarEntries(archive);
  return normalizeCatalogFiles(files, commit.sha, new Date().toISOString());
}

export function normalizeCatalogFiles(
  files: Map<string, string>,
  version: string,
  fetchedAt: string,
  overlayInput: unknown = overlayData,
): NormalizedCatalog {
  const canonical = new Map<
    string,
    { data: ModelRecord; origin: ModelCatalogOrigin }
  >();
  const labs = new Map<
    string,
    { name: string; description?: string; origin: ModelCatalogOrigin }
  >();
  const providers = new Map<
    string,
    { data: ProviderRecord; origin: ModelCatalogOrigin }
  >();
  const providerModels: Array<{
    providerId: string;
    modelId: string;
    data: AuthoredProviderModel;
    origin: ModelCatalogOrigin;
    sourceUrl?: string;
  }> = [];

  for (const [path, raw] of files) {
    if (path.startsWith("models/") && path.endsWith(".toml")) {
      const id = tomlId(path, "models/");
      canonical.set(id, {
        data: modelShape.parse(parseToml(raw)),
        origin: "models.dev",
      });
    } else if (/^labs\/[^/]+\/(?:lab|provider)\.toml$/.test(path)) {
      const id = path.split("/")[1]!;
      const data = z
        .object({
          name: z.string().optional(),
          description: z.string().optional(),
        })
        .passthrough()
        .parse(parseToml(raw));
      labs.set(id, {
        name: labName(id, data.name),
        description: data.description,
        origin: "models.dev",
      });
    } else if (/^providers\/[^/]+\/provider\.toml$/.test(path)) {
      const id = path.split("/")[1]!;
      providers.set(id, {
        data: providerShape.parse(parseToml(raw)),
        origin: "models.dev",
      });
    } else if (/^providers\/[^/]+\/models\/.+\.toml$/.test(path)) {
      const parts = path.split("/");
      providerModels.push({
        providerId: parts[1]!,
        modelId: parts.slice(3).join("/").slice(0, -5),
        data: authoredProviderModelShape.parse(parseToml(raw)),
        origin: "models.dev",
      });
    }
  }

  const overlay = overlaySchema.parse(overlayInput);
  for (const item of overlay.labs) {
    if (labs.has(item.id)) requireOverride(item, `lab:${item.id}`);
    labs.set(item.id, {
      name: item.name,
      description: item.description,
      origin: "local_overlay",
    });
  }
  for (const item of overlay.providers) {
    if (providers.has(item.id)) requireOverride(item, `provider:${item.id}`);
    providers.set(item.id, {
      data: providerShape.parse(item),
      origin: "local_overlay",
    });
  }
  for (const item of overlay.models) {
    if (canonical.has(item.id)) requireOverride(item, `model:${item.id}`);
    canonical.set(item.id, { data: item.data, origin: "local_overlay" });
  }
  for (const item of overlay.offerings) {
    const existing = providerModels.find(
      (entry) =>
        entry.providerId === item.providerId &&
        entry.modelId === item.providerModelId,
    );
    if (existing) {
      requireOverride(
        item,
        `offering:${item.providerId}/${item.providerModelId}`,
      );
      providerModels.splice(providerModels.indexOf(existing), 1);
    }
    providerModels.push({
      providerId: item.providerId,
      modelId: item.providerModelId,
      data: { ...item.data, base_model: item.canonicalModelId },
      origin: "local_overlay",
      sourceUrl: item.sourceUrl,
    });
  }

  for (const id of canonical.keys()) {
    const labId = id.split("/")[0]!;
    if (!labs.has(labId))
      labs.set(labId, {
        name: labName(labId),
        origin: canonical.get(id)!.origin,
      });
  }

  const offeringsByCanonical = new Map<string, ModelProviderOffering[]>();
  let unlinkedProviderModels = 0;
  for (const entry of providerModels) {
    const provider = providers.get(entry.providerId);
    if (!provider)
      throw new Error(`Provider metadata is missing for ${entry.providerId}.`);
    const baseId = entry.data.base_model;
    const canonicalId =
      (baseId && canonical.has(baseId) ? baseId : undefined) ??
      (canonical.has(entry.modelId) ? entry.modelId : undefined) ??
      (canonical.has(`${entry.providerId}/${entry.modelId}`)
        ? `${entry.providerId}/${entry.modelId}`
        : undefined);
    if (!canonicalId) {
      unlinkedProviderModels += 1;
      continue;
    }
    const base = structuredClone(canonical.get(canonicalId)!.data) as Record<
      string,
      unknown
    >;
    const {
      base_model: _baseModel,
      base_model_omit: omit = [],
      ...overrides
    } = entry.data;
    void _baseModel;
    omitPaths(base, omit);
    const merged = deepMerge(base, overrides as Record<string, unknown>);
    const model = modelShape.parse(merged);
    const offering: ModelProviderOffering = {
      providerId: entry.providerId,
      providerName: provider.data.name,
      providerModelId: entry.modelId,
      canonicalModelId: canonicalId,
      labName:
        labs.get(canonicalId.split("/")[0]!)?.name ??
        canonicalId.split("/")[0]!,
      context: model.limit?.context,
      output: model.limit?.output,
      inputPrice: model.cost?.input,
      outputPrice: model.cost?.output,
      status: model.status,
      capabilities: capabilities(model),
      inputModalities: model.modalities.input ?? [],
      outputModalities: model.modalities.output ?? [],
      costDetails: model.cost as Record<string, unknown> | undefined,
      sourceUrl: entry.sourceUrl ?? provider.data.doc,
      origin: entry.origin,
    };
    const list = offeringsByCanonical.get(canonicalId) ?? [];
    list.push(offering);
    offeringsByCanonical.set(canonicalId, list);
  }

  const normalizedModels = [...canonical.entries()].map(([id, record]) => {
    const labId = id.split("/")[0]!;
    const lab = labs.get(labId)!;
    const allOfferings = (offeringsByCanonical.get(id) ?? []).sort((a, b) =>
      a.providerName.localeCompare(b.providerName),
    );
    const activeOfferings = allOfferings.filter(
      (item) => item.status !== "alpha" && item.status !== "deprecated",
    );
    const minInput = activeOfferings
      .filter((item) => item.inputPrice !== undefined)
      .sort((a, b) => a.inputPrice! - b.inputPrice!)[0];
    const minOutput = activeOfferings
      .filter((item) => item.outputPrice !== undefined)
      .sort((a, b) => a.outputPrice! - b.outputPrice!)[0];
    const providerFacets = [
      ...new Map(
        activeOfferings.map((offering) => [
          offering.providerId,
          offering.providerName,
        ]),
      ).entries(),
    ].sort((a, b) => a[1].localeCompare(b[1]));
    const summary: ModelCatalogSummary = {
      id,
      name: record.data.name,
      description: record.data.description,
      labId,
      labName: lab.name,
      family: record.data.family,
      context: record.data.limit?.context,
      output: record.data.limit?.output,
      inputModalities: record.data.modalities.input ?? [],
      minInputPrice: minInput?.inputPrice,
      minInputProviderId: minInput?.providerId,
      minInputProviderName: minInput?.providerName,
      minOutputPrice: minOutput?.outputPrice,
      minOutputProviderId: minOutput?.providerId,
      minOutputProviderName: minOutput?.providerName,
      releaseDate: record.data.release_date,
      updatedDate: record.data.last_updated,
      providerCount: providerFacets.length,
      providerIds: providerFacets.map(([providerId]) => providerId),
      providerNames: providerFacets.map(([, providerName]) => providerName),
      active: true,
      origin: record.origin,
    };
    const detail = {
      summary,
      knowledge: record.data.knowledge,
      openWeights: record.data.open_weights,
      outputModalities: record.data.modalities.output ?? [],
      capabilities: capabilities(record.data),
      providers: allOfferings,
    };
    return { ...detail, contentHash: contentHash(detail) };
  });
  normalizedModels.sort(
    (a, b) =>
      b.summary.releaseDate.localeCompare(a.summary.releaseDate) ||
      a.summary.name.localeCompare(b.summary.name),
  );

  return {
    version,
    contentHash: contentHash({
      labs: [...labs.entries()],
      providers: [...providers.entries()],
      models: normalizedModels.map((item) => item.contentHash),
    }),
    fetchedAt,
    labs: [...labs.entries()].map(([id, item]) => ({ id, ...item })),
    providers: [...providers.entries()].map(([id, item]) => ({
      id,
      ...item.data,
      origin: item.origin,
    })),
    models: normalizedModels,
    unlinkedProviderModels,
  };
}
