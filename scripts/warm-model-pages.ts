import { config } from "dotenv";
import { closeDatabase } from "@/lib/db/client";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import { loadModelCatalogSummaries } from "@/lib/model-catalog/repository";

config({ path: [".env.local", ".env"] });

async function main() {
  const baseUrl = process.env.MODEL_WARM_BASE_URL ?? "http://127.0.0.1:3100";
  const models = await loadModelCatalogSummaries();
  if (models.length === 0)
    throw new Error("No active model pages are available to warm.");
  const paths = [
    "/api-pricing",
    "/en/api-pricing",
    "/sitemap.xml",
    ...models.flatMap((model) => [
      modelDetailPath(model.id),
      modelDetailPath(model.id, "en"),
    ]),
  ];
  let warmed = 0;
  for (let index = 0; index < paths.length; index += 5) {
    await Promise.all(
      paths.slice(index, index + 5).map(async (path) => {
        const response = await fetch(new URL(path, baseUrl), {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok)
          throw new Error(`Warm failed for ${path}: HTTP ${response.status}`);
        warmed += 1;
      }),
    );
  }
  console.log(JSON.stringify({ warmed, modelCount: models.length }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
