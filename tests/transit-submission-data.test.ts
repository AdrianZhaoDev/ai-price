import { describe, expect, it } from "vitest";
import {
  decryptTransitSubmissionEmail,
  encryptTransitSubmissionEmail,
} from "@/lib/security/transit-submission-data";

describe("transit submission contact encryption", () => {
  it("round-trips without exposing the email", () => {
    const secret = "s".repeat(32);
    const encrypted = encryptTransitSubmissionEmail(
      "owner@example.com",
      secret,
    );
    expect(encrypted).not.toContain("owner@example.com");
    expect(decryptTransitSubmissionEmail(encrypted, secret)).toBe(
      "owner@example.com",
    );
  });

  it.each(["invalid", "v1.bad.bad.bad", "v2.a.b.c"])(
    "rejects malformed or tampered data",
    (value) => {
      expect(() =>
        decryptTransitSubmissionEmail(value, "s".repeat(32)),
      ).toThrow();
    },
  );
});
