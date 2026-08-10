import { config } from "dotenv";
import { closeDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { syncModelsDevCatalog } from "@/lib/model-catalog/sync";

config({ path: [".env.local", ".env"] });

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required to persist the model catalog.");
  }
  const result = await syncModelsDevCatalog();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
