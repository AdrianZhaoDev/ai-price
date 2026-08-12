import type { ModelCatalogFilters, ModelCatalogSummary } from "./types";

type ModelCatalogSort = NonNullable<ModelCatalogFilters["sort"]>;

export const DEFAULT_MODEL_CATALOG_FILTERS: ModelCatalogFilters = {
  hideZeroPrice: true,
  sort: "price_input",
  direction: "asc",
};

export function parseOptionalNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function catalogDateStart(value: string): string {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
}

export function catalogDateEnd(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${value}-${String(day).padStart(2, "0")}`;
}

function defaultDirection(sort: ModelCatalogSort): "asc" | "desc" {
  return ["model", "lab", "input", "price_input"].includes(sort)
    ? "asc"
    : "desc";
}

function compareOptional(
  a: number | undefined,
  b: number | undefined,
  direction: "asc" | "desc",
) {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return (a - b) * (direction === "asc" ? 1 : -1);
}

export function filterAndSortModelCatalog(
  models: ModelCatalogSummary[],
  filters: ModelCatalogFilters,
): ModelCatalogSummary[] {
  return models
    .filter((model) => {
      const query = filters.query?.trim().toLowerCase();
      if (
        query &&
        !`${model.name} ${model.id} ${model.labName} ${model.description ?? ""}`
          .toLowerCase()
          .includes(query)
      )
        return false;
      if (
        filters.hideZeroPrice !== false &&
        (model.minInputPrice === 0 ||
          model.minOutputPrice === 0 ||
          (model.minInputPrice === undefined && model.hasZeroInputPrice) ||
          (model.minOutputPrice === undefined && model.hasZeroOutputPrice))
      )
        return false;
      if (filters.labs?.length && !filters.labs.includes(model.labId))
        return false;
      if (
        filters.providers?.length &&
        !filters.providers.some((id) => model.providerIds.includes(id))
      )
        return false;
      if (
        filters.contextMin !== undefined &&
        (model.context ?? -1) < filters.contextMin
      )
        return false;
      if (
        filters.outputMin !== undefined &&
        (model.output ?? -1) < filters.outputMin
      )
        return false;
      if (
        filters.inputModalities?.length &&
        !filters.inputModalities.every((item) =>
          model.inputModalities.includes(item),
        )
      )
        return false;
      if (
        filters.inputPriceMax !== undefined &&
        (model.minInputPrice === undefined ||
          model.minInputPrice > filters.inputPriceMax)
      )
        return false;
      if (
        filters.outputPriceMax !== undefined &&
        (model.minOutputPrice === undefined ||
          model.minOutputPrice > filters.outputPriceMax)
      )
        return false;
      if (
        filters.releaseFrom &&
        catalogDateEnd(model.releaseDate) < filters.releaseFrom
      )
        return false;
      if (
        filters.releaseTo &&
        catalogDateStart(model.releaseDate) > filters.releaseTo
      )
        return false;
      if (
        filters.updatedFrom &&
        catalogDateEnd(model.updatedDate) < filters.updatedFrom
      )
        return false;
      if (
        filters.updatedTo &&
        catalogDateStart(model.updatedDate) > filters.updatedTo
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const direction = filters.direction ?? "asc";
      const sign = direction === "asc" ? 1 : -1;
      const sort = filters.sort ?? "price_input";
      if (sort === "context" || sort === "output")
        return compareOptional(a[sort], b[sort], direction);
      if (sort === "price_input")
        return compareOptional(a.minInputPrice, b.minInputPrice, direction);
      if (sort === "price_output")
        return compareOptional(a.minOutputPrice, b.minOutputPrice, direction);
      const left =
        sort === "model"
          ? a.name
          : sort === "lab"
            ? a.labName
            : sort === "input"
              ? a.inputModalities.join(",")
              : sort === "updated"
                ? a.updatedDate
                : a.releaseDate;
      const right =
        sort === "model"
          ? b.name
          : sort === "lab"
            ? b.labName
            : sort === "input"
              ? b.inputModalities.join(",")
              : sort === "updated"
                ? b.updatedDate
                : b.releaseDate;
      return left.localeCompare(right) * sign;
    });
}

export function parseModelCatalogFilters(
  params: Record<string, string | string[] | undefined>,
): ModelCatalogFilters {
  const stringValue = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const requestedSort = stringValue("sort");
  const requestedDirection = stringValue("direction");
  const validSorts = new Set<NonNullable<ModelCatalogFilters["sort"]>>([
    "model",
    "lab",
    "context",
    "output",
    "input",
    "price_input",
    "price_output",
    "release",
    "updated",
  ]);
  const sort = validSorts.has(requestedSort as ModelCatalogSort)
    ? (requestedSort as ModelCatalogSort)
    : "price_input";
  const direction =
    requestedDirection === "asc" || requestedDirection === "desc"
      ? requestedDirection
      : defaultDirection(sort);
  return {
    query: stringValue("q") ?? stringValue("model"),
    hideZeroPrice: stringValue("hideZero") !== "0",
    labs: stringValue("lab")?.split(",").filter(Boolean),
    providers: stringValue("provider")
      ?.split(",")
      .filter(Boolean)
      .map((id) => id.replace(/-api$/, "")),
    contextMin: parseOptionalNumber(stringValue("contextMin")),
    outputMin: parseOptionalNumber(stringValue("outputMin")),
    inputModalities: stringValue("input")?.split(",").filter(Boolean),
    inputPriceMax: parseOptionalNumber(stringValue("inputPriceMax")),
    outputPriceMax: parseOptionalNumber(stringValue("outputPriceMax")),
    releaseFrom: stringValue("releaseFrom"),
    releaseTo: stringValue("releaseTo"),
    updatedFrom: stringValue("updatedFrom"),
    updatedTo: stringValue("updatedTo"),
    sort,
    direction,
  };
}
