import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminChallenge,
  createAdminSession,
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
});
