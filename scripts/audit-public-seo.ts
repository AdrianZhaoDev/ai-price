import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  auditPublicSeo,
  renderPublicSeoAuditMarkdown,
} from "@/lib/public-seo-audit";

function argument(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

async function writeOutput(
  path: string | undefined,
  body: string,
): Promise<void> {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

async function main() {
  const summary = await auditPublicSeo({
    baseUrl: argument("base-url") ?? "https://lowpriceradar.com",
    concurrency: positiveInteger(argument("concurrency"), 3),
    timeoutMs: positiveInteger(argument("timeout-ms"), 10_000),
    minimumUrls: nonNegativeInteger(argument("minimum-urls"), 700),
  });
  await writeOutput(
    argument("output"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeOutput(
    argument("markdown"),
    renderPublicSeoAuditMarkdown(summary),
  );
  console.log(
    JSON.stringify({
      sitemapUrls: summary.sitemapUrls,
      sitemapDocuments: summary.sitemapDocuments,
      minimumUrls: summary.minimumUrls,
      siteIssues: summary.siteIssues,
      ok: summary.ok,
      failed: summary.failed,
      incomplete: summary.incomplete,
    }),
  );
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
