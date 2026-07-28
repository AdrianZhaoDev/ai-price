export type DataSyncChannel = "neon" | "postgresql";

export type DataSyncConfig = {
  enabled: boolean;
  channel: DataSyncChannel;
  target: string;
  targetUrl: string;
};

function enabledValue(value: string | undefined): boolean {
  if (!value) return false;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error('DATA_SYNC_ENABLED must be "true" or "false".');
}

export function getDataSyncConfig(
  env: Record<string, string | undefined> = process.env,
): DataSyncConfig | null {
  if (!enabledValue(env.DATA_SYNC_ENABLED?.trim().toLowerCase())) return null;

  const channel = env.DATA_SYNC_CHANNEL?.trim().toLowerCase();
  if (channel !== "neon" && channel !== "postgresql") {
    throw new Error(
      'DATA_SYNC_CHANNEL must be "neon" or "postgresql" when sync is enabled.',
    );
  }

  const target = env.DATA_SYNC_TARGET?.trim();
  if (!target || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(target)) {
    throw new Error(
      "DATA_SYNC_TARGET must be a short identifier using letters, numbers, _ or -.",
    );
  }

  const targetUrl = env.DATA_SYNC_TARGET_URL?.trim();
  if (!targetUrl) {
    throw new Error(
      "DATA_SYNC_TARGET_URL is required when data sync is enabled.",
    );
  }

  return {
    enabled: true,
    channel,
    target,
    targetUrl,
  };
}
