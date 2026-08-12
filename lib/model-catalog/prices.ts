type CatalogPriceOffering = {
  providerId: string;
  inputPrice?: number | null;
  outputPrice?: number | null;
  status?: string | null;
};

export function summarizeNonZeroPrices<T extends CatalogPriceOffering>(
  offerings: T[],
) {
  const eligible = offerings.filter(
    (item) => item.status !== "alpha" && item.status !== "deprecated",
  );
  const minInput = eligible
    .filter(
      (item): item is T & { inputPrice: number } =>
        typeof item.inputPrice === "number" && item.inputPrice > 0,
    )
    .sort((left, right) => left.inputPrice! - right.inputPrice!)[0];
  const minOutput = eligible
    .filter(
      (item): item is T & { outputPrice: number } =>
        typeof item.outputPrice === "number" && item.outputPrice > 0,
    )
    .sort((left, right) => left.outputPrice! - right.outputPrice!)[0];

  return {
    minInput,
    minOutput,
    hasZeroInput: eligible.some((item) => item.inputPrice === 0),
    hasZeroOutput: eligible.some((item) => item.outputPrice === 0),
  };
}
