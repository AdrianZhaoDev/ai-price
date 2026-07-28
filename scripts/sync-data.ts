import { config } from "dotenv";
import { closeDatabase } from "@/lib/db/client";
import { dataSyncErrorMessage, runConfiguredDataSync } from "@/lib/sync";

config({ path: [".env.local", ".env"] });

async function main() {
  const result = await runConfiguredDataSync();
  if (!result) {
    console.log("Data sync is disabled.");
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(`Data sync failed: ${dataSyncErrorMessage(error)}`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
