import { describe, expect, it } from "vitest";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import { providerCatalog } from "@/lib/data/catalog";

const EXPECTED_SOURCE_COUNT = 219;

describe("collector registry baseline", () => {
  it("registers exactly 219 uniquely identified sources", () => {
    const adapters = createCollectorRegistry();
    const ids = adapters.map((adapter) => adapter.id);

    expect(adapters).toHaveLength(EXPECTED_SOURCE_COUNT);
    expect(new Set(ids).size).toBe(EXPECTED_SOURCE_COUNT);
  });

  it("keeps seeded catalog providers and registry providers aligned", () => {
    const adapters = createCollectorRegistry();
    const catalogIds = providerCatalog.map((item) => item.id);
    const registryProviderIds = new Set(
      adapters.map((adapter) => adapter.providerSlug),
    );
    const catalogProviderIds = new Set(catalogIds);

    expect(catalogProviderIds.size).toBe(catalogIds.length);
    expect(registryProviderIds).toEqual(catalogProviderIds);
    expect(
      adapters.every(
        (adapter) =>
          adapter.sourceUrl.startsWith("https://") &&
          adapter.parserVersion.length > 0,
      ),
    ).toBe(true);
  });
});
