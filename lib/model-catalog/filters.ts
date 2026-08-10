import type { ModelCatalogFilters } from "./types";

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
    query: stringValue("q") ?? stringValue("model"),
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
