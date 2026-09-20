type ErrorRecord = {
  name?: unknown;
  code?: unknown;
  cause?: unknown;
  message?: unknown;
  table?: unknown;
  column?: unknown;
  constraint?: unknown;
  table_name?: unknown;
  column_name?: unknown;
  constraint_name?: unknown;
  routine?: unknown;
};

export type SafeCollectionError = {
  kind:
    | "application"
    | "configuration"
    | "database"
    | "network"
    | "runtime"
    | "schema"
    | "unknown";
  name?: string;
  code?: string;
  table?: string;
  column?: string;
  constraint?: string;
  routine?: string;
  reason?: string;
};

const APP_ERROR_REASONS: Array<[RegExp, string]> = [
  [/^Source generation /, "source-generation-gate"],
  [/^Source endpoint changed/, "source-endpoint-guard"],
  [/^Original station identity changed/, "source-identity-guard"],
  [/^Original snapshot is stale/, "source-freshness-guard"],
  [
    /^(Incomplete original merchant catalogue|Original currency|Reviewed merchant SKU changed|Unknown reviewed merchant source)/,
    "source-integrity-guard",
  ],
  [/^Bulk (price currency|tier identity overlap)/, "channel-integrity-gate"],
  [
    /^(PUBLIC_DATA_DATABASE_URL|--domain must|At least one public snapshot|Direct sources and imported|Snapshot (URL|fetches|host)|No .* snapshot configured|Select unique reviewed direct source IDs|Unknown direct source ID)/,
    "configuration",
  ],
  [/^Snapshot host must resolve only/, "configuration"],
  [/^Snapshot (is older|conflicts)/, "generation-order-gate"],
  [/^Snapshot generation is stale/, "snapshot-freshness-gate"],
  [
    /^(Combined snapshot exceeds|Snapshot exceeds the response size limit|Snapshot file is too large)/,
    "snapshot-size-gate",
  ],
  [/^Price anomaly exceeds/, "price-stability-gate"],
  [
    /^Channel (snapshot|price|source|merchant|product|offer)/,
    "channel-integrity-gate",
  ],
  [
    /^Transit (snapshot|price|source|station|offer|availability)/,
    "transit-integrity-gate",
  ],
  [/^Offer (source|stable) identity/, "offer-identity-gate"],
  [/^Offer identity overlap collapsed/, "offer-integrity-gate"],
  [/^Snapshot request failed\.$/, "source-request"],
  [/^unexpected redirect$/i, "source-request"],
  [/^Original source /, "source-parser"],
  [/^(Request|Token) price is incomplete/, "source-parser"],
  [/^Token model contains request image prices/, "source-parser"],
  [/^Image size /, "source-parser"],
  [/^Duplicate original offer/, "source-parser"],
];

function record(value: unknown): ErrorRecord {
  return value !== null && typeof value === "object"
    ? (value as ErrorRecord)
    : {};
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(value)
    ? value
    : undefined;
}

function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9A-Z]{5}$/.test(value)
    ? value
    : undefined;
}

function rawCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z0-9_]{2,32}$/.test(value)
    ? value
    : undefined;
}

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ETIMEDOUT",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const FILE_CODES = new Set([
  "EACCES",
  "EISDIR",
  "ENOENT",
  "ENOTDIR",
  "EPERM",
  "EROFS",
]);

const RESOURCE_CODES = new Set(["EMFILE", "ENFILE"]);

function applicationReason(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return APP_ERROR_REASONS.find(([pattern]) => pattern.test(value))?.[1];
}

export function summarizeCollectionError(error: unknown): SafeCollectionError {
  const outer = record(error);
  const cause = record(outer.cause);
  const name = safeIdentifier(outer.name) ?? safeIdentifier(cause.name);
  const postgresError =
    cause.name === "PostgresError" || name === "PostgresError";
  const code = postgresError
    ? (safeCode(cause.code) ?? safeCode(outer.code))
    : undefined;
  const causeCode = rawCode(cause.code);
  const outerCode = rawCode(outer.code);
  const networkCode =
    causeCode && NETWORK_CODES.has(causeCode)
      ? causeCode
      : outerCode && NETWORK_CODES.has(outerCode)
        ? outerCode
        : undefined;
  const fileCode =
    causeCode && FILE_CODES.has(causeCode)
      ? causeCode
      : outerCode && FILE_CODES.has(outerCode)
        ? outerCode
        : undefined;
  const resourceCode =
    causeCode && RESOURCE_CODES.has(causeCode)
      ? causeCode
      : outerCode && RESOURCE_CODES.has(outerCode)
        ? outerCode
        : undefined;
  const reason =
    applicationReason(outer.message) ?? applicationReason(cause.message);
  const message =
    (typeof outer.message === "string" && outer.message) ||
    (typeof cause.message === "string" && cause.message) ||
    "";
  const malformedJson =
    name === "SyntaxError" && /JSON|Unexpected (end|token)/.test(message);
  const networkReason = name === "TimeoutError" ? "source-timeout" : undefined;
  const result: SafeCollectionError = {
    kind: code
      ? "database"
      : networkCode || networkReason || reason === "source-request"
        ? "network"
        : resourceCode
          ? "runtime"
          : fileCode
            ? "configuration"
            : reason === "configuration"
              ? "configuration"
              : name === "ZodError" || malformedJson
                ? "schema"
                : reason
                  ? "application"
                  : name === "TypeError" || name === "ReferenceError"
                    ? "runtime"
                    : "unknown",
  };
  if (name) result.name = name;
  if (code ?? networkCode ?? resourceCode ?? fileCode)
    result.code = code ?? networkCode ?? resourceCode ?? fileCode;
  const fields: Record<
    "table" | "column" | "constraint" | "routine",
    readonly (keyof ErrorRecord)[]
  > = {
    table: ["table_name", "table"] as const,
    column: ["column_name", "column"] as const,
    constraint: ["constraint_name", "constraint"] as const,
    routine: ["routine"] as const,
  };
  for (const field of ["table", "column", "constraint", "routine"] as const) {
    const candidates = fields[field];
    const value = candidates
      .map(
        (candidate) =>
          safeIdentifier(cause[candidate]) ?? safeIdentifier(outer[candidate]),
      )
      .find(Boolean);
    if (value) result[field] = value;
  }
  if (
    reason ??
    networkReason ??
    (resourceCode ? "resource-exhaustion" : undefined) ??
    (malformedJson ? "malformed-json" : undefined) ??
    (fileCode ? "snapshot-file" : undefined)
  )
    result.reason =
      reason ??
      networkReason ??
      (resourceCode ? "resource-exhaustion" : undefined) ??
      (malformedJson ? "malformed-json" : undefined) ??
      (fileCode ? "snapshot-file" : undefined);
  return result;
}
