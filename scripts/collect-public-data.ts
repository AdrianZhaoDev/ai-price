import { config } from "dotenv";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import {
  fetchPublicSnapshot,
  MAX_SNAPSHOT_BYTES,
  readBoundedJson,
} from "@/lib/public-data/fetch";
import { closeDatabase } from "@/lib/db/client";
import {
  publishChannelSnapshot,
  publishTransitSnapshot,
} from "@/lib/public-data/persistence";
import {
  isPublicHttpUrl,
  parsePublicSnapshot,
  type ChannelSnapshot,
  type TransitSnapshot,
} from "@/lib/public-data/snapshot";
import {
  isPrivateOrReservedHostname,
  parseSafePublicHttpUrl,
} from "@/lib/public-data/urls";

config({ path: [".env.local", ".env"] });

type Domain = "channels" | "transit";

function argumentValue(name: string): string | undefined {
  return process.argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}

function requestedDomains(): Domain[] {
  const value = (
    argumentValue("--domain") ??
    process.env.PUBLIC_DATA_DOMAIN ??
    "all"
  ).toLowerCase();
  if (value === "all") return ["channels", "transit"];
  if (value === "channels" || value === "transit") return [value];
  throw new Error("--domain must be channels, transit, or all.");
}

function snapshotUrl(domain: Domain): string | undefined {
  const value =
    domain === "channels"
      ? process.env.PUBLIC_CHANNELS_SNAPSHOT_URL
      : process.env.PUBLIC_TRANSIT_SNAPSHOT_URL;
  return value?.trim() || undefined;
}

function snapshotFile(domain: Domain): string | undefined {
  const value =
    domain === "channels"
      ? process.env.PUBLIC_CHANNELS_SNAPSHOT_FILE
      : process.env.PUBLIC_TRANSIT_SNAPSHOT_FILE;
  return value?.trim() || undefined;
}

function validateSnapshotUrl(raw: string): URL {
  if (!isPublicHttpUrl(raw) || !parseSafePublicHttpUrl(raw)) {
    throw new Error("Snapshot URL must use http or https.");
  }
  const url = new URL(raw);
  if (
    url.protocol !== "https:" &&
    process.env.PUBLIC_DATA_ALLOW_HTTP !== "true"
  ) {
    throw new Error("Snapshot fetches require HTTPS.");
  }
  const allowedHosts = (process.env.PUBLIC_DATA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
  if (
    allowedHosts.length > 0 &&
    !allowedHosts.includes(url.hostname.toLocaleLowerCase("en-US"))
  ) {
    throw new Error(
      "Snapshot host is not included in PUBLIC_DATA_ALLOWED_HOSTS.",
    );
  }
  return url;
}

function safeTargetLabel(url: URL): string {
  return url.hostname;
}

function validateDatabaseUrl(raw: string): void {
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("PUBLIC_DATA_DATABASE_URL must be a PostgreSQL URL.");
    }
    if (
      isPrivateOrReservedHostname(url.hostname) &&
      process.env.PUBLIC_DATA_ALLOW_LOCAL_DB !== "true"
    ) {
      throw new Error(
        "PUBLIC_DATA_DATABASE_URL must target a remote public-data database.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /PUBLIC_DATA_DATABASE_URL/.test(error.message)
    ) {
      throw error;
    }
    throw new Error("PUBLIC_DATA_DATABASE_URL must be a valid PostgreSQL URL.");
  }
}

async function readSnapshotFromUrl(rawUrl: string): Promise<unknown> {
  const url = validateSnapshotUrl(rawUrl);
  return fetchPublicSnapshot(url);
}

async function readSnapshot(domain: Domain): Promise<unknown> {
  const file = snapshotFile(domain);
  if (file) {
    if ((await stat(file)).size > MAX_SNAPSHOT_BYTES)
      throw new Error("Snapshot file is too large.");
    return readBoundedJson(createReadStream(file));
  }
  const url = snapshotUrl(domain);
  if (!url) {
    throw new Error(
      `No ${domain} snapshot configured. Set PUBLIC_${domain.toUpperCase()}_SNAPSHOT_URL or _FILE.`,
    );
  }
  return readSnapshotFromUrl(url);
}

async function publishDomain(domain: Domain): Promise<unknown> {
  const raw = await readSnapshot(domain);
  const snapshot = parsePublicSnapshot(domain, raw);
  if (domain === "channels") {
    return publishChannelSnapshot(snapshot as ChannelSnapshot);
  }
  return publishTransitSnapshot(snapshot as TransitSnapshot);
}

async function main(): Promise<void> {
  // The collector must never silently fall back to DATABASE_URL/LOCAL_DATABASE_URL:
  // a scheduled GitHub job should only write the explicitly designated public
  // snapshot database.  The web reader may still use its documented fallback.
  if (!process.env.PUBLIC_DATA_DATABASE_URL?.trim()) {
    throw new Error(
      "PUBLIC_DATA_DATABASE_URL is required for public-data collection.",
    );
  }
  validateDatabaseUrl(process.env.PUBLIC_DATA_DATABASE_URL);
  const domains = requestedDomains();
  const configured = domains.filter(
    (domain) => snapshotUrl(domain) || snapshotFile(domain),
  );
  if (configured.length === 0) {
    throw new Error(
      "At least one public snapshot URL/file must be configured for the requested domain.",
    );
  }
  const trigger = argumentValue("--trigger") ?? "manual";
  const results: Record<string, unknown> = { trigger };
  let failed = false;
  for (const domain of configured) {
    try {
      const target = snapshotUrl(domain);
      if (target) {
        const safe = validateSnapshotUrl(target);
        console.log(
          `Importing ${domain} snapshot from ${safeTargetLabel(safe)}.`,
        );
      } else {
        console.log(
          `Importing ${domain} snapshot from a configured local file.`,
        );
      }
      results[domain] = await publishDomain(domain);
    } catch {
      // Driver errors can include SQL parameters. Never log the raw error.
      results[domain] = {
        published: false,
        error:
          "Collection failed; previous snapshot retained. Check source, schema, and database configuration.",
      };
      failed = true;
    }
  }
  console.log(JSON.stringify(results, null, 2));
  if (failed) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error(
      "Public data collection failed. Check the configured source and database; sensitive diagnostics are suppressed.",
    );
    process.exitCode = 1;
  })
  .finally(closeDatabase);
