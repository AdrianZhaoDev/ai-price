import { getDataSyncConfig } from "@/lib/sync/config";
import { syncPostgresqlData } from "@/lib/sync/postgresql";
import type { DataSyncResult, DataSyncTableCounts } from "@/lib/sync/types";

type SyncDependencies = {
  syncPostgresqlData: (targetUrl: string) => Promise<DataSyncTableCounts>;
};

const defaultDependencies: SyncDependencies = {
  syncPostgresqlData,
};

export async function runConfiguredDataSync(
  dependencies: SyncDependencies = defaultDependencies,
): Promise<DataSyncResult | null> {
  const config = getDataSyncConfig();
  if (!config) return null;

  const startedAt = new Date();
  const counts = await dependencies.syncPostgresqlData(config.targetUrl);
  const finishedAt = new Date();

  return {
    channel: config.channel,
    target: config.target,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    counts,
  };
}

export function dataSyncErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown data sync failure.";
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DIRECT_DATABASE_URL,
    process.env.LOCAL_DATABASE_URL,
    process.env.REMOTE_DATABASE_URL,
    process.env.DATA_SYNC_TARGET_URL,
  ].filter((value): value is string => Boolean(value));

  let redactedMessage = message;
  for (const configuredUrl of configuredUrls) {
    redactedMessage = redactedMessage.replaceAll(configuredUrl, "[redacted]");
    try {
      const parsed = new URL(configuredUrl);
      for (const sensitiveValue of [parsed.password, parsed.username]) {
        if (sensitiveValue) {
          redactedMessage = redactedMessage.replaceAll(
            sensitiveValue,
            "[redacted]",
          );
        }
      }
    } catch {
      // The complete configured value was already redacted above.
    }
  }
  return redactedMessage;
}
