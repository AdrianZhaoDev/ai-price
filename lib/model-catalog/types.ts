export type ModelCatalogOrigin = "models.dev" | "local_overlay";

export type ModelCapabilitySet = {
  attachment?: boolean;
  reasoning?: boolean;
  toolCall?: boolean;
  structuredOutput?: boolean;
  temperature?: boolean;
};

export type ModelCatalogSummary = {
  id: string;
  name: string;
  description?: string;
  labId: string;
  labName: string;
  family?: string;
  context?: number;
  output?: number;
  inputModalities: string[];
  minInputPrice?: number;
  minInputProviderId?: string;
  minInputProviderName?: string;
  hasZeroInputPrice?: boolean;
  minOutputPrice?: number;
  minOutputProviderId?: string;
  minOutputProviderName?: string;
  hasZeroOutputPrice?: boolean;
  releaseDate: string;
  updatedDate: string;
  providerCount: number;
  providerIds: string[];
  providerNames: string[];
  active: boolean;
  origin: ModelCatalogOrigin;
  detailChangedAt?: string;
};

export type ModelProviderOffering = {
  providerId: string;
  providerName: string;
  providerModelId: string;
  canonicalModelId: string;
  labName: string;
  context?: number;
  output?: number;
  inputPrice?: number;
  outputPrice?: number;
  status?: "alpha" | "beta" | "deprecated";
  capabilities: ModelCapabilitySet;
  inputModalities: string[];
  outputModalities: string[];
  costDetails?: Record<string, unknown>;
  sourceUrl?: string;
  origin: ModelCatalogOrigin;
};

export type ModelDetail = ModelCatalogSummary & {
  knowledge?: string;
  openWeights: boolean;
  outputModalities: string[];
  capabilities: ModelCapabilitySet;
  providers: ModelProviderOffering[];
  catalogVersion: string;
  sourceUrl: string;
};

export type ModelCatalogFilters = {
  query?: string;
  hideZeroPrice?: boolean;
  labs?: string[];
  providers?: string[];
  contextMin?: number;
  outputMin?: number;
  inputModalities?: string[];
  inputPriceMax?: number;
  outputPriceMax?: number;
  releaseFrom?: string;
  releaseTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sort?:
    | "model"
    | "lab"
    | "context"
    | "output"
    | "input"
    | "price_input"
    | "price_output"
    | "release"
    | "updated";
  direction?: "asc" | "desc";
};

export type NormalizedCatalog = {
  version: string;
  contentHash: string;
  fetchedAt: string;
  labs: Array<{
    id: string;
    name: string;
    description?: string;
    origin: ModelCatalogOrigin;
  }>;
  providers: Array<{
    id: string;
    name: string;
    doc?: string;
    api?: string;
    npm?: string;
    origin: ModelCatalogOrigin;
  }>;
  models: Array<{
    summary: ModelCatalogSummary;
    knowledge?: string;
    openWeights: boolean;
    outputModalities: string[];
    capabilities: ModelCapabilitySet;
    providers: ModelProviderOffering[];
    contentHash: string;
  }>;
  unlinkedProviderModels: number;
};

export type ModelCatalogImportResult = {
  importId: string;
  changed: boolean;
  catalogVersion: string;
  modelCount: number;
  providerCount: number;
  offeringCount: number;
  changedModelIds: string[];
  addedModelIds: string[];
};
