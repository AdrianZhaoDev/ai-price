import { config } from "dotenv";
import { createCollectorRegistry } from "@/lib/collectors/registry";
import { runCollectors } from "@/lib/collectors/runner";
import { closeDatabase, isDatabaseConfigured } from "@/lib/db/client";

config({ path: [".env.local", ".env"] });

async function main() {
  const requested = process.argv
    .find((argument) => argument.startsWith("--source="))
    ?.slice("--source=".length);
  const acceptPlanCountChange = process.argv.includes(
    "--accept-plan-count-change",
  );
  const registry = createCollectorRegistry();
  const adapters = requested
    ? registry.filter((adapter) => adapter.id.includes(requested))
    : registry;

  if (adapters.length === 0) {
    throw new Error(`No collector matched --source=${requested}.`);
  }
  if (
    acceptPlanCountChange &&
    (!requested || adapters.length !== 1 || adapters[0].id !== requested)
  ) {
    throw new Error(
      "--accept-plan-count-change requires one exact --source=<adapter-id>.",
    );
  }
  if (!isDatabaseConfigured()) {
    console.warn(
      "DATABASE_URL is not configured; running verification without persistence.",
    );
  }

  const summary = await runCollectors(adapters, {
    trigger: process.env.GITHUB_ACTIONS ? "github_actions" : "manual",
    concurrency: Number(process.env.COLLECTOR_CONCURRENCY ?? 5),
    onProgress: console.log,
    acceptPlanCountChange,
  });
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failureCount > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
