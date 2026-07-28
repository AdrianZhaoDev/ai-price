import { createHash } from "node:crypto";
import {
  CollectionError,
  type RawCollectionResult,
} from "@/lib/collectors/types";

type FetchPageOptions = {
  observedAt?: Date;
  signal?: AbortSignal;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  allowedStatuses?: number[];
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

export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<RawCollectionResult> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await fetch(url, {
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
      });
      const body = await response.text();

      if (!response.ok && !options.allowedStatuses?.includes(response.status)) {
        throw new CollectionError(
          "HTTP_ERROR",
          `Official source returned HTTP ${response.status}.`,
          { status: response.status, url },
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
          { url },
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
      if (attempt < attempts) {
        await delay((options.retryDelayMs ?? 750) * 2 ** (attempt - 1));
      }
    }
  }

  if (lastError instanceof CollectionError) throw lastError;
  throw new CollectionError(
    "FETCH_FAILED",
    lastError instanceof Error ? lastError.message : "Source request failed.",
    { url },
  );
}
