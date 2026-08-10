import type { ModelProviderOffering } from "./types";

export type ModelProviderSortKey =
  "context" | "output" | "inputPrice" | "outputPrice";

export function sortModelProviderOfferings(
  providers: ModelProviderOffering[],
  sort: ModelProviderSortKey = "inputPrice",
  direction: "asc" | "desc" = "asc",
): ModelProviderOffering[] {
  return [...providers].sort((left, right) => {
    const leftValue = left[sort];
    const rightValue = right[sort];
    if (leftValue === undefined) return rightValue === undefined ? 0 : 1;
    if (rightValue === undefined) return -1;
    const difference = leftValue - rightValue;
    return (
      difference * (direction === "asc" ? 1 : -1) ||
      left.providerName.localeCompare(right.providerName)
    );
  });
}
