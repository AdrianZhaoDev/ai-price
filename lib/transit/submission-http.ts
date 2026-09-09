import { NextRequest } from "next/server";

export function isAllowedTransitSubmissionOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const expected = new URL(process.env.APP_URL || request.url);
  if (origin === expected.origin) return true;
  try {
    const incoming = new URL(origin);
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    return Boolean(
      process.env.NODE_ENV !== "production" &&
      loopback.includes(expected.hostname) &&
      loopback.includes(incoming.hostname) &&
      incoming.protocol === expected.protocol &&
      incoming.port === expected.port,
    );
  } catch {
    return false;
  }
}

export function transitSubmissionClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function readTransitSubmissionJson(
  request: NextRequest,
): Promise<unknown | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return null;
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
