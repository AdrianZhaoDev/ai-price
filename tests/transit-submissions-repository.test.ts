// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTransitSubmissionsForTests,
  confirmTransitSubmissionVerification,
  createTransitSubmission,
  createTransitSubmissionCode,
  createTransitSubmissionVerification,
  markTransitSubmissionNotification,
  transitWebsiteKey,
} from "@/lib/transit/submissions";

const email = "owner@example.com";

async function verifiedChallenge(now: Date, code = "123456") {
  const id = await createTransitSubmissionVerification({ email, code, now });
  expect(
    await confirmTransitSubmissionVerification({ id, email, code, now }),
  ).toBe(true);
  return id;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("LOCAL_DATABASE_URL", "");
  vi.stubEnv("EMAIL_TOKEN_SECRET", "s".repeat(32));
  clearTransitSubmissionsForTests();
});

afterEach(() => vi.unstubAllEnvs());

describe("transit submission repository", () => {
  it("generates six-digit codes and groups equivalent website links", () => {
    expect(createTransitSubmissionCode()).toMatch(/^\d{6}$/);
    expect(transitWebsiteKey("http://www.Example.com/docs?a=1")).toBe(
      transitWebsiteKey("https://example.com/"),
    );
    expect(transitWebsiteKey("https://example.com./pricing")).toBe(
      transitWebsiteKey("https://example.com/"),
    );
    expect(transitWebsiteKey("https://api.example.com/")).not.toBe(
      transitWebsiteKey("https://example.com/"),
    );
  });

  it("expires challenges, binds them to an email and permits at most five checks", async () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const id = await createTransitSubmissionVerification({
      email,
      code: "123456",
      now,
    });
    expect(
      await confirmTransitSubmissionVerification({
        id,
        email: "other@example.com",
        code: "123456",
        now,
      }),
    ).toBe(false);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        await confirmTransitSubmissionVerification({
          id,
          email,
          code: "654321",
          now,
        }),
      ).toBe(false);
    }
    expect(
      await confirmTransitSubmissionVerification({
        id,
        email,
        code: "123456",
        now,
      }),
    ).toBe(false);

    const expired = await createTransitSubmissionVerification({
      email,
      code: "123456",
      now,
    });
    expect(
      await confirmTransitSubmissionVerification({
        id: expired,
        email,
        code: "123456",
        now: new Date(now.getTime() + 10 * 60 * 1000),
      }),
    ).toBe(false);
  });

  it("requires a verified one-time challenge and detects duplicate websites", async () => {
    const now = new Date("2026-09-09T00:00:00Z");
    const unverified = await createTransitSubmissionVerification({
      email,
      code: "123456",
      now,
    });
    expect(
      await createTransitSubmission({
        verificationId: unverified,
        email,
        websiteUrl: "https://example.com/",
        description: "Example",
        ipAddress: "192.0.2.1",
        now,
      }),
    ).toEqual({ status: "verification_required" });

    const id = await verifiedChallenge(now);
    const submitted = await createTransitSubmission({
      verificationId: id,
      email,
      websiteUrl: "https://www.example.com/docs",
      description: "Example",
      ipAddress: "192.0.2.2",
      now,
    });
    expect(submitted).toEqual(
      expect.objectContaining({
        status: "notification_required",
        submitterEmail: email,
        alreadySubmitted: false,
      }),
    );
    const duplicateId = await verifiedChallenge(now);
    const pendingDuplicate = await createTransitSubmission({
      verificationId: duplicateId,
      email,
      websiteUrl: "http://example.com/other",
      description: "Duplicate",
      ipAddress: "192.0.2.2",
      now,
    });
    expect(pendingDuplicate).toEqual(
      expect.objectContaining({
        status: "notification_required",
        submitterEmail: email,
        alreadySubmitted: true,
      }),
    );
    if (submitted.status === "notification_required") {
      await markTransitSubmissionNotification({
        submissionId: submitted.submissionId,
        status: "sent",
        now,
      });
    }
    expect(
      await createTransitSubmission({
        verificationId: duplicateId,
        email,
        websiteUrl: "http://example.com/other",
        description: "Duplicate",
        ipAddress: "192.0.2.4",
        now,
      }),
    ).toEqual({ status: "duplicate" });
    expect(
      await createTransitSubmission({
        verificationId: id,
        email,
        websiteUrl: "https://different.example.com/",
        description: "Different",
        ipAddress: "192.0.2.2",
        now,
      }),
    ).toEqual({ status: "verification_required" });
  });

  it("limits one IP to five submission attempts in five minutes", async () => {
    const now = new Date("2026-09-09T00:00:00Z");
    for (let index = 0; index < 5; index += 1) {
      const verificationId = await verifiedChallenge(now);
      expect(
        (
          await createTransitSubmission({
            verificationId,
            email,
            websiteUrl: `https://site-${index}.example.com/`,
            description: "Example",
            ipAddress: "192.0.2.50",
            now,
          })
        ).status,
      ).toBe("notification_required");
    }
    const limitedVerification = await verifiedChallenge(now);
    expect(
      await createTransitSubmission({
        verificationId: limitedVerification,
        email,
        websiteUrl: "https://limited.example.com/",
        description: "Example",
        ipAddress: "192.0.2.50",
        now,
      }),
    ).toEqual({ status: "rate_limited" });
    expect(
      await createTransitSubmission({
        verificationId: limitedVerification,
        email,
        websiteUrl: "https://after-window.example.com/",
        description: "Example",
        ipAddress: "192.0.2.50",
        now: new Date(now.getTime() + 5 * 60 * 1000),
      }),
    ).toEqual(expect.objectContaining({ status: "notification_required" }));
  });
});
