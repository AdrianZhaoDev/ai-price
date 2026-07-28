import { createHash } from "node:crypto";
import { ProxyAgent } from "undici";
import {
  CollectionError,
  type RawCollectionResult,
} from "@/lib/collectors/types";
import {
  diagnosticValue,
  errorDiagnosticDetails,
  sanitizeDiagnosticUrl,
} from "@/lib/collectors/diagnostics";

type FetchPageOptions = {
  observedAt?: Date;
  signal?: AbortSignal;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  allowedStatuses?: number[];
  proxyUrl?: string | null;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function responseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function diagnosticHeaders(headers: Headers): Record<string, string> {
  const allowed = [
    "content-type",
    "content-length",
    "server",
    "retry-after",
    "location",
    "cf-ray",
    "x-request-id",
  ];
  return Object.fromEntries(
    allowed
      .map((name) => [name, headers.get(name)] as const)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([name, value]) => [
        name,
        name === "location"
          ? sanitizeDiagnosticUrl(value)
          : String(diagnosticValue(value)),
      ]),
  );
}

export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<RawCollectionResult> {
  const attempts = Math.max(1, Math.min(5, Math.trunc(options.attempts ?? 3)));
  const proxyUrl =
    options.proxyUrl === undefined
      ? process.env.COLLECTOR_PROXY_URL?.trim() || null
      : options.proxyUrl?.trim() || null;
  const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
  let lastError: unknown;
  const attemptFailures: Array<Record<string, unknown>> = [];

  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      const useProxy = Boolean(proxyAgent && attempt === 1);

      try {
        const requestInit: RequestInit & { dispatcher?: ProxyAgent } = {
          headers: {
            accept: "text/html,application/xhtml+xml,application/json",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
            "cache-control": "no-cache",
            "user-agent":
              "AIPriceAtlas/0.1 (+https://github.com/ai-price-atlas; public-price-monitor)",
            ...options.headers,
          },
          redirect: "follow",
          signal,
        };
        if (useProxy && proxyAgent) {
          requestInit.dispatcher = proxyAgent;
        }
        const response = await fetch(url, requestInit);
        const body = await response.text();

        if (
          !response.ok &&
          !options.allowedStatuses?.includes(response.status)
        ) {
          throw new CollectionError(
            "HTTP_ERROR",
            `Official source returned HTTP ${response.status}.`,
            {
              status: response.status,
              statusText: response.statusText,
              url: sanitizeDiagnosticUrl(url),
              responseUrl: sanitizeDiagnosticUrl(response.url || url),
              responseHeaders: diagnosticHeaders(response.headers),
              responseBodyPreview: diagnosticValue(body.slice(0, 4_000)),
            },
          );
        }

        const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
        if (
          body.length < 100_000 &&
          /captcha|访问验证|人机验证|verify you are human/i.test(title)
        ) {
          throw new CollectionError(
            "ACCESS_BLOCKED",
            "Official source returned an access challenge.",
            {
              status: response.status,
              url: sanitizeDiagnosticUrl(url),
              responseUrl: sanitizeDiagnosticUrl(response.url || url),
              responseHeaders: diagnosticHeaders(response.headers),
              responseTitle: diagnosticValue(title),
              responseBodyPreview: diagnosticValue(body.slice(0, 4_000)),
            },
          );
        }

        return {
          sourceUrl: response.url || url,
          status: response.status,
          headers: responseHeaders(response.headers),
          body,
          contentHash: hashContent(body),
          observedAt: (options.observedAt ?? new Date()).toISOString(),
        };
      } catch (error) {
        lastError = error;
        attemptFailures.push({
          attempt,
          attemptedAt: new Date(attemptStartedAt).toISOString(),
          durationMs: Date.now() - attemptStartedAt,
          route: useProxy ? "proxy" : "direct",
          error: errorDiagnosticDetails(error),
        });
        const retryable =
          useProxy ||
          !(error instanceof CollectionError) ||
          (error.code === "HTTP_ERROR" &&
            (Number(error.details.status) === 429 ||
              Number(error.details.status) >= 500));
        if (attempt < attempts && retryable) {
          await delay((options.retryDelayMs ?? 750) * 2 ** (attempt - 1));
        } else if (!retryable) {
          break;
        }
      }
    }

    if (lastError instanceof CollectionError) {
      throw new CollectionError(lastError.code, lastError.message, {
        ...lastError.details,
        attempts: attemptFailures,
      });
    }
    throw new CollectionError(
      "FETCH_FAILED",
      lastError instanceof Error ? lastError.message : "Source request failed.",
      {
        url: sanitizeDiagnosticUrl(url),
        proxyConfigured: Boolean(proxyUrl),
        attempts: attemptFailures,
        finalError: errorDiagnosticDetails(lastError),
      },
    );
  } finally {
    await proxyAgent?.close();
  }
}
