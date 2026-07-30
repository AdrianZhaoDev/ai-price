import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminChallenge,
  createAdminSession,
  isSameOriginRequest,
  isAdminSession,
  verifyAdminChallenge,
} from "@/lib/admin/auth";

describe("admin authentication tokens", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_TOKEN_SECRET", "a".repeat(32));
  });

  it("accepts the correct code once it is signed and unexpired", () => {
    const challenge = createAdminChallenge("123456", 1_000);
    expect(verifyAdminChallenge("123456", challenge, 2_000)).toBe(true);
    expect(verifyAdminChallenge("123456", challenge, 2_000)).toBe(false);

    const secondChallenge = createAdminChallenge("123456", 1_000);
    expect(verifyAdminChallenge("654321", secondChallenge, 2_000)).toBe(false);
    expect(verifyAdminChallenge("123456", secondChallenge, 700_000)).toBe(
      false,
    );
  });

  it("rejects tampered and expired sessions", () => {
    const session = createAdminSession(1_000);
    expect(isAdminSession(session, 2_000)).toBe(true);
    expect(isAdminSession(`${session}x`, 2_000)).toBe(false);
    expect(isAdminSession(session, 50_000_000)).toBe(false);
  });

  it("validates the public origin behind a trusted reverse proxy", () => {
    const request = new Request(
      "http://127.0.0.1:3100/api/admin/auth/request",
      {
        method: "POST",
        headers: {
          host: "lowpriceradar.com",
          origin: "https://lowpriceradar.com",
          "x-forwarded-proto": "https",
        },
      },
    );
    expect(isSameOriginRequest(request)).toBe(true);

    const crossOriginRequest = new Request(request, {
      headers: {
        host: "lowpriceradar.com",
        origin: "https://example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginRequest(crossOriginRequest)).toBe(false);
  });
});
