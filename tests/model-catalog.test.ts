import { describe, expect, it } from "vitest";
import { contentHash, normalizeCatalogFiles } from "@/lib/model-catalog/source";
import {
  catalogDateEnd,
  catalogDateStart,
  filterAndSortModelCatalog,
  parseModelCatalogFilters,
  parseOptionalNumber,
} from "@/lib/model-catalog/filters";
import { isSafeModelId, modelDetailPath } from "@/lib/model-catalog/paths";
import { sortModelProviderOfferings } from "@/lib/model-catalog/provider-sorting";
import { assertPlausibleCatalogSnapshot } from "@/lib/model-catalog/health";

const baseModel = `
name = "Atlas"
description = "base description"
family = "atlas"
release_date = "2026-01-01"
last_updated = "2026-02-01"
open_weights = false
reasoning = true
[modalities]
input = ["text"]
output = ["text"]
[limit]
context = 100000
output = 8000
`;

describe("models.dev catalog normalization", () => {
  it("rejects implausibly small snapshots before an initial import", () => {
    expect(() =>
      assertPlausibleCatalogSnapshot({
        models: 0,
        providers: 0,
        offerings: 0,
      }),
    ).toThrow("model count 0 is below the minimum 100");
    expect(() =>
      assertPlausibleCatalogSnapshot({
        models: 303,
        providers: 182,
        offerings: 3_237,
      }),
    ).not.toThrow();
  });

  it("links models and calculates independent non-zero minimum prices", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      [
        "models/provider/scoped.toml",
        baseModel.replace('name = "Atlas"', 'name = "Scoped"'),
      ],
      ["labs/lab/lab.toml", 'name = "Lab Inc."'],
      ["labs/provider/lab.toml", 'name = "Provider Lab"'],
      [
        "providers/provider/provider.toml",
        'name = "Provider One"\ndoc = "https://example.com/docs"',
      ],
      [
        "providers/cheap/provider.toml",
        'name = "Cheap Output"\ndoc = "https://cheap.example/docs"',
      ],
      [
        "providers/provider/models/lab/atlas.toml",
        "cost = { input = 0, output = 8 }",
      ],
      [
        "providers/cheap/models/served-atlas.toml",
        'base_model = "lab/atlas"\ncost = { input = 2, output = 3 }',
      ],
      [
        "providers/provider/models/scoped.toml",
        "cost = { input = 5, output = 9 }",
      ],
    ]);

    const catalog = normalizeCatalogFiles(
      files,
      "a".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    const atlas = catalog.models.find(
      (model) => model.summary.id === "lab/atlas",
    )!;
    const scoped = catalog.models.find(
      (model) => model.summary.id === "provider/scoped",
    )!;

    expect(atlas.providers).toHaveLength(2);
    expect(atlas.summary.minInputPrice).toBe(2);
    expect(atlas.summary.minInputProviderName).toBe("Cheap Output");
    expect(atlas.summary.minOutputPrice).toBe(3);
    expect(atlas.summary.minOutputProviderName).toBe("Cheap Output");
    expect(scoped.providers).toHaveLength(1);
    expect(catalog.unlinkedProviderModels).toBe(0);
    expect(
      filterAndSortModelCatalog(
        catalog.models.map((model) => model.summary),
        parseModelCatalogFilters({}),
      ).map((model) => model.id),
    ).toEqual(["lab/atlas", "provider/scoped"]);
    expect(
      filterAndSortModelCatalog(
        catalog.models.map((model) => model.summary),
        parseModelCatalogFilters({ hideZero: "0" }),
      ).map((model) => model.id),
    ).toEqual(["lab/atlas", "provider/scoped"]);
    expect(
      filterAndSortModelCatalog(
        catalog.models.map((model) => model.summary),
        parseModelCatalogFilters({
          hideZero: "0",
          sort: "price_output",
          direction: "desc",
        }),
      ).map((model) => model.id),
    ).toEqual(["provider/scoped", "lab/atlas"]);
    expect(
      atlas.providers.find((item) => item.providerId === "provider"),
    ).toMatchObject({
      inputPrice: 0,
    });
  });

  it("keeps all-zero provider prices in details but omits them from ranking minima", () => {
    const catalog = normalizeCatalogFiles(
      new Map<string, string>([
        ["models/lab/atlas.toml", baseModel],
        ["providers/free/provider.toml", 'name = "Free Provider"'],
        [
          "providers/free/models/atlas.toml",
          'base_model = "lab/atlas"\ncost = { input = 0, output = 0 }',
        ],
      ]),
      "a".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    const atlas = catalog.models[0]!;

    expect(atlas.summary.minInputPrice).toBeUndefined();
    expect(atlas.summary.minInputProviderName).toBeUndefined();
    expect(atlas.summary.minOutputPrice).toBeUndefined();
    expect(atlas.summary.minOutputProviderName).toBeUndefined();
    expect(atlas.providers).toEqual([
      expect.objectContaining({ inputPrice: 0, outputPrice: 0 }),
    ]);
  });

  it("sorts provider rows by the four numeric columns with missing values last", () => {
    const catalog = normalizeCatalogFiles(
      new Map<string, string>([
        ["models/lab/atlas.toml", baseModel],
        ["providers/a/provider.toml", 'name = "Provider A"'],
        ["providers/b/provider.toml", 'name = "Provider B"'],
        [
          "providers/a/models/atlas.toml",
          'base_model = "lab/atlas"\ncost = { input = 2, output = 8 }\n[limit]\ncontext = 100\noutput = 50',
        ],
        [
          "providers/b/models/atlas.toml",
          'base_model = "lab/atlas"\ncost = { input = 1, output = 9 }\n[limit]\ncontext = 200\noutput = 25',
        ],
      ]),
      "a".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    const providers = [
      ...catalog.models[0]!.providers,
      {
        ...catalog.models[0]!.providers[0]!,
        providerId: "missing",
        providerName: "Missing",
        inputPrice: undefined,
        outputPrice: undefined,
        context: undefined,
        output: undefined,
      },
    ];

    expect(
      sortModelProviderOfferings(providers).map((item) => item.providerName),
    ).toEqual(["Provider B", "Provider A", "Missing"]);
    expect(
      sortModelProviderOfferings(providers, "context", "desc").map(
        (item) => item.providerName,
      ),
    ).toEqual(["Provider B", "Provider A", "Missing"]);
    expect(
      sortModelProviderOfferings(providers, "output").map(
        (item) => item.providerName,
      ),
    ).toEqual(["Provider B", "Provider A", "Missing"]);
    expect(
      sortModelProviderOfferings(providers, "outputPrice", "desc").map(
        (item) => item.providerName,
      ),
    ).toEqual(["Provider B", "Provider A", "Missing"]);
  });

  it("applies base_model_omit before provider overrides and excludes alpha/deprecated offers from minima", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["labs/lab/lab.toml", 'name = "Lab Inc."'],
      ["providers/active/provider.toml", 'name = "Active"'],
      ["providers/alpha/provider.toml", 'name = "Alpha"'],
      ["providers/old/provider.toml", 'name = "Old"'],
      [
        "providers/active/models/atlas.toml",
        'base_model = "lab/atlas"\nbase_model_omit = ["description", "limit.output"]\ndescription = "provider override"\ncost = { input = 4, output = 6 }\n[limit]\noutput = 12000',
      ],
      [
        "providers/alpha/models/atlas.toml",
        'base_model = "lab/atlas"\nstatus = "alpha"\ncost = { input = 0, output = 0 }',
      ],
      [
        "providers/old/models/atlas.toml",
        'base_model = "lab/atlas"\nstatus = "deprecated"\ncost = { input = 1, output = 1 }',
      ],
    ]);

    const atlas = normalizeCatalogFiles(
      files,
      "b".repeat(40),
      "2026-08-10T00:00:00.000Z",
    ).models[0]!;
    expect(atlas.providers).toHaveLength(3);
    expect(
      atlas.providers.find((item) => item.providerId === "active"),
    ).toMatchObject({ output: 12000 });
    expect(atlas.summary.providerCount).toBe(1);
    expect(atlas.summary.minInputPrice).toBe(4);
    expect(atlas.summary.minOutputPrice).toBe(6);
  });

  it("produces stable hashes independent of object key order", () => {
    expect(contentHash({ a: 1, b: { c: 2 } })).toBe(
      contentHash({ b: { c: 2 }, a: 1 }),
    );
  });

  it("changes only the affected model hash when a provider price changes", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["providers/provider/provider.toml", 'name = "Provider"'],
      [
        "providers/provider/models/atlas.toml",
        'base_model = "lab/atlas"\ncost = { input = 1, output = 2 }',
      ],
    ]);
    const first = normalizeCatalogFiles(
      files,
      "a".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    files.set(
      "providers/provider/models/atlas.toml",
      'base_model = "lab/atlas"\ncost = { input = 1, output = 3 }',
    );
    const second = normalizeCatalogFiles(
      files,
      "b".repeat(40),
      "2026-08-10T04:00:00.000Z",
    );
    expect(second.models[0]?.contentHash).not.toBe(
      first.models[0]?.contentHash,
    );
    expect(second.contentHash).not.toBe(first.contentHash);
  });

  it("includes unlinked provider offering state in the catalog hash", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["providers/provider/provider.toml", 'name = "Provider"'],
      [
        "providers/provider/models/unlinked.toml",
        'name = "Unlinked A"\nrelease_date = "2026-01"\nlast_updated = "2026-01"\nopen_weights = false',
      ],
    ]);
    const first = normalizeCatalogFiles(
      files,
      "a".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    files.set(
      "providers/provider/models/unlinked.toml",
      'name = "Unlinked B"\nrelease_date = "2026-01"\nlast_updated = "2026-01"\nopen_weights = false',
    );
    const second = normalizeCatalogFiles(
      files,
      "b".repeat(40),
      "2026-08-10T04:00:00.000Z",
    );
    expect(first.unlinkedProviderModels).toBe(1);
    expect(second.unlinkedProviderModels).toBe(1);
    expect(second.contentHash).not.toBe(first.contentHash);
  });

  it("does not heuristically relink an invalid explicit base_model", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["providers/provider/provider.toml", 'name = "Provider"'],
      [
        "providers/provider/models/lab/atlas.toml",
        'base_model = "missing/model"\ncost = { input = 1, output = 2 }',
      ],
    ]);
    const catalog = normalizeCatalogFiles(
      files,
      "a".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    expect(catalog.models[0]?.providers).toHaveLength(0);
    expect(catalog.unlinkedProviderModels).toBe(1);
  });

  it("parses filter query strings and nested model paths safely", () => {
    expect(
      parseModelCatalogFilters({
        q: "gemini",
        lab: "google,openai",
        provider: "openrouter",
        contextMin: "100000",
        outputMin: "oops",
        input: "text,image",
        inputPriceMax: "0",
        releaseFrom: "2026-01-01",
        sort: "price_input",
        direction: "asc",
      }),
    ).toMatchObject({
      query: "gemini",
      labs: ["google", "openai"],
      providers: ["openrouter"],
      contextMin: 100000,
      outputMin: undefined,
      inputModalities: ["text", "image"],
      inputPriceMax: 0,
      releaseFrom: "2026-01-01",
      sort: "price_input",
      direction: "asc",
    });
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseModelCatalogFilters({})).toMatchObject({
      hideZeroPrice: true,
      sort: "price_input",
      direction: "asc",
    });
    expect(parseModelCatalogFilters({ hideZero: "0" })).toMatchObject({
      hideZeroPrice: false,
      sort: "price_input",
      direction: "asc",
    });
    expect(parseModelCatalogFilters({ model: "legacy-model" }).query).toBe(
      "legacy-model",
    );
    expect(catalogDateStart("2026-02")).toBe("2026-02-01");
    expect(catalogDateEnd("2026-02")).toBe("2026-02-28");
    expect(catalogDateStart("2026-02-14")).toBe("2026-02-14");
    expect(catalogDateEnd("2026-02-14")).toBe("2026-02-14");
    expect(modelDetailPath("lab/family/model+v1")).toBe(
      "/models/lab/family/model%2Bv1",
    );
    expect(isSafeModelId("lab/family/model+v1")).toBe(true);
    expect(isSafeModelId("../secret")).toBe(false);
    expect(isSafeModelId("single-segment")).toBe(false);
  });

  it("retains unlinked provider models as a diagnostic count", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["providers/provider/provider.toml", 'name = "Provider"'],
      [
        "providers/provider/models/unknown.toml",
        'name = "Unknown"\nrelease_date = "2026-01-01"\nlast_updated = "2026-01-01"\nopen_weights = false',
      ],
    ]);
    const catalog = normalizeCatalogFiles(
      files,
      "c".repeat(40),
      "2026-08-10T00:00:00.000Z",
    );
    expect(catalog.unlinkedProviderModels).toBe(1);
    expect(catalog.models[0]?.summary.labName).toBe("Lab");
  });

  it("rejects provider offerings without provider metadata", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["providers/missing/models/atlas.toml", 'base_model = "lab/atlas"'],
    ]);
    expect(() =>
      normalizeCatalogFiles(files, "d".repeat(40), "2026-08-10T00:00:00.000Z"),
    ).toThrow("Provider metadata is missing");
  });

  it("blocks overlay collisions unless an override reason is explicit", () => {
    const files = new Map<string, string>([
      ["models/lab/atlas.toml", baseModel],
      ["labs/lab/lab.toml", 'name = "Lab Inc."'],
    ]);
    const overlay = {
      labs: [{ id: "lab", name: "Local Lab" }],
      providers: [],
      models: [],
      offerings: [],
    };
    expect(() =>
      normalizeCatalogFiles(
        files,
        "e".repeat(40),
        "2026-08-10T00:00:00.000Z",
        overlay,
      ),
    ).toThrow("override and reason are required");
    expect(
      normalizeCatalogFiles(files, "e".repeat(40), "2026-08-10T00:00:00.000Z", {
        ...overlay,
        labs: [
          {
            id: "lab",
            name: "Local Lab",
            override: true,
            reason: "Correct legal name",
          },
        ],
      }).labs.find((lab) => lab.id === "lab"),
    ).toMatchObject({ name: "Local Lab", origin: "local_overlay" });
  });
});
