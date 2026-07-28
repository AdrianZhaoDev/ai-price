import { config } from "dotenv";
import { ensureSource } from "@/lib/collectors/persistence";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import { closeDatabase, isDatabaseConfigured } from "@/lib/db/client";

config({ path: [".env.local", ".env"] });

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required for npm run seed.");
  }
  const adapters = createCollectorRegistry();
  for (const adapter of adapters) {
    await ensureSource(adapter);
  }
  console.log(`Seeded ${adapters.length} official price sources.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
