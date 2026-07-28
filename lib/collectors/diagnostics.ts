const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|signature/i;
const MAX_STRING_LENGTH = 8_000;
const MAX_DEPTH = 5;

export function redactDiagnosticText(value: string): string {
  let redacted = value;
  for (const secret of [
    process.env.SMTP_PASSWORD,
    process.env.EMAIL_TOKEN_SECRET,
    process.env.CRON_SECRET,
    process.env.DATABASE_URL,
    process.env.DIRECT_DATABASE_URL,
    process.env.LOCAL_DATABASE_URL,
    process.env.REMOTE_DATABASE_URL,
    process.env.DATA_SYNC_TARGET_URL,
  ]) {
    if (secret && secret.length >= 6) {
      redacted = redacted.replaceAll(secret, "[redacted]");
    }
  }
  redacted = redacted
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /((?:token|secret|password|passwd|api[-_]?key|signature|authorization)["']?\s*[:=]\s*["']?)[^&\s"',}<]+/gi,
      "$1[redacted]",
    )
    .replace(
      /([?&](?:token|secret|password|passwd|api[-_]?key|signature|authorization)=)[^&#\s]+/gi,
      "$1[redacted]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[redacted-jwt]",
    );
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : redacted;
}

export function sanitizeDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return redactDiagnosticText(url.toString());
  } catch {
    return redactDiagnosticText(value);
  }
}

export function diagnosticValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return redactDiagnosticText(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (depth >= MAX_DEPTH) return "[max depth]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    const extended = value as Error & Record<string, unknown>;
    const result: Record<string, unknown> = {
      name: value.name,
      message: redactDiagnosticText(value.message),
      ...(value.stack ? { stack: redactDiagnosticText(value.stack) } : {}),
    };
    for (const key of [
      "code",
      "errno",
      "syscall",
      "hostname",
      "address",
      "port",
      "cause",
      "details",
    ]) {
      if (extended[key] !== undefined) {
        result[key] = diagnosticValue(extended[key], depth + 1, seen);
      }
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => diagnosticValue(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 60)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? "[redacted]"
      : diagnosticValue(item, depth + 1, seen);
  }
  return result;
}

export function errorDiagnosticDetails(
  error: unknown,
): Record<string, unknown> {
  const details = diagnosticValue(error);
  return typeof details === "object" && details !== null
    ? (details as Record<string, unknown>)
    : { value: details };
}
