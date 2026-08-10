import type { ModelCatalogFilters } from "./types";

export function parseOptionalNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  return {
    query: stringValue("q"),
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
    sort: validSorts.has(
      requestedSort as NonNullable<ModelCatalogFilters["sort"]>,
    )
      ? (requestedSort as NonNullable<ModelCatalogFilters["sort"]>)
      : "release",
    direction: requestedDirection === "asc" ? "asc" : "desc",
  };
}
