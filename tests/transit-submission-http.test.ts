// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  isAllowedTransitSubmissionOrigin,
  readTransitSubmissionJson,
  transitSubmissionClientIp,
} from "@/lib/transit/submission-http";

function request(
  headers: Record<string, string> = {},
  body?: string,
  url = "https://lowpriceradar.com/api/transit/submissions",
) {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("transit submission request guards", () => {
  it("accepts absent and exact origins", () => {
    vi.stubEnv("APP_URL", "https://lowpriceradar.com");
    expect(isAllowedTransitSubmissionOrigin(request())).toBe(true);
    expect(
      isAllowedTransitSubmissionOrigin(
        request({ origin: "https://lowpriceradar.com" }),
      ),
    ).toBe(true);
  });

  it("only accepts equivalent loopback origins in development", () => {
    vi.stubEnv("APP_URL", "http://localhost:3100");
    vi.stubEnv("NODE_ENV", "development");
    expect(
      isAllowedTransitSubmissionOrigin(
        request(
          { origin: "http://127.0.0.1:3100" },
          undefined,
          "http://localhost:3100/api",
        ),
      ),
    ).toBe(true);
    for (const origin of [
      "http://127.0.0.1:3101",
      "https://127.0.0.1:3100",
      "https://elsewhere.example",
      "not a url",
    ]) {
      expect(
        isAllowedTransitSubmissionOrigin(
          request({ origin }, undefined, "http://localhost:3100/api"),
        ),
      ).toBe(false);
    }
    vi.stubEnv("NODE_ENV", "production");
    expect(
      isAllowedTransitSubmissionOrigin(
        request(
          { origin: "http://127.0.0.1:3100" },
          undefined,
          "http://localhost:3100/api",
        ),
      ),
    ).toBe(false);
  });

  it("uses trusted proxy headers in precedence order", () => {
    expect(
      transitSubmissionClientIp(
        request({
          "cf-connecting-ip": " 192.0.2.1 ",
          "x-forwarded-for": "192.0.2.2, 192.0.2.3",
          "x-real-ip": "192.0.2.4",
        }),
      ),
    ).toBe("192.0.2.1");
    expect(
      transitSubmissionClientIp(
        request({ "x-forwarded-for": "192.0.2.2, 192.0.2.3" }),
      ),
    ).toBe("192.0.2.2");
    expect(
      transitSubmissionClientIp(request({ "x-real-ip": "192.0.2.4" })),
    ).toBe("192.0.2.4");
    expect(transitSubmissionClientIp(request())).toBe("unknown");
  });

  it("reads bounded JSON bodies and rejects malformed requests", async () => {
    expect(
      await readTransitSubmissionJson(
        request({ "Content-Type": "application/json" }, '{"ok":true}'),
      ),
    ).toEqual({ ok: true });
    expect(
      await readTransitSubmissionJson(request({}, '{"ok":true}')),
    ).toBeNull();
    expect(
      await readTransitSubmissionJson(
        request({ "Content-Type": "application/json" }, "not json"),
      ),
    ).toBeNull();
    expect(
      await readTransitSubmissionJson(
        request({ "Content-Type": "application/json" }, "x".repeat(8193)),
      ),
    ).toBeNull();
    expect(
      await readTransitSubmissionJson(
        request({ "Content-Type": "application/json" }),
      ),
    ).toBeNull();
  });
});
